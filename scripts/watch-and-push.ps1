# Updated watcher to batch-upload any changed files from Sevilla
# Watches a folder for any file changes and uploads changed files to GitHub
# via the Contents API. Debounces events and uploads files in a batch.
# Edit the CONFIG block at top for your environment before running.

# ========== CONFIG ==========
$WatchFolder    = 'C:\Club\standings_watch'     # folder Sevilla writes to
$RepoOwner      = 'ScheveToren'                 # GitHub owner/org
$RepoName       = 'schevetoren-site'            # GitHub repo name
$Branch         = 'main'                        # branch used for Pages
$TargetFolder   = 'docs'                        # target folder in repo (we will upload to docs/<filename>)
$UseTokenFile   = $true                         # true -> read token from file, false -> read env var GITHUB_TOKEN
$TokenFilePath  = 'C:\Club\github_token.txt'    # if using token file
$LogFile        = 'C:\Club\logs\watch.log'      # optional log file
$DebounceMs     = 800                           # ms to wait for more changes before uploading batch
$UploadRetries  = 3                             # retry attempts per file
# ============================

function Log {
    param([string]$msg)
    $line = "$(Get-Date -Format o) - $msg"
    Write-Host $line
    try {
        $dir = Split-Path $LogFile -Parent
        if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
    } catch {}
}

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

# Build a safe API URL for a repo path (encode each segment, keep slashes)
function Build-ApiUrlFromPath {
    param([string]$repoFolder, [string]$filename)
    $segments = @($repoFolder, $filename) | Where-Object { $_ -ne "" }
    $encoded = ($segments | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
    return "https://api.github.com/repos/$RepoOwner/$RepoName/contents/$encoded"
}

# Upload a single file (create or update). Retries on transient errors.
function Upload-File {
    param([string]$fullpath)
    if (-not (Test-Path $fullpath)) {
        Log "SKIP: file not found $fullpath"
        return
    }
    $filename = [System.IO.Path]::GetFileName($fullpath)
    $apiUrl = Build-ApiUrlFromPath -repoFolder $TargetFolder -filename $filename

    try {
        $bytes = [System.IO.File]::ReadAllBytes($fullpath)
    } catch {
        Log "ERROR reading $fullpath: $($_.Exception.Message)"
        return
    }
    $b64 = [Convert]::ToBase64String($bytes)
    $token = $null
    try { $token = Get-GitHubToken } catch { Log "ERROR reading token: $($_.Exception.Message)"; return }

    $headers = @{ Authorization = "token $token"; Accept = "application/vnd.github+json"; 'User-Agent' = 'schevetoren-uploader' }

    # check if exists to get sha
    $sha = $null
    try {
        $getResp = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers -ErrorAction Stop
        $sha = $getResp.sha
        Log "Found existing repo file docs/$filename (sha=$sha)."
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode -eq 404) {
            Log "No existing file docs/$filename — will create."
        } else {
            Log "ERROR checking existence for docs/$filename: $($_.Exception.Message)"
            # continue; we will attempt create and let API return an error if needed
        }
    }

    $payload = @{ message = "Update $filename $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"; content = $b64; branch = $Branch }
    if ($sha) { $payload.sha = $sha }
    $json = $payload | ConvertTo-Json -Depth 6

    for ($i=1; $i -le $UploadRetries; $i++) {
        try {
            $putResp = Invoke-RestMethod -Uri $apiUrl -Method Put -Headers $headers -Body $json -ContentType 'application/json' -ErrorAction Stop
            $commitUrl = $putResp.commit.html_url
            Log "UPLOAD OK: docs/$filename -> $commitUrl"
            return
        } catch {
            $err = $_.Exception
            Log "Upload attempt $i failed for $filename: $($err.Message)"
            Start-Sleep -Seconds (2 * $i)
        }
    }
    Log "FAILED to upload $filename after $UploadRetries attempts."
}

# Debounce queue: collect changed files, then upload them together when timer elapses
$Queue = [System.Collections.Generic.HashSet[string]]::new()
$QueueLock = New-Object System.Object
$timer = New-Object System.Timers.Timer
$timer.Interval = $DebounceMs
$timer.AutoReset = $false

$timer.Add_Elapsed({
    # take snapshot and clear queue
    $items = @()
    lock ($QueueLock) {
        $items = $Queue.ToArray()
        $Queue.Clear()
    }
    if ($items.Count -eq 0) { return }
    Log "Processing batch of $($items.Count) changed file(s)."
    foreach ($p in $items) {
        Upload-File -fullpath $p
    }
})

# FileSystemWatcher event action
$action = {
    Start-Sleep -Milliseconds 150
    $full = $Event.SourceEventArgs.FullPath
    $changeType = $Event.SourceEventArgs.ChangeType
    # only consider files directly in the watched folder (no recursion)
    try {
        # add to queue
        lock ($QueueLock) { $null = $Queue.Add($full) | Out-Null }
        Log "Queued change ($changeType): $full"
        # restart timer
        $script:timer.Stop()
        $script:timer.Start()
    } catch {
        Log "Event handler error: $($_.Exception.Message)"
    }
}

# Ensure folder exists
if (-not (Test-Path $WatchFolder)) { New-Item -ItemType Directory -Path $WatchFolder -Force | Out-Null }

# Start watcher for all files (you can restrict to patterns if desired)
$fsw = New-Object System.IO.FileSystemWatcher $WatchFolder, '*.*'
$fsw.IncludeSubdirectories = $false
$fsw.EnableRaisingEvents = $true

# Register Created and Changed events
$null = Register-ObjectEvent $fsw Created -Action $action
$null = Register-ObjectEvent $fsw Changed -Action $action

Log "Watching $WatchFolder (debounce $DebounceMs ms). Press Ctrl+C to exit."
while ($true) { Start-Sleep -Seconds 1 }
