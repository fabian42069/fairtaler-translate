# Publishes the built site (dist/) as the web version on Codeberg Pages:
#   https://fabian42069.codeberg.page/fairtaler-translate/
# Run after `npm run build`:   powershell -ExecutionPolicy Bypass -File scripts\publish-web.ps1 [-DryRun]
#
# Uses the Codeberg login that git already has (Git Credential Manager), or a
# Codeberg access token in $env:CODEBERG_TOKEN (Settings > Applications >
# Access tokens: "Read" for user, "Read and write" for repository).
# The site is uploaded straight to Codeberg Pages (git-pages), so the large
# model files never end up in the git history.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
$site = 'https://fabian42069.codeberg.page/fairtaler-translate/'
$root = Split-Path $PSScriptRoot
$dist = Join-Path $root 'dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) { Write-Host 'dist/ is missing: run "npm run build" first.'; exit 1 }

$token = $env:CODEBERG_TOKEN
if (-not $token) {
  $cred = "protocol=https`nhost=codeberg.org`n`n" | git credential fill
  $token = ($cred | Where-Object { $_ -like 'password=*' }) -replace '^password=', ''
}
if (-not $token) { Write-Host 'No Codeberg login found. Set $env:CODEBERG_TOKEN to a Codeberg access token.'; exit 1 }

$tar = Join-Path ([IO.Path]::GetTempPath()) 'fairtaler-site.tar'
$hdr = Join-Path ([IO.Path]::GetTempPath()) 'fairtaler-site.hdr'
try {
  if ($DryRun) {
    # Only checks that the login may publish this site.
    & tar.exe -cf $tar -C $dist index.html
  } else {
    Write-Host 'Packing the site...'
    & tar.exe -cf $tar -C $dist .
  }
  if ($LASTEXITCODE -ne 0) { throw 'tar failed' }
  # The login goes in a temporary header file, not on the command line.
  $lines = @("Forge-Authorization: token $token", 'Content-Type: application/x-tar')
  if ($DryRun) { $lines += 'Dry-Run: yes' }
  [IO.File]::WriteAllText($hdr, ($lines -join "`r`n"))
  $mb = [math]::Round((Get-Item $tar).Length / 1MB)
  Write-Host "Uploading $mb MiB to $site ..."
  & curl.exe -sS -X PUT --fail-with-body -H "@$hdr" --data-binary "@$tar" $site
  if ($LASTEXITCODE -ne 0) { throw "Upload failed (curl exit $LASTEXITCODE)" }
  Write-Host ''
  if ($DryRun) { Write-Host 'Dry run OK: this login may publish the site.' } else { Write-Host "Published: $site" }
} finally {
  Remove-Item $tar, $hdr -Force -ErrorAction SilentlyContinue
}
