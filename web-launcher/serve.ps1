# Fairtaler Translate for the browser (Windows).
# Serves the app from this folder on http://localhost:47831/ (only reachable
# from this computer) and opens it in your normal browser. Nothing is sent
# anywhere; close this window to stop Fairtaler.
#
# The port is always the same, so your browser keeps your history, saved
# translations and settings between runs.
$ErrorActionPreference = 'Stop'
$port = 47831
$url = "http://localhost:$port/"
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'app'))
if (-not (Test-Path (Join-Path $root 'index.html'))) {
  Write-Host "The 'app' folder is missing next to this script. Unpack the whole download and try again."
  Read-Host 'Press Enter to close'
  exit 1
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try { $listener.Start() }
catch {
  # Most likely Fairtaler is already running in another window.
  Start-Process $url
  exit 0
}

# Each request is answered on its own thread: the browser loads several large
# files (voices, dictionaries) at the same time and reads them in pieces, so
# answering one request at a time would make them wait on each other forever.
$serve = {
  param($ctx, $root)
  $types = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.wasm' = 'application/wasm'
    '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.woff' = 'font/woff'; '.woff2' = 'font/woff2'
    '.txt' = 'text/plain; charset=utf-8'
  }
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $file = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $rel))
    # Only files inside the app folder are served.
    if (-not $file.StartsWith($root + [IO.Path]::DirectorySeparatorChar) -or -not [IO.File]::Exists($file)) {
      $res.StatusCode = 404
    } else {
      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      $res.AddHeader('Cache-Control', 'no-cache')
      $res.AddHeader('X-Content-Type-Options', 'nosniff')
      $fs = [IO.File]::OpenRead($file)
      try {
        $res.ContentLength64 = $fs.Length
        if ($ctx.Request.HttpMethod -ne 'HEAD') { $fs.CopyTo($res.OutputStream, 1MB) }
      } finally { $fs.Dispose() }
    }
  } catch {
    # The browser stopped a download halfway (for example a page reload); carry on.
  } finally {
    try { $res.Close() } catch {}
  }
}

$pool = [RunspaceFactory]::CreateRunspacePool(1, 32)
$pool.Open()
$jobs = New-Object System.Collections.ArrayList

$host.UI.RawUI.WindowTitle = 'Fairtaler Translate'
Write-Host ''
Write-Host "  Fairtaler Translate is running at $url"
Write-Host '  Close this window to stop it.'
Write-Host ''
Start-Process $url

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $ps = [PowerShell]::Create()
  $ps.RunspacePool = $pool
  [void]$ps.AddScript($serve).AddArgument($ctx).AddArgument($root)
  [void]$jobs.Add(@{ ps = $ps; handle = $ps.BeginInvoke() })
  # Tidy up the requests that are done.
  for ($i = $jobs.Count - 1; $i -ge 0; $i--) {
    if ($jobs[$i].handle.IsCompleted) {
      try { $jobs[$i].ps.EndInvoke($jobs[$i].handle) } catch {}
      $jobs[$i].ps.Dispose()
      $jobs.RemoveAt($i)
    }
  }
}
