#!/usr/bin/env python3
"""Public absolute URLs for RSS, sitemap, og:image (no /schevetoren-site/ slug)."""

import json
import os

ROOT = os.path.dirname(os.path.dirname(__file__))
CONFIG_PATH = os.path.join(ROOT, "docs", "data", "site-public.json")


def _load_config():
    defaults = {
        "publicOrigin": "https://schevetoren.github.io",
        "publicBasePath": "",
    }
    if os.path.isfile(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as fh:
            defaults.update(json.load(fh))
    origin = os.environ.get("SCHEVETOREN_PUBLIC_ORIGIN", defaults["publicOrigin"]).rstrip("/")
    base = os.environ.get("SCHEVETOREN_PUBLIC_BASE", defaults["publicBasePath"]).rstrip("/")
    if base and not base.startswith("/"):
        base = "/" + base
    return origin, base


def public_site_url(path: str) -> str:
    """Build https://origin[/base]/path.html — base empty for org Pages or custom domain."""
    origin, base = _load_config()
    path = path.lstrip("/")
    if base:
        return f"{origin}{base}/{path}"
    return f"{origin}/{path}"


def site_url_prefix() -> str:
    origin, base = _load_config()
    return f"{origin}{base}" if base else origin
