#!/usr/bin/env pwsh

# watch-and-push.ps1
# Windows PowerShell script that watches a folder for standings.html and uploads it to GitHub via the REST API.
# Edit the variables in the CONFIG section to match your environment before deploying to the club PC.

# ========== CONFIG ==========
$WatchFolder = 'C:\Club\standings_watch'         # folder to watch (create it on the club PC)
$LocalFileName = 'standings.html'                  # file name to watch inside folder
$RepoOwner = 'ScheveToren'                         # GitHub owner/org
$RepoName = 'schevetoren-site'                     # GitHub repo name
$Branch = 'main'                                   # branch used for Pages
$TargetPath = 'docs/standings.html'                # path inside repo where file will be placed
# Token retrieval: choose one method below.
# Option A (recommended): store the token in a local file with restricted ACL and set $UseTokenFile = $true.
# Option B: store the token as a user/machine environment variable named GITHUB_TOKEN and set $UseTokenFile = $false.
$UseTokenFile = $true
$TokenFilePath = 'C:\Club\github_token.txt'
# Optional: path to a log file
$LogFile = 'C:\Club\logs\watch.log'
# ============================

function Log {
    param([string]$msg)
    $line = "$(Get-Date -Format o) - $msg"
    Write-Host $line
    try {
        $dir = Split-Path $LogFile -Parent
        if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
    } catch {
        # ignore logging errors
    }
}

function Get-GitHubToken {
    if ($UseTokenFile) {
        if (-not (Test-Path $TokenFilePath)) { throw "Token file not found: $TokenFilePath" }
        return (Get-Content -Raw -Path $TokenFilePath).Trim()
    } else {
        $t = [Environment]::GetEnvironmentVariable('GITHUB_TOKEN','User')
        if (-not $t) { $t = [Environment]::GetEnvironmentVariable('GITHUB_TOKEN','Machine') }
        if (-not $t) { throw "GITHUB_TOKEN environment variable not set. Use setx to add it for the user or create the token file and set `$UseTokenFile = $true` in the script." }
        return $t
    }
}

function Upload-Standings {
    try {
        $token = Get-GitHubToken
    } catch {
        Log "ERROR: Cannot read token: $($_.Exception.Message)"
        return
    }

    $localPath = Join-Path $WatchFolder $LocalFileName
    if (-not (Test-Path $localPath)) {
        Log "File not found: $localPath"
        return
    }

    try {
        Start-Sleep -Milliseconds 300 # wait for file write to complete

        $content = Get-Content -Raw -Encoding UTF8 -Path $localPath
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
        $b64 = [Convert]::ToBase64String($bytes)

        $apiUrl = "https://api.github.com/repos/$RepoOwner/$RepoName/contents/$TargetPath"
        $headers = @{ Authorization = "token $token"; Accept = "application/vnd.github+json"; 'User-Agent' = 'schevetoren-uploader' }

        # Check if file exists to get sha
        $sha = $null
        try {
            $getResp = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers -ErrorAction Stop
            $sha = $getResp.sha
            Log "Existing file detected in repo (sha=$sha). Will update."
        } catch {
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode -eq 404) {
                Log "File not found in repo; will create."
            } else {
                Log "Error checking file: $($_.Exception.Message)"
                return
            }
        }

        $payload = @{ message = "Update standings $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"; content = $b64; branch = $Branch }
        if ($sha) { $payload.sha = $sha }
        $json = $payload | ConvertTo-Json -Depth 6

        $putResp = Invoke-RestMethod -Uri $apiUrl -Method Put -Headers $headers -Body $json -ContentType 'application/json' -ErrorAction Stop
        $commitUrl = $putResp.commit.html_url
        Log "Upload successful. Commit: $commitUrl"
    } catch {
        Log "Upload failed: $($_.Exception.Message)"
    }
}

# Ensure watch folder exists
if (-not (Test-Path $WatchFolder)) { New-Item -ItemType Directory -Path $WatchFolder -Force | Out-Null }

# Start FileSystemWatcher
$fsw = New-Object System.IO.FileSystemWatcher $WatchFolder, $LocalFileName
$fsw.IncludeSubdirectories = $false
$fsw.EnableRaisingEvents = $true

$action = {
    Start-Sleep -Milliseconds 200
    $full = $Event.SourceEventArgs.FullPath
    $changeType = $Event.SourceEventArgs.ChangeType
    Log "Detected $changeType on $full"
    try {
        Upload-Standings
    } catch {
        Log "Exception in Upload-Standings: $($_.Exception.Message)"
    }
}

# Register events
$null = Register-ObjectEvent $fsw Created -Action $action
$null = Register-ObjectEvent $fsw Changed -Action $action

Log "Watching $WatchFolder for $LocalFileName. Press Ctrl+C to exit."
while ($true) { Start-Sleep -Seconds 1 }
