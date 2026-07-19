param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$SiteUrl,

  [ValidatePattern('^https://')]
  [string]$DemoRepoUrl
)

$normalizedUrl = $SiteUrl.TrimEnd('/')
$placeholder = 'REPLACE_WITH_PUBLIC_SITE_URL'
$demoPlaceholder = 'REPLACE_WITH_DEMO_REPO_URL'
$launchPlaceholder = '[INSERT GITHUB PAGES URL]'
$releaseFiles = @(
  'index.html',
  'research-note.html',
  'feed.xml',
  'sitemap.xml',
  'robots.txt'
)
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)

foreach ($relativePath in $releaseFiles) {
  $path = Join-Path $PSScriptRoot $relativePath
  $content = [System.IO.File]::ReadAllText($path)
  $updated = $content.Replace($placeholder, $normalizedUrl)
  if ($DemoRepoUrl) {
    $updated = $updated.Replace($demoPlaceholder, $DemoRepoUrl.TrimEnd('/'))
  }
  [System.IO.File]::WriteAllText($path, $updated, $utf8WithoutBom)
}

$launchPath = Join-Path $PSScriptRoot 'launch_posts.md'
$launchContent = [System.IO.File]::ReadAllText($launchPath)
$updatedLaunchContent = $launchContent.Replace($launchPlaceholder, $normalizedUrl)
if ($DemoRepoUrl) {
  $updatedLaunchContent = $updatedLaunchContent.Replace($demoPlaceholder, $DemoRepoUrl.TrimEnd('/'))
}
[System.IO.File]::WriteAllText($launchPath, $updatedLaunchContent, $utf8WithoutBom)

Write-Output "Configured public release URLs for $normalizedUrl"
