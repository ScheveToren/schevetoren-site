#!/usr/bin/env python3
import html
import json
import os
import re
import sys
from datetime import datetime

try:
    import markdown
except ImportError:
    markdown = None

ROOT = os.path.dirname(os.path.dirname(__file__))
POSTS_DIR = os.path.join(ROOT, "docs", "nieuws", "berichten")
OUT_JSON = os.path.join(ROOT, "docs", "nieuws", "posts-index.json")
OUT_FEED = os.path.join(ROOT, "docs", "nieuws", "feed.xml")
SITE_URL = "https://schevetoren.github.io/schevetoren-site/docs"

FEN_RE = re.compile(
    r"^([rnbqkpRNBQKP1-8/]+\s+[wb]\s+[KQkq-]+\s+[a-h1-8-]+\s+\d+\s+\d+)$"
)


def parse_frontmatter(text):
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    meta = {}
    for line in parts[1].strip().splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip().strip('"')
    return meta, parts[2].lstrip("\n")


def parse_fen_block(body):
    pattern = re.compile(r"```fen\s*\n([\s\S]*?)```", re.MULTILINE)

    def repl(match):
        raw = match.group(1).strip()
        fen = raw
        caption = ""
        orientation = "white"
        for line in raw.splitlines():
            if line.lower().startswith("fen:"):
                fen = line.split(":", 1)[1].strip()
            elif line.lower().startswith("caption:"):
                caption = line.split(":", 1)[1].strip()
            elif line.lower().startswith("orientation:"):
                orientation = line.split(":", 1)[1].strip().lower()
        fen_line = fen.splitlines()[0].strip() if "\n" not in fen else fen.splitlines()[0].strip()
        if not FEN_RE.match(fen_line):
            raise ValueError(f"Invalid FEN: {fen_line}")
        color = "black" if orientation == "black" else "white"
        src = (
            "https://lichess.org/embed/board?"
            + f"fen={quote_fen(fen_line)}&theme=brown&pieceSet=merida&color={color}"
        )
        cap = f"<figcaption>{html.escape(caption)}</figcaption>" if caption else ""
        return (
            f'<figure class="chess-diagram"><iframe title="Schaakdiagram" '
            f'src="{html.escape(src)}" loading="lazy"></iframe>{cap}</figure>'
        )

    return pattern.sub(repl, body)


def quote_fen(fen):
    from urllib.parse import quote

    return quote(fen, safe="")


def md_to_html(body):
    body = parse_fen_block(body)
    if markdown:
        return markdown.markdown(body, extensions=["extra", "sane_lists"])
    return "<pre>" + html.escape(body) + "</pre>"


def wrap_article(meta, content_html):
    title = html.escape(meta.get("title", "Bericht"))
    date = html.escape(meta.get("date", ""))
    return f"""<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title} — De Scheve Toren</title>
  <meta name="description" content="{html.escape(meta.get('excerpt', ''))}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{html.escape(meta.get('excerpt', ''))}">
  <meta property="og:type" content="article">
  <link rel="stylesheet" href="../../assets/site.css?v=20260923">
</head>
<body>
<div id="site-header"></div>
<main class="page-shell">
  <article class="panel intro-panel">
    <p class="status-badge">Nieuws</p>
    <h1>{title}</h1>
    <p><time datetime="{date}">{date}</time> · {html.escape(meta.get('author', 'Bestuur'))}</p>
    <div class="article-body">{content_html}</div>
    <p><a class="button secondary" href="../nieuws.html">← Alle berichten</a></p>
  </article>
</main>
<div id="site-footer"></div>
<script src="../../config.js?v=20260923"></script>
<script src="../../assets/site.js?v=20260923"></script>
</body>
</html>
"""


def load_posts():
    posts = []
    if not os.path.isdir(POSTS_DIR):
        return posts
    for name in sorted(os.listdir(POSTS_DIR), reverse=True):
        if not name.endswith(".md"):
            continue
        path = os.path.join(POSTS_DIR, name)
        with open(path, encoding="utf-8") as fh:
            raw = fh.read()
        meta, body = parse_frontmatter(raw)
        if meta.get("draft", "").lower() == "true":
            continue
        slug = meta.get("slug") or re.sub(r"\.md$", "", name)
        posts.append({
            "meta": meta,
            "slug": slug,
            "body": body,
            "source": path,
        })
    posts.sort(key=lambda p: p["meta"].get("date", ""), reverse=True)
    return posts


def write_if_changed(path, content):
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if old == content:
        print(f"No change: {path}")
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    print(f"Updated {path}")
    return True


def build_feed(posts):
    items = []
    for post in posts[:20]:
        meta = post["meta"]
        slug = post["slug"]
        link = f"{SITE_URL}/nieuws/berichten/{slug}.html"
        items.append(
            f"<item><title>{html.escape(meta.get('title', slug))}</title>"
            f"<link>{html.escape(link)}</link>"
            f"<guid>{html.escape(link)}</guid>"
            f"<pubDate>{html.escape(meta.get('date', ''))}</pubDate>"
            f"<description>{html.escape(meta.get('excerpt', ''))}</description></item>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0"><channel>'
        "<title>De Scheve Toren — Nieuws</title>"
        f"<link>{SITE_URL}/nieuws.html</link>"
        "<description>Clubnieuws</description>"
        + "".join(items)
        + "</channel></rss>\n"
    )


def main():
    posts = load_posts()
    index = [{
        "slug": p["slug"],
        "title": p["meta"].get("title", p["slug"]),
        "excerpt": p["meta"].get("excerpt", ""),
        "date": p["meta"].get("date", ""),
        "author": p["meta"].get("author", "Bestuur"),
        "url": f"./nieuws/berichten/{p['slug']}.html",
    } for p in posts]
    write_if_changed(OUT_JSON, json.dumps(index, ensure_ascii=False, indent=2) + "\n")
    write_if_changed(OUT_FEED, build_feed(posts))

    for post in posts:
        slug = post["slug"]
        html_path = os.path.join(POSTS_DIR, f"{slug}.html")
        try:
            content_html = md_to_html(post["body"])
        except ValueError as error:
            print(error, file=sys.stderr)
            sys.exit(1)
        write_if_changed(html_path, wrap_article(post["meta"], content_html))


if __name__ == "__main__":
    main()
