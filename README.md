# Schaakvereniging De Scheve Toren — website

GitHub Pages site (`docs/`) with Lichess-linked attendance (Google Apps Script + Sheet), club pages, iCal calendar, and Markdown news.

## Live site

- GitHub Pages: enable **Source → main → /docs**
- Project URL pattern: `https://<org>.github.io/schevetoren-site/docs/`
- Optional custom domain via `CNAME` in repo settings

## Local preview

Static files only — open `docs/index.html` via a local server, for example:

```bash
python3 -m http.server 8765 --directory docs
```

## Lichess OAuth

1. Create / edit OAuth app at https://lichess.org/account/oauth/app/create  
   - Client id: `schevetoren-site` (must match `docs/lichess-auth.js`)
2. Register **redirect URI** (exact):
   - `https://<org>.github.io/schevetoren-site/docs/auth/callback.html`
   - Add custom domain variant when used
3. After deploy, test login on `docs/attendance.html`

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
