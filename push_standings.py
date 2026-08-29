#!/usr/bin/env python3
"""
push_standings.py

Read a local `standings.html` file and create/update `docs/standings.html` in the repository
using the GitHub REST API.

Usage (club PC):
  1) create/generate a local file `standings.html` containing the HTML you want published
  2) set environment variables (example below)
  3) run: python3 push_standings.py

Environment variables (example):
  export GITHUB_USER="ScheveToren"
  export GITHUB_REPO="schevetoren-site"
  export GITHUB_TOKEN="ghp_xxx..."   # your PAT (keep secret)
  # optional:
  export TARGET_PATH="docs/standings.html"
  export BRANCH="main"
  export LOCAL_FILE="standings.html"

Note: The script requires the `requests` package: pip install requests
"""

import os
import base64
import requests

GITHUB_USER = os.getenv("GITHUB_USER")
GITHUB_REPO = os.getenv("GITHUB_REPO")
TARGET_PATH = os.getenv("TARGET_PATH", "docs/standings.html")
BRANCH = os.getenv("BRANCH", "main")
TOKEN = os.getenv("GITHUB_TOKEN")
LOCAL_FILE = os.getenv("LOCAL_FILE", "standings.html")

if not (GITHUB_USER and GITHUB_REPO and TOKEN):
    raise SystemExit("Please set GITHUB_USER, GITHUB_REPO and GITHUB_TOKEN environment variables")

if not os.path.exists(LOCAL_FILE):
    raise SystemExit(f"Local file not found: {LOCAL_FILE}")

with open(LOCAL_FILE, "rb") as f:
    content = f.read()

b64_content = base64.b64encode(content).decode("utf-8")
api_base = f"https://api.github.com/repos/{GITHUB_USER}/{GITHUB_REPO}/contents/{TARGET_PATH}"

headers = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json"
}
params = {"ref": BRANCH}

r = requests.get(api_base, headers=headers, params=params)

if r.status_code == 200:
    sha = r.json().get("sha")
    print("Existing file found in repo, will update (sha:", sha, ")")
    payload = {
        "message": "Update standings",
        "content": b64_content,
        "sha": sha,
        "branch": BRANCH
    }
    resp = requests.put(api_base, headers=headers, json=payload)
elif r.status_code == 404:
    print("File not found in repo, creating new file")
    payload = {
        "message": "Create standings",
        "content": b64_content,
        "branch": BRANCH
    }
    resp = requests.put(api_base, headers=headers, json=payload)
else:
    raise SystemExit(f"Failed to check file: {r.status_code} {r.text}")

if resp.ok:
    print("Standings uploaded. Commit URL:", resp.json().get("commit", {}).get("html_url"))
else:
    print("Error uploading:", resp.status_code, resp.text)
