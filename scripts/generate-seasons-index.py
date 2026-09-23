#!/usr/bin/env python3
# scripts/generate-seasons-index.py
# Scans docs/ for directories matching YYYY-YYYY and writes docs/index.html
# and docs/HuidigSeizoen/index.html (meta-redirect to newest).

import os
import re
from datetime import datetime

REPO_OWNER = "ScheveToren"   # used in links; adjust if needed
REPO_NAME  = "schevetoren-site"
DOCS_DIR   = "docs"
HUIDIG_DIR = os.path.join(DOCS_DIR, "HuidigSeizoen")
SEASON_RE  = re.compile(r"^\d{4}-\d{4}$")

def find_seasons():
    if not os.path.isdir(DOCS_DIR):
        return []
    entries = []
    for name in os.listdir(DOCS_DIR):
        path = os.path.join(DOCS_DIR, name)
        if os.path.isdir(path) and SEASON_RE.match(name):
            entries.append(name)
    entries.sort(reverse=True)  # newest first (lexicographic YYYY-YYYY works)
    return entries

def build_seizoenen_html(seasons):
    if not seasons:
        list_html = "<li>(nog geen seizoenen gepubliceerd)</li>"
    else:
        items = []
        for s in seasons:
            link = f"./{s}/"
            items.append(f"<li class='season'><a href='{link}'>{s}</a></li>")
        list_html = "\n".join(items)

    now = datetime.utcnow().strftime("%Y-%m-%d")
    html = f"""<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Seizoenen — De Scheve Toren</title>
  <meta name="description" content="Archief van competitieseizoenen van De Scheve Toren.">
  <link rel="stylesheet" href="./assets/site.css?v=20260923">
</head>
<body>
<div id="site-header"></div>
<main class="page-shell">
  <header class="topbar">
    <div><p class="eyebrow">De Scheve Toren</p><h1 data-i18n="nav.seasons">Seizoenen</h1></div>
    <a class="button secondary" href="./index.html" data-i18n="nav.back">← Terug</a>
  </header>
  <section class="panel intro-panel">
    <p class="meta">Kies een seizoen. <a href="./HuidigSeizoen/">Huidig seizoen</a> gaat naar de actuele stand.</p>
    <ul class="seasons">
{list_html}
    </ul>
    <p class="meta">Laatste update: {now} UTC.</p>
  </section>
</main>
<div id="site-footer"></div>
<script src="./config.js?v=20260923"></script>
<script src="./assets/site.js?v=20260923"></script>
</body>
</html>
"""
    return html

def build_huidig_html(target_season):
    if not target_season:
        # fallback explanatory page
        html = """<!doctype html><html lang="nl"><head><meta charset="utf-8"/><title>Huidig Seizoen</title></head><body><h1>Huidig Seizoen</h1><p>Er is momenteel geen actief seizoen ingesteld.</p></body></html>"""
        return html
    target_url = f"../{target_season}/"
    html = f"""<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0;url={target_url}" />
  <title>Redirecting to {target_season}</title>
</head>
<body>
  <p>Redirecting to <a href="{target_url}">{target_season}</a></p>
</body>
</html>
"""
    return html

def write_if_changed(path, content):
    old = None
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            old = fh.read()
    if old != content:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(content)
        print(f"Updated {path}")
        return True
    print(f"No change: {path}")
    return False

def main():
    seasons = find_seasons()
    seizoenen_html = build_seizoenen_html(seasons)
    huidig_html = build_huidig_html(seasons[0] if seasons else None)

    changed = False
    changed |= write_if_changed(os.path.join(DOCS_DIR, "seizoenen.html"), seizoenen_html)
    changed |= write_if_changed(os.path.join(DOCS_DIR, "HuidigSeizoen", "index.html"), huidig_html)
    if changed:
        print("Files updated; workflow will commit and push changes.")
    else:
        print("No updates required.")

if __name__ == "__main__":
    main()
