#!/usr/bin/env python3
"""Fetch Blogger posts and write Markdown under docs/nieuws/berichten/."""

import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "nieuws" / "berichten"
FEED = "https://deschevetoren.blogspot.com/feeds/posts/default?alt=json&max-results=50"
CUTOFF = datetime(2026, 7, 7)
SKIP_TITLE = re.compile(r"uitslagen en stand|eindstand senioren", re.I)


def slugify(title):
    text = title.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:80] or "bericht"


def strip_html(html_text):
    text = re.sub(r"<br\s*/?>", "\n", html_text, flags=re.I)
    text = re.sub(r"</p>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return unescape(re.sub(r"\n{3,}", "\n\n", text)).strip()


def parse_entry(entry):
    title = entry.get("title", {}).get("$t", "Bericht")
    if SKIP_TITLE.search(title):
        return None
    published = entry.get("published", {}).get("$t", "")[:10]
    try:
        pub_date = datetime.strptime(published, "%Y-%m-%d")
    except ValueError:
        pub_date = None
    if pub_date and pub_date.date() < CUTOFF.date():
        return None
    content = entry.get("content", {}).get("$t", "")
    body = strip_html(content)
    if not body:
        return None
    slug = slugify(title)
    excerpt = body.split("\n", 1)[0][:200]
    author = "Erik Jan Tromp"
    for author_obj in entry.get("author", []):
        if author_obj.get("name", {}).get("$t"):
            author = author_obj["name"]["$t"]
            break
    frontmatter = (
        "---\n"
        f'title: "{title.replace(chr(34), chr(39))}"\n'
        f"slug: {slug}\n"
        f'excerpt: "{excerpt.replace(chr(34), chr(39))[:180]}"\n'
        f"date: {published or datetime.utcnow().strftime('%Y-%m-%d')}\n"
        f'author: "{author}"\n'
        "---\n\n"
    )
    return OUT_DIR / f"{published}-{slug}.md", frontmatter + body + "\n"


def main():
    with urllib.request.urlopen(FEED, timeout=30) as response:
        data = json.load(response)
    written = 0
    for entry in data.get("feed", {}).get("entry", []):
        parsed = parse_entry(entry)
        if not parsed:
            continue
        path, content = parsed
        if path.exists():
            print(f"Skip existing: {path.name}")
            continue
        path.write_text(content, encoding="utf-8")
        print(f"Wrote {path.name}")
        written += 1
    print(f"Done. {written} new file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
