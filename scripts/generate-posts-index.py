#!/usr/bin/env python3
import html
import json
import os
import re
import sys
from urllib.parse import quote, urlencode

try:
    import markdown
except ImportError:
    markdown = None

ROOT = os.path.dirname(os.path.dirname(__file__))
POSTS_DIR = os.path.join(ROOT, "docs", "nieuws", "berichten")
OUT_JSON = os.path.join(ROOT, "docs", "nieuws", "posts-index.json")
OUT_FEED = os.path.join(ROOT, "docs", "nieuws", "feed.xml")

from site_url import public_site_url  # noqa: E402

FEN_RE = re.compile(
    r"^([rnbqkpRNBQKP1-8/]+\s+[wb]\s+[KQkq-]+\s+[a-h1-8-]+\s+\d+\s+\d+)$"
)
GAME_ID_RE = re.compile(r"^[a-zA-Z0-9]{8}$")
PGN_MAX_CHARS = 50000
ASSET_V = "20261009-cms"


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


def lichess_analysis_embed_url(fen_line, color="white"):
    """Lichess iframe embed (see https://lichess.org/developers). FEN uses underscores."""
    fen_param = fen_line.strip().replace(" ", "_")
    query = urlencode(
        {
            "fen": fen_param,
            "color": color,
            "theme": "brown",
            "pieceSet": "merida",
        }
    )
    return f"https://lichess.org/embed/analysis?{query}"


def lichess_game_embed_url(game_id, color=None):
    query = {"theme": "brown", "pieceSet": "merida"}
    if color in ("white", "black"):
        query["color"] = color
    return f"https://lichess.org/embed/{game_id}?{urlencode(query)}"


def extract_game_id(raw):
    text = (raw or "").strip().splitlines()[0].strip() if raw else ""
    if GAME_ID_RE.match(text):
        return text, None
    m = re.search(
        r"lichess\.org/(?:embed/|game/)?([a-zA-Z0-9]{8})(?:/(white|black))?",
        text,
        re.I,
    )
    if m:
        return m.group(1), m.group(2)
    return None, None


def parse_fence_meta(raw):
    """Split caption/orientation lines from content body."""
    caption = ""
    orientation = "white"
    content_lines = []
    for line in raw.splitlines():
        lower = line.lower().strip()
        if lower.startswith("caption:"):
            caption = line.split(":", 1)[1].strip()
        elif lower.startswith("orientation:"):
            orientation = line.split(":", 1)[1].strip().lower()
        elif lower.startswith("fen:"):
            content_lines.append(line.split(":", 1)[1].strip())
        else:
            content_lines.append(line)
    return "\n".join(content_lines).strip(), caption, orientation


def parse_fen_block(body):
    pattern = re.compile(r"```fen\s*(?:\n| )([\s\S]*?)```", re.MULTILINE)

    def repl(match):
        content, caption, orientation = parse_fence_meta(match.group(1))
        fen_line = content.splitlines()[0].strip() if content else ""
        if not FEN_RE.match(fen_line):
            raise ValueError(f"Invalid FEN: {fen_line}")
        color = "black" if orientation == "black" else "white"
        src = lichess_analysis_embed_url(fen_line, color)
        cap = f"<figcaption>{html.escape(caption)}</figcaption>" if caption else ""
        return (
            f'<figure class="chess-diagram chess-analysis"><iframe title="Schaakdiagram" '
            f'src="{html.escape(src)}" loading="lazy"></iframe>{cap}</figure>'
        )

    return pattern.sub(repl, body)


def parse_game_block(body):
    pattern = re.compile(r"```game\s*(?:\n| )([\s\S]*?)```", re.MULTILINE)

    def repl(match):
        content, caption, orientation = parse_fence_meta(match.group(1))
        game_id, url_color = extract_game_id(content)
        if not game_id:
            raise ValueError(f"Invalid Lichess game id/url: {content[:80]}")
        color = url_color or ("black" if orientation == "black" else None)
        src = lichess_game_embed_url(game_id, color)
        cap = f"<figcaption>{html.escape(caption)}</figcaption>" if caption else ""
        return (
            f'<figure class="chess-diagram chess-game"><iframe title="Lichess-partij" '
            f'src="{html.escape(src)}" loading="lazy"></iframe>{cap}</figure>'
        )

    return pattern.sub(repl, body)


def parse_pgn_block(body):
    pattern = re.compile(r"```pgn\s*(?:\n| )([\s\S]*?)```", re.MULTILINE)

    def repl(match):
        raw = match.group(1).strip()
        content, caption, orientation = parse_fence_meta(raw)
        if not content:
            raise ValueError("Empty PGN block")
        if len(content) > PGN_MAX_CHARS:
            raise ValueError(f"PGN too large ({len(content)} chars; max {PGN_MAX_CHARS})")
        # Keep orientation in source for the player (not in an attribute — PGN is multi-line)
        data_pgn = content
        if orientation == "black":
            data_pgn = f"orientation: black\n{content}"
        analysis_url = "https://lichess.org/analysis/pgn/" + quote(content.replace("\n", " "), safe="")
        cap = f"<figcaption>{html.escape(caption)}</figcaption>" if caption else ""
        return (
            f'<figure class="chess-diagram chess-pgn">'
            f'<div class="pgn-player">'
            f'<script type="text/plain" class="pgn-source">{html.escape(data_pgn)}</script>'
            f"</div>"
            f'<p class="pgn-analyse"><a href="{html.escape(analysis_url)}" target="_blank" rel="noopener">'
            f"Analyseer op Lichess</a></p>{cap}</figure>"
        )

    return pattern.sub(repl, body)


IMG_RE = re.compile(r"<img\s+([^>]*?)>", re.IGNORECASE)


def enhance_images(html_fragment):
    def repl(match):
        attrs = match.group(1)
        if "loading=" not in attrs.lower():
            attrs += ' loading="lazy"'
        return f'<figure class="post-image"><img {attrs}></figure>'

    return IMG_RE.sub(repl, html_fragment)


def cover_html(meta):
    cover = meta.get("cover", "").strip()
    if not cover:
        return ""
    src = html.escape(cover)
    alt = html.escape(meta.get("title", ""))
    return f'<figure class="post-cover post-image"><img src="{src}" alt="{alt}" loading="lazy"></figure>'


def pdf_html(meta):
    pdf = meta.get("pdf", "").strip()
    if not pdf:
        return ""
    src = html.escape(pdf)
    return (
        f'<figure class="post-pdf">'
        f'<iframe title="PDF" src="{src}" loading="lazy"></iframe>'
        f'<p class="pdf-download"><a class="button secondary" href="{src}" download target="_blank" rel="noopener">'
        f"Download PDF</a></p></figure>"
    )


def md_to_html(body):
    body = parse_fen_block(body)
    body = parse_game_block(body)
    body = parse_pgn_block(body)
    if markdown:
        rendered = markdown.markdown(body, extensions=["extra", "sane_lists"])
        return enhance_images(rendered)
    return "<pre>" + html.escape(body) + "</pre>"


def wrap_article(meta, content_html):
    title = html.escape(meta.get("title", "Bericht"))
    date = html.escape(meta.get("date", ""))
    cover = meta.get("cover", "").strip()
    has_pgn = "pgn-player" in content_html
    og_image = ""
    if cover:
        og_image = (
            f'\n  <meta property="og:image" content="'
            f'{html.escape(public_site_url("nieuws/berichten/" + cover.lstrip("./")))}">'
        )
    pgn_assets = ""
    if has_pgn:
        pgn_assets = f'\n<script type="module" src="../../assets/pgn-player.js?v={ASSET_V}"></script>'
    return f"""<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title} — De Scheve Toren</title>
  <meta name="description" content="{html.escape(meta.get('excerpt', ''))}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{html.escape(meta.get('excerpt', ''))}">
  <meta property="og:type" content="article">{og_image}
  <link rel="stylesheet" href="../../assets/site.css?v={ASSET_V}">
</head>
<body>
<div id="site-header"></div>
<main class="page-shell">
  <article class="panel intro-panel">
    <p class="status-badge">Nieuws</p>
    <h1>{title}</h1>
    <p><time datetime="{date}">{date}</time> · {html.escape(meta.get('author', 'Bestuur'))}</p>
    {cover_html(meta)}
    <div class="article-body">{content_html}</div>
    {pdf_html(meta)}
    <p><a class="button secondary" href="../../nieuws.html">← Alle berichten</a></p>
  </article>
</main>
<div id="site-footer"></div>
<script src="../../config.js?v={ASSET_V}"></script>
<script src="../../assets/site.js?v={ASSET_V}"></script>{pgn_assets}
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
        link = public_site_url(f"nieuws/berichten/{slug}.html")
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
        f"<link>{public_site_url('nieuws.html')}</link>"
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
