# Schaakvereniging De Scheve Toren — website

GitHub Pages site (`docs/`) with Lichess-linked attendance (Google Apps Script + Sheet), club pages, iCal calendar, and Markdown news.

## Live site

- GitHub Pages: **Source → main → /docs**
- Public URLs omit the `docs/` folder name. Example:
  - Home: `https://schevetoren.github.io/schevetoren-site/index.html`
  - Attendance: `https://schevetoren.github.io/schevetoren-site/attendance.html`
- Optional custom domain via repo **Pages** settings

## Local preview

Static files only — open `docs/index.html` via a local server, for example:

```bash
python3 -m http.server 8765 --directory docs
```

## Lichess OAuth

This site uses **PKCE** with a public client. You do **not** need to open a separate “create OAuth app” page on Lichess (older docs URLs such as `/account/oauth/app/create` no longer exist).

1. **Client id** is fixed in code: `schevetoren-site` (`docs/lichess-auth.js`).
2. **Redirect URI** must be the callback page that GitHub Pages actually serves (no `/docs/` in the URL when Pages publishes from the `/docs` folder):
   - `https://schevetoren.github.io/schevetoren-site/auth/callback.html`
   - With a custom domain: `https://<jouwdomein>/auth/callback.html`
3. Test login on the live attendance page (not a `/docs/…` link):
   - `https://schevetoren.github.io/schevetoren-site/attendance.html`

The “Inloggen met Lichess” button sends users to `https://lichess.org/oauth?…` and back to `auth/callback.html` on your site.

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
