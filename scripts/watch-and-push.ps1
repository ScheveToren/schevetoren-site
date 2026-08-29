# Sevilla -> GitHub Pages watcher (polling) — improved
# Scans folder periodically and uploads new/changed files to GitHub. Safer defaults:
# - avoids uploading the token file if it's placed inside the watch folder
# - avoids uploading PowerShell scripts
# - provides defaults for poll interval to avoid null Start-Sleep errors
# Edit CONFIG values to match your environment before running.

# ========== CONFIG ==========
$WatchFolder    = 'C:\Stand'                    # folder Sevilla writes to
$RepoOwner      = 'ScheveToren'
$RepoName       = 'schevetoren-site'
$Branch         = 'main'
$TargetFolder   = 'docs'                         # upload to docs/<filename>
$UseTokenFile   = $true
$TokenFilePath  = 'C:\Stand\github_token.txt'  # recommended: put token outside watch folder if possible
$LogFile        = 'C:\Stand\logs\watch.log'
$PollIntervalMs = 2000                           # how often to scan (ms). Defaulted if missing
$StabilizeMs    = 800                            # wait after last write before uploading (ms)
$UploadRetries  = 3
# Files to ignore (filenames only)
$IgnoreNames    = @((Split-Path $TokenFilePath -Leaf), 'desktop.ini')
# Extensions to ignore (lowercase, without the dot)
$IgnoreExts     = @('ps1')
# ============================

# Ensure PollIntervalMs has a sensible default (prevents Start-Sleep null errors)
if (-not $PollIntervalMs) { $PollIntervalMs = 2000 }

function Log { param([string]$m) $l = "{0} - {1}" -f (Get-Date -Format o), $m; Write-Host $l; try { $d = Split-Path $LogFile -Parent; if ($d -and -not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }; Add-Content -Path $LogFile -Value $l -Encoding UTF8 } catch {} }

function Get-GitHubToken {
    if ($UseTokenFile) {
        if (-not (Test-Path $TokenFilePath)) { throw "Token file not found: $TokenFilePath" }
        return (Get-Content -Raw -Path $TokenFilePath).Trim()
    } else {
        $t = [Environment]::GetEnvironmentVariable('GITHUB_TOKEN','User')
        if (-not $t) { $t = [Environment]::GetEnvironmentVariable('GITHUB_TOKEN','Machine') }
        if (-not $t) { throw "GITHUB_TOKEN environment variable not set." }
        return $t
    }
}

function Build-ApiUrl { param([string]$path) $segments = @($path) | Where-Object { $_ -ne "" }; $encoded = ($segments | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'; return "https://api.github.com/repos/$RepoOwner/$RepoName/contents/$encoded" }

function Upload-File {
    param([string]$fullpath)

    if (-not (Test-Path $fullpath)) { Log ("SKIP not found: {0}" -f $fullpath); return }

    $filename = [System.IO.Path]::GetFileName($fullpath)
    # Skip ignored filenames
    if ($IgnoreNames -contains $filename) { Log ("SKIP ignored file: {0}" -f $filename); return }
    $ext = [System.IO.Path]::GetExtension($filename).TrimStart('.').ToLower()
    if ($IgnoreExts -contains $ext) { Log ("SKIP ignored extension: {0}" -f $filename); return }

    # preserve relative path under the watch folder so seasons can be uploaded into subfolders
    $watchRoot = (Resolve-Path $WatchFolder).ProviderPath.TrimEnd('\')
    $abs = (Resolve-Path $fullpath).ProviderPath
    $relative = $abs.Substring($watchRoot.Length).TrimStart('\')   # e.g. "2025-2026\Grp1-Rd1.html"
    $repoPath = ($TargetFolder + '/' + ($relative -replace '\\', '/')).TrimStart('/')  # e.g. docs/2025-2026/Grp1-Rd1.html

    $apiUrl = Build-ApiUrl -path $repoPath

    try { $bytes = [System.IO.File]::ReadAllBytes($fullpath) } catch { Log ("ERROR reading {0}: {1}" -f $fullpath, $_.Exception.Message); return }
    $b64 = [Convert]::ToBase64String($bytes)

    try { $token = Get-GitHubToken } catch { Log ("ERROR reading token: {0}" -f $_.Exception.Message); return }
    $headers = @{ Authorization = "token $token"; Accept = "application/vnd.github+json"; 'User-Agent' = 'schevetoren-poller' }

    # check if exists to get sha
    $sha = $null
    try {
        $getResp = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers -ErrorAction Stop
        $sha = $getResp.sha
        Log ("Found: {0} sha={1}" -f $repoPath, $sha)
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode -eq 404) { Log ("Will create {0}" -f $repoPath) }
        else { Log ("GET error for {0}: {1}" -f $repoPath, $_.Exception.Message) }
    }

    $payload = @{ message = "Update $repoPath $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"; content = $b64; branch = $Branch }
    if ($sha) { $payload.sha = $sha }
    $json = $payload | ConvertTo-Json -Depth 6

    for ($i=1; $i -le $UploadRetries; $i++) {
        try {
            $putResp = Invoke-RestMethod -Uri $apiUrl -Method Put -Headers $headers -Body $json -ContentType 'application/json' -ErrorAction Stop
            $commitUrl = $putResp.commit.html_url
            Log ("UPLOAD OK: {0} -> {1}" -f $repoPath, $commitUrl)
            return
        } catch {
            Log ("Upload attempt {0} failed for {1}: {2}" -f $i, $repoPath, $_.Exception.Message)
            Start-Sleep -Seconds (2 * $i)
        }
    }
    Log ("FAILED: {0} after {1} attempts" -f $repoPath, $UploadRetries)
}

# Init
if (-not (Test-Path $WatchFolder)) { New-Item -ItemType Directory -Path $WatchFolder -Force | Out-Null }
$logDir = Split-Path $LogFile -Parent
if ($logDir -and -not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

# state: map path -> lastWriteTime
$seen = @{}

Log ("Polling watcher started. PollIntervalMs={0} StabilizeMs={1}. Ignoring: {2}" -f $PollIntervalMs, $StabilizeMs, ($IgnoreNames -join ','))

while ($true) {
    try {
        $files = Get-ChildItem -Path $WatchFolder -File -Force -ErrorAction SilentlyContinue
        foreach ($f in $files) {
            $path = $f.FullName
            $filename = [System.IO.Path]::GetFileName($path)
            # skip ignored names/extensions early
            if ($IgnoreNames -contains $filename) { continue }
            $ext = [System.IO.Path]::GetExtension($filename).TrimStart('.').ToLower()
            if ($IgnoreExts -contains $ext) { continue }

            $lastWrite = $f.LastWriteTimeUtc
            $prev = $null
            if ($seen.ContainsKey($path)) { $prev = $seen[$path] }

            if (($prev -eq $null) -or ($lastWrite -gt $prev)) {
                # file is new or changed — only upload if stabilized
                $ageMs = (Get-Date).ToUniversalTime().Subtract($lastWrite).TotalMilliseconds
                if ($ageMs -ge $StabilizeMs) {
                    Log ("Detected changed: {0} (age_ms={1})" -f $path, [math]::Round($ageMs))
                    Upload-File -fullpath $path
                    # update seen timestamp after attempt to avoid immediate re-upload loops
                    $seen[$path] = $lastWrite
                } else {
                    # not yet stabilized — store lastWrite so we recognize progress on next loop
                    $seen[$path] = $lastWrite
                }
            }
        }

        # remove entries for deleted files so they can be re-uploaded if re-created
        $currentPaths = $files | ForEach-Object { $_.FullName }
        $toRemove = @()
        foreach ($k in $seen.Keys) { if ($currentPaths -notcontains $k) { $toRemove += $k } }
        foreach ($r in $toRemove) { $seen.Remove($r) | Out-Null }

    } catch {
        Log ("Polling loop error: {0}" -f $_.Exception.Message)
    }
    Start-Sleep -Milliseconds $PollIntervalMs
}
