<#
.SYNOPSIS
  Runs the daily Signals pipeline locally and pushes the result.

.DESCRIPTION
  The local equivalent of the parked GitHub Actions workflow, for running from
  Windows Task Scheduler overnight. Same three stages:

    fetch-signals.mjs      RSS feeds -> data/inbox.json     deterministic
    claude /daily-signals  inbox     -> data/signals.json   prose only
    render-signals.mjs     signals   -> signals.html, feed.xml, sitemap.xml,
                                        and the strip in index.html

  Claude never writes HTML. The render script validates every entry and fails
  rather than publishing a malformed one, so a bad generation costs a weak
  entry, not a broken page.

  Logs go to %LOCALAPPDATA%\TrinityResearch\signals-logs - deliberately outside
  the repo, so they are never committed or served from the public site.

.PARAMETER DryRun
  Do everything except commit and push, leaving changes in the working tree for
  inspection. Use this the first few times.

.PARAMETER Force
  Run the generation step even when no new items were found.

.PARAMETER TimeoutMinutes
  How long to let Claude run before killing it. Default 15.

.EXAMPLE
  .\scripts\run-signals.ps1 -DryRun
  .\scripts\run-signals.ps1
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Force,
  [int]$TimeoutMinutes = 15
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:LOCALAPPDATA 'TrinityResearch\signals-logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$log = Join-Path $logDir "signals_$stamp.log"

function Write-Log {
  param([string]$Message, [string]$Level = 'INFO')
  $line = "{0} [{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'), $Level, $Message
  # Write-Host, not Write-Output: this is called from inside Invoke-Native, and
  # Write-Output would put log lines on that function's pipeline where the
  # caller's `| Out-Null` silently swallows them.
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding utf8
}

# Native commands must not run under ErrorActionPreference='Stop' with 2>&1:
# in Windows PowerShell 5.1 each stderr line becomes a NativeCommandError, and
# git writes routine progress to stderr. This wrapper isolates that.
function Invoke-Native {
  param(
    [Parameter(Mandatory)][string]$File,
    [string[]]$Arguments = @(),
    [string]$Label = 'out',
    [switch]$Quiet
  )
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $File @Arguments 2>&1 | ForEach-Object { $_.ToString() }
    $script:NativeExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if (-not $Quiet) {
    foreach ($line in @($output)) {
      if ($line -and $line.Trim()) { Write-Log "  ${Label}: $line" }
    }
  }
  return @($output)
}

# Prune logs older than 30 days so this does not grow forever.
Get-ChildItem $logDir -Filter '*.log' -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

try {
  Set-Location $repo
  Write-Log "Repo: $repo"
  if ($DryRun) { Write-Log 'DRY RUN - will not commit or push' 'WARN' }

  # --- preflight -----------------------------------------------------------
  foreach ($exe in @('node', 'git', 'claude')) {
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
      throw "$exe is not on PATH. A scheduled task does not inherit your interactive PATH - see register-signals-task.ps1."
    }
  }

  $dirty = Invoke-Native git @('status', '--porcelain') -Quiet
  if ($dirty.Count -gt 0 -and -not $DryRun) {
    throw "Working tree is not clean. Refusing to run so nothing of yours is swept into an automated commit.`n$($dirty -join "`n")"
  }

  # --- 1. sync -------------------------------------------------------------
  Write-Log 'Pulling latest...'
  Invoke-Native git @('pull', '--ff-only') -Label 'git' | Out-Null
  if ($NativeExitCode -ne 0) { throw "git pull failed (exit $NativeExitCode). The branch may have diverged - resolve by hand." }

  # --- 2. fetch ------------------------------------------------------------
  Write-Log 'Fetching feeds...'
  Invoke-Native node @('scripts/fetch-signals.mjs') -Label 'fetch' | Out-Null
  if ($NativeExitCode -ne 0) { throw "fetch-signals.mjs failed (exit $NativeExitCode)" }

  # Counted via node, not ConvertFrom-Json: in Windows PowerShell 5.1
  # ConvertFrom-Json emits a JSON array as ONE object, so @(...).Count is 1
  # regardless of how many items are in the file.
  $inboxCount = [int](& node -e "console.log(JSON.parse(require('fs').readFileSync('data/inbox.json','utf8')).length)")
  Write-Log "Inbox holds $inboxCount item(s)."

  if ($inboxCount -eq 0 -and -not $Force) {
    Write-Log 'Nothing new in the window. Done.'
    exit 0
  }

  # --- 3. generate ---------------------------------------------------------
  $signalsPath = Join-Path $repo 'data\signals.json'
  $before = (Get-FileHash $signalsPath -Algorithm SHA256).Hash

  Write-Log "Running Claude on $inboxCount item(s) (timeout ${TimeoutMinutes}m)..."
  $outFile = Join-Path $logDir "claude_$stamp.out"
  $errFile = Join-Path $logDir "claude_$stamp.err"

  $claudeArgs = @(
    '-p', '/daily-signals',
    '--permission-mode', 'acceptEdits',
    '--allowed-tools', 'Read,Edit,Write,WebFetch',
    '--model', 'sonnet'
  )

  $proc = Start-Process -FilePath 'claude' -ArgumentList $claudeArgs -NoNewWindow -PassThru `
                        -RedirectStandardOutput $outFile -RedirectStandardError $errFile

  # Touching .Handle caches the process handle. Without this, Start-Process
  # -PassThru leaves .ExitCode null after the process ends and every run looks
  # like a failure.
  $null = $proc.Handle

  if (-not $proc.WaitForExit($TimeoutMinutes * 60 * 1000)) {
    try { $proc.Kill() } catch { }
    throw "Claude exceeded $TimeoutMinutes minutes and was killed. Nothing was published."
  }
  $proc.WaitForExit()   # ensures ExitCode is populated
  $claudeExit = $proc.ExitCode
  if ($null -eq $claudeExit) { throw 'Could not read claude exit code.' }

  foreach ($f in @($outFile, $errFile)) {
    if ((Test-Path $f) -and (Get-Item $f).Length -gt 0) {
      Get-Content $f -Encoding utf8 | ForEach-Object { if ($_.Trim()) { Write-Log "  claude: $_" } }
    }
    Remove-Item $f -Force -ErrorAction SilentlyContinue
  }
  if ($claudeExit -ne 0) { throw "claude exited $claudeExit" }

  $after = (Get-FileHash $signalsPath -Algorithm SHA256).Hash
  if ($before -eq $after) {
    Write-Log 'Claude added no entries - it may have skipped every item as off-topic. Nothing to publish.' 'WARN'
    Invoke-Native git @('checkout', '--', 'data/inbox.json') -Quiet | Out-Null
    exit 0
  }

  # --- 4. render -----------------------------------------------------------
  Write-Log 'Rendering pages...'
  Invoke-Native node @('scripts/render-signals.mjs') -Label 'render' | Out-Null
  if ($NativeExitCode -ne 0) {
    throw 'render-signals.mjs rejected the generated data. Nothing was published. Inspect data/signals.json.'
  }

  # --- 5. publish ----------------------------------------------------------
  if ($DryRun) {
    Write-Log 'DRY RUN complete. Changes left in the working tree:'
    Invoke-Native git @('status', '--short') -Label 'git' | Out-Null
    Write-Log 'Undo with:  git checkout -- . ; git clean -fd'
    exit 0
  }

  Write-Log 'Committing and pushing...'
  Invoke-Native git @('add', 'data', 'signals.html', 'feed.xml', 'sitemap.xml', 'index.html') -Quiet | Out-Null

  Invoke-Native git @('diff', '--staged', '--quiet') -Quiet | Out-Null
  if ($NativeExitCode -eq 0) {
    Write-Log 'Nothing staged. Done.'
    exit 0
  }

  $today = Get-Date -Format 'yyyy-MM-dd'
  Invoke-Native git @('commit', '-m', "Signals: $inboxCount new entries for $today",
                      '-m', 'Generated locally by scripts/run-signals.ps1.') -Label 'git' | Out-Null
  if ($NativeExitCode -ne 0) { throw "git commit failed (exit $NativeExitCode)" }

  Invoke-Native git @('push') -Label 'git' | Out-Null
  if ($NativeExitCode -ne 0) {
    throw "git push failed (exit $NativeExitCode). The commit is local; push by hand. If this is an auth failure, note the gh token lives in the Windows keyring and a task running without your profile loaded may not be able to read it - see 'Scheduling' in README.md."
  }

  Write-Log "Published $inboxCount entries. GitHub Pages rebuilds within a minute or two."
  exit 0
}
catch {
  Write-Log $_.Exception.Message 'ERROR'
  if ($_.ScriptStackTrace) { Write-Log $_.ScriptStackTrace 'ERROR' }
  exit 1
}

