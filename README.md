# Schaakvereniging De Scheve Toren — starter site

This repository contains a minimal static site and helper scripts so the club PC can publish updated standings to GitHub Pages.

What I added
- index.html — basic homepage
- docs/index.html — index for GitHub Pages when publishing from /docs
- docs/standings.html — placeholder standings page that will be overwritten by the script
- push_standings.py — Python script (alternative uploader)
- scripts/watch-and-push.ps1 — Windows PowerShell watcher + uploader (preferred for Windows club PC)

Quick setup recap (one-time)
1. Enable GitHub Pages for the repo:
   - Go to: https://github.com/ScheveToren/schevetoren-site/settings/pages
   - Source: Branch: main, Folder: /docs
   - Save. The site will publish at: https://ScheveToren.github.io/schevetoren-site/

2. Create a GitHub Personal Access Token (PAT):
   - GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
   - Name: schevetoren-standings-updater
   - Expiration: choose e.g. 90 or 180 days
   - Scopes: `public_repo` (sufficient for this public repo)
   - Generate and copy the token. Keep it secret.

Windows club PC — recommended flow (no Python required)
- Use the PowerShell watcher script in `scripts/watch-and-push.ps1`.
- Recommended location on the club PC: `C:\Club\watch-and-push.ps1` (copy the script from the `scripts/` folder in this repo), create the watch folder `C:\Club\standings_watch`, and place the token file at `C:\Club\github_token.txt` (or configure an environment variable).

Steps to install on the club PC (Windows)
1. Create folders:
   - `C:\Club`
   - `C:\Club\standings_watch`
   - `C:\Club\logs` (optional, for logs)
2. Copy `scripts/watch-and-push.ps1` to `C:\Club\watch-and-push.ps1` and edit the CONFIG section at the top if you want different paths.
3. Create the token file (recommended) and secure it (replace `ghp_xxx` with your token):

```powershell
New-Item -Path 'C:\Club\github_token.txt' -ItemType File -Value 'ghp_xxx' -Force
# Remove inheritance and set ACL: allow only the ClubUser (replace ClubUser) and Administrators and SYSTEM
icacls "C:\Club\github_token.txt" /inheritance:r
icacls "C:\Club\github_token.txt" /grant "ClubUser:R" /grant "SYSTEM:R" /grant "Administrators:F"
```

Note: replace `ClubUser` with the Windows account that will run the scheduled task (or use SYSTEM). If you prefer environment variables, run:

```powershell
setx GITHUB_TOKEN "ghp_xxx"
```

4. Place a test `standings.html` in `C:\Club\standings_watch\standings.html`.
5. Test the script manually (open PowerShell as the account that will run it):

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Club\watch-and-push.ps1"
```

Edit and save `standings.html` and you should see the script detect it and upload. The commit URL will be logged.

Auto-run at startup (Scheduled Task)
- Create a Scheduled Task so the watcher starts at boot. Example (run as Administrator):

Run at system startup (service-like, runs as SYSTEM):

```powershell
schtasks /Create /TN "ScheveTorenStandingsWatcher" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"C:\Club\watch-and-push.ps1\"" /SC ONSTART /RL HIGHEST /F /RU "SYSTEM"
```

Or run at user logon (replace ClubUser with the username that will run it):

```powershell
schtasks /Create /TN "ScheveTorenStandingsWatcher" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"C:\Club\watch-and-push.ps1\"" /SC ONLOGON /RL HIGHEST /F /RU "ClubUser"
```

If you create the task to run as SYSTEM, ensure the token file ACL allows SYSTEM read access (see the icacls example above). If you run as a specific user, give that user read permission.

Verification
- After the script runs and uploads, check the repo to see a new commit that updates `docs/standings.html`.
- After enabling Pages, the URL https://ScheveToren.github.io/schevetoren-site/standings.html will show the uploaded file (may take a minute to deploy).

Security notes
- Use a dedicated machine token / account if possible so you can revoke the token without affecting personal access.
- Set an expiration for the PAT and rotate it periodically. Replace the token file or environment variable when you rotate.
- Keep the club PC physically and network-secure; restrict who has local access.

Next steps
- If you want stronger protection later (avoid storing a PAT on the PC), I can add a small serverless endpoint (Netlify/Vercel/Azure Function) that accepts a short API key from the club PC and performs the GitHub update server-side. That lets you rotate the public key and centralize the real token in a cloud secret store.

---

If you want me to also add the Scheduled Task command prefilled for a specific Windows username, tell me the username and I will update the README with the exact command to copy/paste.
