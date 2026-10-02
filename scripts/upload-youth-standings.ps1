# Youth Standings Uploader — GitHub Pages watcher
# Monitors a folder for youth standings files and uploads them to docs/jeugd/
# Designed to run independently from the main Sevilla watcher

# ========== CONFIG ==========
$WatchFolder    = 'C:\JeugdUitslagen'              # folder where youth standings are exported
$RepoOwner      = 'ScheveToren'
$RepoName       = 'schevetoren-site'
$Branch         = 'main'
$TargetFolder   = 'docs/jeugd'                     # upload to docs/jeugd/<filename>
$UseTokenFile   = $true
$TokenFilePath  = 'C:\JeugdUitslagen\github_token.txt'  # keep token outside watch folder if possible
$LogFile        = 'C:\JeugdUitslagen\logs\upload-youth.log'
$PollIntervalMs = 2000                              # how often to scan (ms)
$StabilizeMs    = 800                               # wait after last write before uploading (ms)
$UploadRetries  = 3
# Files to ignore (filenames only)
$IgnoreNames    = @((Split-Path $TokenFilePath -Leaf), 'desktop.ini')
# Extensions to ignore (lowercase, without the dot)
$IgnoreExts     = @('ps1', 'txt')
# File extensions to include in scans
$IncludeExts    = @('.html', '.htm', '.css', '.json')
# ============================

# Ensure PollIntervalMs has a sensible default
if (-not $PollIntervalMs) { $PollIntervalMs = 2000 }

function Log { 
    param([string]$m) 
    $l = "{0} - {1}" -f (Get-Date -Format o), $m
    Write-Host $l
    try {
        $d = Split-Path $LogFile -Parent
        if ($d -and -not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
        Add-Content -Path $LogFile -Value $l -ErrorAction SilentlyContinue
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

function Build-ApiUrl { 
    param([string]$path)
    $segments = @($path) | Where-Object { $_ -ne "" }
    $encoded = ($segments | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
    return "https://api.github.com/repos/$encoded/contents"
}

function Upload-File {
    param([string]$fullpath)

    if (-not (Test-Path $fullpath)) { 
        Log ("SKIP not found: {0}" -f $fullpath)
        return 
    }

    $filename = [System.IO.Path]::GetFileName($fullpath)
    
    # Skip ignored filenames
    if ($IgnoreNames -contains $filename) { 
        Log ("SKIP ignored file: {0}" -f $filename)
        return 
    }
    
    $ext = [System.IO.Path]::GetExtension($filename).ToLower()
    if ($IgnoreExts -contains $ext.TrimStart('.')) { 
        Log ("SKIP ignored extension: {0}" -f $filename)
        return 
    }

    # Preserve relative path under watch folder (supports subfolders)
    $watchRoot = (Resolve-Path $WatchFolder).ProviderPath.TrimEnd('\')
    $abs = (Resolve-Path $fullpath).ProviderPath
    $relative = $abs.Substring($watchRoot.Length).TrimStart('\')   # e.g. "Groep-A.html"
    $repoPath = ($TargetFolder + '/' + ($relative -replace '\\', '/')).TrimStart('/')  # e.g. docs/jeugd/Groep-A.html

    $apiUrl = Build-ApiUrl -path "$RepoOwner/$RepoName/$repoPath"

    try { 
        $bytes = [System.IO.File]::ReadAllBytes($fullpath) 
    } catch { 
        Log ("ERROR reading {0}: {1}" -f $fullpath, $_.Exception.Message)
        return 
    }
    
    $b64 = [Convert]::ToBase64String($bytes)

    try { 
        $token = Get-GitHubToken 
    } catch { 
        Log ("ERROR reading token: {0}" -f $_.Exception.Message)
        return 
    }
    
    $headers = @{ 
        Authorization = "token $token"
        Accept = "application/vnd.github+json"
        'User-Agent' = 'schevetoren-youth-uploader' 
    }

    # Check if file exists to get sha
    $sha = $null
    try {
        $getResp = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $headers -ErrorAction Stop
        $sha = $getResp.sha
        Log ("Found existing: {0} sha={1}" -f $repoPath, $sha)
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode -eq 404) { 
            Log ("Will create new: {0}" -f $repoPath) 
        }
        else { 
            Log ("GET error for {0}: {1}" -f $repoPath, $_.Exception.Message) 
        }
    }

    $payload = @{ 
        message = "Youth standings: $filename $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        content = $b64
        branch = $Branch 
    }
    if ($sha) { $payload.sha = $sha }
    
    $json = $payload | ConvertTo-Json -Depth 6

    for ($i=1; $i -le $UploadRetries; $i++) {
        try {
            $putResp = Invoke-RestMethod -Uri $apiUrl -Method Put -Headers $headers -Body $json -ContentType 'application/json' -ErrorAction Stop
            $commitUrl = $putResp.commit.html_url
            Log ("✓ UPLOAD OK: {0} -> {1}" -f $repoPath, $commitUrl)
            return
        } catch {
            Log ("Upload attempt {0}/{1} failed for {2}: {3}" -f $i, $UploadRetries, $repoPath, $_.Exception.Message)
            Start-Sleep -Seconds (2 * $i)
        }
    }
    Log ("✗ FAILED: {0} after {1} attempts" -f $repoPath, $UploadRetries)
}

# ===== INITIALIZATION =====
if (-not (Test-Path $WatchFolder)) { 
    New-Item -ItemType Directory -Path $WatchFolder -Force | Out-Null 
}

$logDir = Split-Path $LogFile -Parent
if ($logDir -and -not (Test-Path $logDir)) { 
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null 
}

$seen = @{}

Log ("===== Youth Standings Uploader Started =====")
Log ("Watch folder: $WatchFolder")
Log ("Target repo: $RepoOwner/$RepoName (branch: $Branch)")
Log ("Upload to: $TargetFolder")
Log ("Poll interval: ${PollIntervalMs}ms | Stabilize: ${StabilizeMs}ms")
Log ("Ignoring files: $($IgnoreNames -join ', ')")

# ===== MAIN LOOP =====
while ($true) {
    try {
        # Recursive scan: include only relevant extensions for performance
        $files = Get-ChildItem -Path $WatchFolder -Recurse -File -Force -ErrorAction SilentlyContinue |
                 Where-Object { $IncludeExts -contains $_.Extension }

        foreach ($f in $files) {
            $path = $f.FullName
            $filename = [System.IO.Path]::GetFileName($path)
            
            # Skip ignored names/extensions early
            if ($IgnoreNames -contains $filename) { continue }
            $ext = [System.IO.Path]::GetExtension($filename).TrimStart('.').ToLower()
            if ($IgnoreExts -contains $ext) { continue }

            $lastWrite = $f.LastWriteTimeUtc
            $prev = $null
            if ($seen.ContainsKey($path)) { $prev = $seen[$path] }

            if (($prev -eq $null) -or ($lastWrite -gt $prev)) {
                # File is new or changed — only upload if stabilized
                $ageMs = (Get-Date).ToUniversalTime().Subtract($lastWrite).TotalMilliseconds
                if ($ageMs -ge $StabilizeMs) {
                    Log ("Detected changed: {0} (age_ms={1})" -f $path, [math]::Round($ageMs))
                    Upload-File -fullpath $path
                    # Update seen timestamp after attempt to avoid re-upload loops
                    $seen[$path] = $lastWrite
                } else {
                    # Not yet stabilized — store lastWrite to recognize progress on next loop
                    $seen[$path] = $lastWrite
                }
            }
        }

        # Clean up entries for deleted files so they can be re-uploaded if re-created
        $currentPaths = $files | ForEach-Object { $_.FullName }
        $toRemove = @()
        foreach ($k in $seen.Keys) { 
            if ($currentPaths -notcontains $k) { $toRemove += $k } 
        }
        foreach ($r in $toRemove) { 
            $seen.Remove($r) | Out-Null 
        }

    } catch {
        Log ("Polling loop error: {0}" -f $_.Exception.Message)
    }
    
    Start-Sleep -Milliseconds $PollIntervalMs
}
