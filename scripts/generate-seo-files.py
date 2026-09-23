#!/usr/bin/env python3
import json
import os
from datetime import UTC, datetime

ROOT = os.path.dirname(os.path.dirname(__file__))
DOCS = os.path.join(ROOT, "docs")
SITE_URL = "https://schevetoren.github.io/schevetoren-site"

PUBLIC_PAGES = [
    "index.html",
    "interne-competitie.html",
    "externe-competitie.html",
    "jeugd.html",
    "kalender.html",
    "gedragsregels.html",
    "contact.html",
    "nieuws.html",
    "seizoenen.html",
]


def load_post_urls():
    path = os.path.join(DOCS, "nieuws", "posts-index.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return [item["url"].lstrip("./") for item in data]


def build_sitemap():
    urls = [f"{SITE_URL}/{page}" for page in PUBLIC_PAGES]
    urls.extend(f"{SITE_URL}/{url.lstrip('./')}" for url in load_post_urls())
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    for url in urls:
        lines.append(f"  <url><loc>{url}</loc><lastmod>{today}</lastmod></url>")
    lines.append("</urlset>\n")
    return "\n".join(lines)


def build_robots():
    return f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n"


def write_if_changed(path, content):
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if old == content:
        print(f"No change: {path}")
        return False
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    print(f"Updated {path}")
    return True


def main():
    write_if_changed(os.path.join(DOCS, "sitemap.xml"), build_sitemap())
    write_if_changed(os.path.join(DOCS, "robots.txt"), build_robots())


if __name__ == "__main__":
    main()
