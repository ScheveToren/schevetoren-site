# watch-and-push.ps1
# Windows PowerShell script that watches a folder for standings.html and uploads it to GitHub via API.
# Edit the variables below to match your environment.
# ========== CONFIG ==========
$WatchFolder    = 'C:\Stand'      # folder Sevilla writes to
$RepoOwner      = 'ScheveToren'                 # GitHub owner/org
$RepoName       = 'schevetoren-site'            # GitHub repo name
$Branch         = 'main'                        # branch used for Pages
$TargetFolder   = 'docs'                        # target folder in repo (we will upload to docs/<filename>)
$UseTokenFile   = $true                         # true -> read token from file, false -> read env var GITHUB_TOKEN
$TokenFilePath  = 'C:\Stand\github_token.txt'    # if using token file
$LogFile        = 'C:\Stand\logs\watch.log'      # optional log file
$DebounceMs     = 5000                           # ms to wait for more changes before uploading batch
$StabilizeMs    = 800                            # wait after last write before uploading (ms)
$UploadRetries  = 3                             # retry attempts per file
# ============================


function Log { param([string]$m) $l = "{0} - {1}" -f (Get-Date -Format o), $m; Write-Host $l; try { $d = Split-Path $LogFile -Parent; if ($d -and -not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }; Add-Content -Path $LogFile -Value $l -Encoding UTF8 } catch {} }

function Get-GitHubToken {
    if ($UseTokenFile) {
        if (-not (Test-Path $TokenFilePath)) { throw "Token file not found: $TokenFilePath" }
        return (Get-Content -Raw -Path $TokenFilePath).Trim()
    } else {
        $t = [Environment]::GetEnvironmentVariable('GITHUB_TOKEN','User')
        if (-not $t) { $t = [Environment]::GetEnvironmentVariable('GITHUB_TOKEN','Machine') }
        if (-not $t) { throw "GITHUB_TOKEN not set." }
        return $t
    }
}

function Build-ApiUrl { param($path) $segments = @($path) | Where-Object { $_ -ne "" }; $encoded = ($segments | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'; return "https://api.github.com/repos/$RepoOwner/$RepoName/contents/$encoded" }

function Upload-File {
    param([string]$fullpath)
    if (-not (Test-Path $fullpath)) { Log ("SKIP not found: {0}" -f $fullpath); return }
    $filename = [System.IO.Path]::GetFileName($fullpath)
    $apiUrl = Build-ApiUrl -path ("$TargetFolder/$filename")

    try { $bytes = [System.IO.File]::ReadAllBytes($fullpath) } catch { Log ("ERROR reading {0}: {1}" -f $fullpath, $_.Exception.Message); return }
    $b64 = [Convert]::ToBase64String($bytes)
    try { $token = Get-GitHubToken } catch { Log ("ERROR reading token: {0}" -f $_.Exception.Message); return }
    $headers = @{ Authorization = "token $token"; Accept = "application/vnd.github+json"; 'User-Agent' = 'schevetoren-poller' }

    $sha = $null
    try {
        $getResp = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers -ErrorAction Stop
        $sha = $getResp.sha
        Log ("Found: docs/{0} sha={1}" -f $filename, $sha)
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode -eq 404) { Log ("Will create docs/{0}" -f $filename) }
        else { Log ("GET error for docs/{0}: {1}" -f $filename, $_.Exception.Message) }
    }

    $payload = @{ message = "Update $filename $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"; content = $b64; branch = $Branch }
    if ($sha) { $payload.sha = $sha }
    $json = $payload | ConvertTo-Json -Depth 6

    for ($i=1; $i -le $UploadRetries; $i++) {
        try {
            $putResp = Invoke-RestMethod -Uri $apiUrl -Method Put -Headers $headers -Body $json -ContentType 'application/json' -ErrorAction Stop
            $commitUrl = $putResp.commit.html_url
            Log ("UPLOAD OK: docs/{0} -> {1}" -f $filename, $commitUrl)
            return
        } catch {
            Log ("Upload attempt {0} failed for {1}: {2}" -f $i, $filename, $_.Exception.Message)
            Start-Sleep -Seconds (2 * $i)
        }
    }
    Log ("FAILED: docs/{0} after {1} attempts" -f $filename, $UploadRetries)
}

# Init
if (-not (Test-Path $WatchFolder)) { New-Item -ItemType Directory -Path $WatchFolder -Force | Out-Null }
$logDir = Split-Path $LogFile -Parent
if ($logDir -and -not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

# state: map path -> lastWriteTime
$seen = @{}

Log ("Polling watcher started. PollIntervalMs={0} StabilizeMs={1}" -f $PollIntervalMs, $StabilizeMs)

while ($true) {
    try {
        $now = Get-Date
        $files = Get-ChildItem -Path $WatchFolder -File -Force -ErrorAction SilentlyContinue
        foreach ($f in $files) {
            $path = $f.FullName
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
                    # not yet stabilized — skip this pass
                    # store lastWrite so we recognize progress on next loop
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