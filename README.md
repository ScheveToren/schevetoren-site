# Schaakvereniging De Scheve Toren — starter site

This repository contains a minimal static site and a small script to let the club PC publish updated standings to GitHub Pages.

What I added
- index.html — basic homepage
- docs/standings.html — placeholder standings page that will be overwritten by the script
- push_standings.py — Python script to create/update docs/standings.html via the GitHub API

Quick next steps (one-time)
1. Enable GitHub Pages:
   - Go to: https://github.com/ScheveToren/schevetoren-site/settings/pages
   - Source: Branch: main, Folder: /docs
   - Save. The site will publish at https://ScheveToren.github.io/schevetoren-site/

2. Create a Personal Access Token (PAT) on GitHub (used on the club PC):
   - GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
   - Name: schevetoren-standings-updater
   - Expiration: pick e.g. 6 or 12 months
   - Scopes: select `public_repo` (sufficient for this public repo)
   - Generate and copy the token. Keep it secret.

3. On the club PC, prepare the local standings file and run the script:
   - Install Python3 and requests: `pip3 install requests`
   - Create/generate a local `standings.html` file with the HTML you want published
   - Export environment variables (example):
     ```bash
     export GITHUB_USER="ScheveToren"
     export GITHUB_REPO="schevetoren-site"
     export GITHUB_TOKEN="ghp_xxx..."
     export LOCAL_FILE="standings.html"
     ```
   - Run: `python3 push_standings.py`

4. (Optional) Schedule automatic runs:
   - Linux: use cron
   - Windows: Task Scheduler

Security notes
- The script uses a GitHub PAT. Protect the token on the club PC and store it as an environment variable, not in a file.
- If you want stronger protection later, we can add a small serverless endpoint that accepts a short-lived secret from the club PC and performs the GitHub update server-side (this allows rotating the public key without changing the PAT).
- Consider creating a separate GitHub machine account instead of using a personal account, so you can revoke its token without affecting personal access.

If you want me to make the script accept a simple API key instead of a PAT (by adding a small Netlify/Vercel function), say so and I will add it.
