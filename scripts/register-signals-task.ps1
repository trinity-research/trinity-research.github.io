<#
.SYNOPSIS
  Registers (or removes) the Windows scheduled task that publishes Signals.

.DESCRIPTION
  Creates a task that runs scripts/run-signals.ps1 on weekdays. It is
  registered to run as you, only when you are logged on, because the pipeline
  needs two things tied to your user session:

    - the Claude Code subscription credential
    - the gh token, which lives in the Windows keyring and is protected by
      DPAPI against your profile

  A task set to "run whether user is logged on or not" launches without your
  profile fully loaded and typically cannot read either. If you need it to run
  while logged off, expect to switch git to an SSH key or a PAT in a file first.

  -WakeToRun is set, so a sleeping machine wakes for it. A machine that is
  fully powered off will not run - StartWhenAvailable catches the missed run
  the next time you log on.

.PARAMETER At
  Time of day to run, 24h "HH:mm". Default 03:30.

.PARAMETER TaskName
  Default "TrinityResearch-Signals".

.PARAMETER Remove
  Unregister the task instead of creating it.

.EXAMPLE
  .\scripts\register-signals-task.ps1 -At 03:30
  .\scripts\register-signals-task.ps1 -Remove
#>
[CmdletBinding()]
param(
  [string]$At = '03:30',
  [string]$TaskName = 'TrinityResearch-Signals',
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "Removed scheduled task '$TaskName'."
  } else {
    Write-Output "No scheduled task named '$TaskName'."
  }
  return
}

if ($At -notmatch '^\d{1,2}:\d{2}$') { throw "-At must look like 03:30" }

$repo   = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $repo 'scripts\run-signals.ps1'
if (-not (Test-Path $runner)) { throw "Cannot find $runner" }

# -File (not -Command) so quoting in the path is handled by PowerShell itself.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$runner`"" `
  -WorkingDirectory $repo

$trigger = New-ScheduledTaskTrigger -Weekly `
  -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $At

$settings = New-ScheduledTaskSettingsSet `
  -WakeToRun `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -MultipleInstances IgnoreNew

# Interactive: runs as you, with your profile, only while logged on.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Replaced the existing '$TaskName' task."
}

Register-ScheduledTask -TaskName $TaskName `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Fetches business automation feeds, has Claude write short takes, renders signals.html, and pushes to GitHub Pages.' | Out-Null

Write-Output "Registered '$TaskName' - weekdays at $At, as $env:USERNAME, while logged on."
Write-Output ""
Write-Output "  Run it now:   Start-ScheduledTask -TaskName '$TaskName'"
Write-Output "  Last result:  Get-ScheduledTaskInfo -TaskName '$TaskName'"
Write-Output "  Logs:         $env:LOCALAPPDATA\TrinityResearch\signals-logs"
Write-Output "  Remove:       .\scripts\register-signals-task.ps1 -Remove"
