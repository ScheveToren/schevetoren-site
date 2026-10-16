# Scheve Toren API (Raspberry Pi)

Node.js API that mirrors the Google Apps Script attendance/CMS contract, stores data in **SQLite**, and optionally **two-way syncs** with the club Google Sheet. The static site on GitHub Pages stays the frontend; production keeps using Apps Script until you point `API_URL` at this server.

## Architecture

- **Hot path:** browser → Pi (`/exec`) → SQLite
- **Mirror:** Pi ↔ Google Sheets (service account), LWW on `updated_at`
- **Failover:** keep Apps Script deployed; set `API_FALLBACK_URL` in [`docs/config.js`](../docs/config.js) to the `/exec` URL

## Quick start (dev)

```bash
cd server
cp .env.example .env
npm install
# Sync stays off without credentials:
# SHEETS_SYNC_ENABLED=false
npm start
```

API: `http://127.0.0.1:8787/exec` (same GET/POST actions as Apps Script).

Test season:

```bash
curl "http://127.0.0.1:8787/exec?action=season"
```

## Google Sheets sync

1. Create a Google Cloud project → enable **Google Sheets API**.
2. Create a **service account**, download JSON key → store on the Pi only, e.g. `/opt/schevetoren-api/secrets/google-service-account.json`.
3. Share the club spreadsheet with the service account email (**Editor**).
4. In `.env` set:
   - `SHEET_ID` (same as Apps Script)
   - `GOOGLE_APPLICATION_CREDENTIALS=./secrets/google-service-account.json`
   - `SHEETS_SYNC_ENABLED=true`
5. Seed / reconcile:

```bash
npm run seed
```

**Edit rules:** while the Pi is online, prefer the website/admin UI. Edit the Sheet directly mainly when the Pi is down or for bulk fixes. Sync merges by newest `updated_at` (invite codes also prefer `used`).

## GitHub CMS

Set `GITHUB_PAT` in `.env` (contents:write on `ScheveToren/schevetoren-site`). Same `cms-*` actions as Apps Script.

## Cloudflare Tunnel (free public HTTPS)

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) on the Pi.
2. `cloudflared tunnel login` then `cloudflared tunnel create schevetoren-api`.
3. Route a hostname: `cloudflared tunnel route dns schevetoren-api api.example.com` (domain must be on Cloudflare DNS).
4. Copy [`deploy/cloudflared.yml.example`](deploy/cloudflared.yml.example) to `/etc/cloudflared/config.yml`, fill tunnel UUID and hostname, service `http://127.0.0.1:8787`.
5. Enable the tunnel service (see [`deploy/cloudflared.service.example`](deploy/cloudflared.service.example)).

Quick tunnels (`*.trycloudflare.com`) are fine for a smoke test only — URLs change.

## systemd (API)

1. Copy this folder to `/opt/schevetoren-api` (or clone the repo and symlink).
2. Create user `schevetoren`, own the directory and SQLite path.
3. Install Node 20+, `npm ci --omit=dev` in `/opt/schevetoren-api`.
4. Install unit: `sudo cp deploy/schevetoren-api.service /etc/systemd/system/` then `daemon-reload`, `enable --now schevetoren-api`.

Bind `HOST=127.0.0.1` so only the tunnel (or localhost) can reach the API.

## Cut over the website (when ready)

In [`docs/config.js`](../docs/config.js):

```js
API_URL: "https://api.example.com/exec",
API_FALLBACK_URL: "https://script.google.com/macros/s/.../exec",
API_TIMEOUT_MS: 3000,
```

Commit/push so GitHub Pages picks it up. Until you change `API_URL`, members keep using Apps Script.

CORS origins are configured via `CORS_ORIGINS` (includes `https://schevetoren.github.io` by default).

## Ops checklist

| Item | Notes |
|------|--------|
| SQLite backup | Copy `SQLITE_PATH` daily (Sheets is also a mirror) |
| Sync status | `GET /exec?action=sync-status` or admin `POST` `{ action: "sync-now" }` |
| Pi down | Frontend falls back to Apps Script; when Pi returns, startup reconcile pulls Sheet changes |
| Season calendar | Edit `src/season.js` and redeploy (keep in sync with Apps Script `SEASON`) |

## Magic-link login

Members log in with the club e-mail stored in **Players.email** (no invite codes).

1. Fill `email` per player in the Sheet (synced to SQLite).
2. Set SMTP in `.env` (`CONTACT_SMTP_*`) and `PUBLIC_SITE_URL` (link target in the mail).
3. Frontend actions: `request-login-link`, `consume-login-link`, optional `request-lichess-link` / `link-lichess-session`.
4. Tabs `MagicTokens` and `Sessions` are created/synced automatically for Pi ↔ Apps Script failover.

## Actions implemented

Attendance/auth: `whoami`, `my-attendance`, `save-attendance`, `admin-roster`, `bulk-set`, GET `season`,  
`request-login-link`, `consume-login-link`, `request-lichess-link`, `link-lichess-session` (legacy `link-lichess` + invite still accepted).

CMS: `cms-status`, `cms-test-commit`, `cms-list-news`, `cms-get-news`, `cms-publish-news`, `cms-publish-page`, `cms-get-page`, `cms-upload-ics`.

Admin: `sync-now`, GET `sync-status`.
