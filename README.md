# Schaakvereniging De Scheve Toren — website

GitHub Pages site (`docs/`) with Lichess-linked attendance (Google Apps Script + Sheet), club pages, iCal calendar, and Markdown news.

## Live site

- GitHub Pages: **Source → main → /docs**
- Public URLs omit the `docs/` folder name.
- **Compact URLs** (no `/schevetoren-site/` in the path) are configured in [`docs/data/site-public.json`](docs/data/site-public.json) and used for RSS/sitemap. Target shape:
  - `https://schevetoren.github.io/externe-competitie.html`
  - `https://schevetoren.github.io/attendance.html`
- To serve at that path on GitHub, use either:
  1. **Organization Pages**: repository named `ScheveToren.github.io` with the same `/docs` layout, or
  2. A **custom domain** on Pages (add `docs/CNAME` + DNS); set `publicOrigin` in `site-public.json` to your domain.
- While the site still lives in the `schevetoren-site` project repo only, GitHub serves it under `/schevetoren-site/`; internal navigation uses relative links and still works. RSS/sitemap use the compact URL from config for when you switch hosting.
- Temporary fallback (project Pages only): set `"publicBasePath": "/schevetoren-site"` in `site-public.json` until you migrate.

## Local preview

Static files only — open `docs/index.html` via a local server, for example:

```bash
python3 -m http.server 8765 --directory docs
```

## Lichess OAuth

This site uses **PKCE** with a public client. You do **not** need to open a separate “create OAuth app” page on Lichess (older docs URLs such as `/account/oauth/app/create` no longer exist).

1. **Client id** is fixed in code: `schevetoren-site` (`docs/lichess-auth.js`).
2. **Redirect URI** must match the live callback URL (no `/docs/` in the path). Examples:
   - Org/custom domain: `https://schevetoren.github.io/auth/callback.html` or `https://<jouwdomein>/auth/callback.html`
   - Project Pages (legacy): `https://schevetoren.github.io/schevetoren-site/auth/callback.html`
3. Test login on the live attendance page (same host as the callback), e.g. `…/attendance.html`.

The “Inloggen met Lichess” button sends users to `https://lichess.org/oauth?…` and back to `auth/callback.html` on your site. PKCE verifier/state are stored in **localStorage** on the same origin as the attendance page; if you see “Ongeldige OAuth state”, start login again from the live site (not a copy on another host or `file://`).

## Google Apps Script backend

1. Open the club Google Spreadsheet
2. **Extensions → Apps Script** — paste [`scripts/google-apps-script-live.gs`](scripts/google-apps-script-live.gs)
3. Set `SHEET_ID` if needed
4. **Deploy → New deployment → Web app**
   - Execute as: Me
   - Who has access: Anyone
5. Copy the `/exec` URL into [`docs/config.js`](docs/config.js) (`API_URL`)

### Spreadsheet tabs

| Tab | Purpose |
|-----|---------|
| `Players` | `player_name`, `lichess_username`, `is_admin`, … |
| `InviteCodes` | One-time codes to link Lichess → player |
| `Attendance` | Per player/date status |
| `Settings` | Optional club metadata |

**Admins:** set `is_admin` to `TRUE` and fill `lichess_username` for board members.

**Members:** receive invite code → log in with Lichess → link account → manage own attendance only.

### API (privacy)

| Public GET | Protected POST |
|------------|----------------|
| `action=season` | `whoami`, `my-attendance`, `link-lichess`, `save-attendance`, `admin-roster` |

Anonymous `players`, `attendance`, and `export` GET requests return `auth_required`.

## News (Markdown)

- Draft posts in [`docs/nieuws/berichten/`](docs/nieuws/berichten/) (see [`docs/nieuws/_template.md`](docs/nieuws/_template.md))
- Use ` ```fen ` blocks for diagrams (validated at build time)
- Push to `main` — GitHub Action runs [`scripts/generate-posts-index.py`](scripts/generate-posts-index.py)

## Generated files (CI)

Workflow [`.github/workflows/update-seasons-index.yml`](.github/workflows/update-seasons-index.yml):

- `docs/seizoenen.html` — season folders index
- `docs/kalender/*.ics` — subscribe calendar
- `docs/nieuws/posts-index.json`, article HTML, `feed.xml`
- `docs/sitemap.xml`, `docs/robots.txt`

Local run:

```bash
pip install markdown
python3 scripts/generate-seasons-index.py
python3 scripts/generate-calendar-ics.py
python3 scripts/generate-posts-index.py
python3 scripts/generate-seo-files.py
```

## Sevilla standings watcher

See existing [`scripts/watch-and-push.ps1`](scripts/watch-and-push.ps1) — uploads season HTML into `docs/<season>/`.

## Security notes

- Never commit Google tokens or GitHub PATs
- Redeploy Apps Script after backend changes
- Revoke leaked tokens immediately
