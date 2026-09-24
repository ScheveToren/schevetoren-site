#!/usr/bin/env python3
"""Generate static HTML club pages from docs/content/pages/*.json"""
import html
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES_DIR = ROOT / "docs" / "content" / "pages"
DOCS = ROOT / "docs"
CSS_V = "20260924-cms"


def esc(s: str) -> str:
    return html.escape(str(s or ""), quote=True)


def render_blocks(blocks):
    out = []
    for block in blocks or []:
        kind = block.get("type")
        if kind == "paragraph":
            out.append(f"    <p>{esc(block.get('text', ''))}</p>")
        elif kind == "labeled":
            label = esc(block.get("label", ""))
            if block.get("html"):
                out.append(f"    <p><strong>{label}:</strong> {block['html']}</p>")
            else:
                out.append(f"    <p><strong>{label}:</strong> {esc(block.get('text', ''))}</p>")
        elif kind == "link":
            label = esc(block.get("label", ""))
            href = esc(block.get("href", "#"))
            text = esc(block.get("text", ""))
            out.append(f"    <p><strong>{label}:</strong> <a href=\"{href}\">{text}</a></p>")
    return "\n".join(out)


def write_contact(data):
    title = data.get("title", "Contact")
    meta = esc(data.get("metaDescription", ""))
    i18n = data.get("i18nTitleKey", "")
    h1 = f'<h1 data-i18n="{esc(i18n)}">{esc(title)}</h1>' if i18n else f"<h1>{esc(title)}</h1>"
    body = render_blocks(data.get("blocks"))
    return f"""<!doctype html>
<!-- Generated from docs/content/pages/contact.json — do not edit by hand -->
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{esc(title)} — De Scheve Toren</title>
  <meta name="description" content="{meta}">
  <link rel="stylesheet" href="./assets/site.css?v={CSS_V}">
</head>
<body>
<div id="site-header"></div>
<main class="page-shell">
  <header class="topbar"><div><p class="eyebrow">De Scheve Toren</p>{h1}</div></header>
  <section class="panel intro-panel">
{body}
  </section>
</main>
<div id="site-footer"></div>
<script src="./config.js?v={CSS_V}"></script>
<script src="./assets/site.js?v={CSS_V}"></script>
<script src="./assets/calendar-feed.js?v={CSS_V}"></script>
</body>
</html>
"""


def write_jeugd(data):
    title = data.get("title", "Jeugd")
    meta = esc(data.get("metaDescription", ""))
    i18n = data.get("i18nTitleKey", "")
    h1 = f'<h1 data-i18n="{esc(i18n)}">{esc(title)}</h1>' if i18n else f"<h1>{esc(title)}</h1>"
    intro = data.get("intro") or {}
    schedule = intro.get("schedule") or []
    sched_html = "\n".join(
        f"      <li><strong>{esc(item.get('label', ''))}:</strong> {esc(item.get('time', ''))}</li>"
        for item in schedule
    )
    callout = intro.get("callout", "")
    gp = data.get("gpTable") or {}
    cols = gp.get("columns") or []
    head = "".join(f"<th>{esc(c)}</th>" for c in cols)
    rows = gp.get("rows") or []
    tbody = "\n".join(
        "        <tr>" + "".join(f"<td>{esc(cell)}</td>" for cell in row) + "</tr>" for row in rows
    )
    foot = gp.get("footnoteHtml", "")
    return f"""<!doctype html>
<!-- Generated from docs/content/pages/jeugd.json — do not edit by hand -->
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{esc(title)} — De Scheve Toren</title>
  <meta name="description" content="{meta}">
  <link rel="stylesheet" href="./assets/site.css?v={CSS_V}">
</head>
<body>
<div id="site-header"></div>
<main class="page-shell">
  <header class="topbar">
    <div><p class="eyebrow">De Scheve Toren</p>{h1}</div>
    <a class="button secondary" href="./index.html" data-i18n="nav.back">← Terug</a>
  </header>
  <section class="panel intro-panel">
    <p>{esc(intro.get('paragraph', ''))}</p>
    <ul>
{sched_html}
    </ul>
    <div class="callout-box">
      <p>{callout}</p>
    </div>
  </section>
  <section class="panel">
    <h2>{esc(gp.get('heading', ''))}</h2>
    <table class="info-table">
      <thead><tr>{head}</tr></thead>
      <tbody>
{tbody}
      </tbody>
    </table>
    <p class="meta">{foot}</p>
  </section>
</main>
<div id="site-footer"></div>
<script src="./config.js?v={CSS_V}"></script>
<script src="./assets/site.js?v={CSS_V}"></script>
<script src="./assets/calendar-feed.js?v={CSS_V}"></script>
</body>
</html>
"""


def write_gedragsregels(data):
    title = data.get("title", "Gedragsregels")
    meta = esc(data.get("metaDescription", ""))
    badge = data.get("badge")
    badge_html = f'    <p class="status-badge">{esc(badge)}</p>\n' if badge else ""
    intro_parts = data.get("introParagraphs") or []
    if intro_parts:
        intro_block = "\n".join(f"    <p>{esc(p)}</p>" for p in intro_parts)
    else:
        intro = data.get("introHtml", "")
        intro_block = f"    <p>{intro}</p>" if intro else ""
    sections_html = []
    for sec in data.get("sections") or []:
        h = esc(sec.get("heading", ""))
        heading_html = f"    <h2>{h}</h2>\n" if h else ""
        st = sec.get("type")
        if st == "paragraph":
            sections_html.append(f"{heading_html}    <p>{esc(sec.get('text', ''))}</p>")
        elif st == "paragraphs":
            block = [heading_html.rstrip()] if h else []
            for t in sec.get("texts") or []:
                block.append(f"    <p>{esc(t)}</p>")
            sections_html.append("\n".join(block))
        elif st == "ordered_list":
            items = "".join(f"      <li>{item}</li>\n" for item in (sec.get("items") or []))
            sections_html.append(f"{heading_html}    <ol>\n{items}    </ol>")
        elif st == "unordered_list":
            items = "".join(f"      <li>{item}</li>\n" for item in (sec.get("items") or []))
            sections_html.append(f"{heading_html}    <ul>\n{items}    </ul>")
        elif st == "definitions":
            parts = []
            for item in sec.get("items") or []:
                term = esc(item.get("term", ""))
                if item.get("html"):
                    text = item["html"]
                else:
                    text = esc(item.get("text", ""))
                parts.append(f"      <dt><strong>{term}</strong></dt>\n      <dd>{text}</dd>")
            sections_html.append(f"{heading_html}    <dl class=\"def-list\">\n" + "\n".join(parts) + "\n    </dl>")
    body = "\n\n".join(sections_html)
    return f"""<!doctype html>
<!-- Generated from docs/content/pages/gedragsregels.json — do not edit by hand -->
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{esc(title)} — De Scheve Toren</title>
  <meta name="description" content="{meta}">
  <link rel="stylesheet" href="./assets/site.css?v={CSS_V}">
</head>
<body>
<div id="site-header"></div>
<main class="page-shell">
  <header class="topbar">
    <div><p class="eyebrow">De Scheve Toren</p><h1>{esc(title)}</h1></div>
    <a class="button secondary" href="./index.html" data-i18n="nav.back">← Terug</a>
  </header>
  <section class="panel intro-panel article-body">
{badge_html}{intro_block}

{body}
  </section>
</main>
<div id="site-footer"></div>
<script src="./config.js?v={CSS_V}"></script>
<script src="./assets/site.js?v={CSS_V}"></script>
</body>
</html>
"""


WRITERS = {
    "contact.json": ("contact.html", write_contact),
    "jeugd.json": ("jeugd.html", write_jeugd),
    "gedragsregels.json": ("gedragsregels.html", write_gedragsregels),
}


def main():
    if not PAGES_DIR.is_dir():
        print("No pages dir:", PAGES_DIR)
        return
    for filename, (out_name, writer) in WRITERS.items():
        path = PAGES_DIR / filename
        if not path.is_file():
            print("Skip missing", path)
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        html_out = writer(data)
        out_path = DOCS / out_name
        if out_path.read_text(encoding="utf-8") != html_out:
            out_path.write_text(html_out, encoding="utf-8")
            print("Updated", out_path.relative_to(ROOT))
        else:
            print("No change:", out_path.relative_to(ROOT))


if __name__ == "__main__":
    main()
