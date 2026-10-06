#!/usr/bin/env python3
"""Fetch HSB/KNSB NetStand pages and write docs/data/externe-competitie.json."""

from __future__ import annotations

import html as html_lib
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES_PATH = ROOT / "docs" / "data" / "externe-sources.json"
OUT_PATH = ROOT / "docs" / "data" / "externe-competitie.json"
USER_AGENT = "ScheveTorenSiteBot/1.0 (+https://github.com/ScheveToren/schevetoren-site)"


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tables: list[list[list[str]]] = []
        self._in_table = False
        self._in_row = False
        self._in_cell = False
        self._cell_parts: list[str] = []
        self._row: list[str] = []
        self._table: list[list[str]] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "table":
            self._in_table = True
            self._table = []
        elif self._in_table and tag == "tr":
            self._in_row = True
            self._row = []
        elif self._in_row and tag in ("td", "th"):
            self._in_cell = True
            self._cell_parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self._in_cell:
            text = clean_text("".join(self._cell_parts))
            self._row.append(text)
            self._in_cell = False
            self._cell_parts = []
        elif tag == "tr" and self._in_row:
            if self._row:
                self._table.append(self._row)
            self._in_row = False
            self._row = []
        elif tag == "table" and self._in_table:
            if self._table:
                self.tables.append(self._table)
            self._in_table = False
            self._table = []

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._cell_parts.append(data)

    def handle_entityref(self, name: str) -> None:
        if self._in_cell:
            self._cell_parts.append(html_lib.unescape(f"&{name};"))

    def handle_charref(self, name: str) -> None:
        if self._in_cell:
            self._cell_parts.append(html_lib.unescape(f"&#{name};"))


def clean_text(value: str) -> str:
    text = html_lib.unescape(value)
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        charset = resp.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def parse_tables(page_html: str) -> list[list[list[str]]]:
    parser = TableParser()
    parser.feed(page_html)
    return parser.tables


def find_matches_table(tables: list[list[list[str]]]) -> list[list[str]] | None:
    for table in tables:
        if not table:
            continue
        header = [c.lower() for c in table[0]]
        if "ronde" in header and "thuis" in header and "uit" in header:
            return table
    return None


def find_standings_table(tables: list[list[list[str]]]) -> list[list[str]] | None:
    # Prefer compact Team/MP/BP table (not the crosstable with round numbers).
    for table in tables:
        if not table or len(table[0]) < 3:
            continue
        header = [c.lower() for c in table[0]]
        if header[:3] == ["team", "mp", "bp"] and len(header) == 3:
            return table
    for table in tables:
        if not table:
            continue
        header = [c.lower() for c in table[0]]
        if header[:3] == ["team", "mp", "bp"]:
            return table
    return None


def parse_iso_date(nl_date: str) -> str | None:
    m = re.match(r"^(\d{1,2})-(\d{1,2})-(\d{4})$", nl_date.strip())
    if not m:
        return None
    day, month, year = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    try:
        return f"{year:04d}-{month:02d}-{day:02d}"
    except ValueError:
        return None


def normalize_score(score: str) -> str:
    text = score.strip()
    if text in {"", "-", "–", "—"}:
        return "?"
    text = text.replace(" - ", " – ").replace(" — ", " – ")
    return text


def is_our_team(name: str, hints: list[str]) -> bool:
    lowered = name.casefold()
    return any(hint.casefold() in lowered for hint in hints)


def extract_team(source: dict) -> dict:
    base = source["baseUrl"].rstrip("/")
    team_url = base + source["teamPath"]
    division_url = base + source["divisionPath"]
    hints = source.get("clubNameHints") or []

    team_html = fetch(team_url)
    division_html = fetch(division_url)

    matches_table = find_matches_table(parse_tables(team_html))
    standings_table = find_standings_table(parse_tables(division_html))

    matches = []
    if matches_table:
        header = [c.casefold() for c in matches_table[0]]
        idx = {name: header.index(name) for name in header}
        for row in matches_table[1:]:
            if len(row) < 5:
                continue
            date_raw = row[idx.get("datum", 1)]
            home = row[idx.get("thuis", 2)]
            away = row[idx.get("uit", 3)]
            score = normalize_score(row[idx.get("uitslag", 4)])
            matches.append(
                {
                    "round": row[idx.get("ronde", 0)],
                    "date": date_raw,
                    "dateIso": parse_iso_date(date_raw),
                    "home": home,
                    "away": away,
                    "score": score,
                    "homeIsUs": is_our_team(home, hints),
                    "awayIsUs": is_our_team(away, hints),
                }
            )

    standings = []
    if standings_table:
        for rank, row in enumerate(standings_table[1:], start=1):
            if len(row) < 3:
                continue
            team_name = re.sub(r"^\d+\.\s*", "", row[0]).strip()
            standings.append(
                {
                    "rank": rank,
                    "team": team_name,
                    "mp": row[1],
                    "bp": row[2],
                    "isUs": is_our_team(team_name, hints),
                }
            )

    return {
        "id": source["id"],
        "title": source["title"],
        "teamUrl": team_url,
        "divisionUrl": division_url,
        "matches": matches,
        "standings": standings,
    }


def main() -> int:
    if not SOURCES_PATH.exists():
        print(f"Missing sources file: {SOURCES_PATH}", file=sys.stderr)
        return 1

    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    teams = []
    errors = []

    for source in sources.get("teams", []):
        try:
            teams.append(extract_team(source))
            print(f"OK {source['id']}: matches={len(teams[-1]['matches'])} standings={len(teams[-1]['standings'])}")
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            errors.append(f"{source.get('id')}: {exc}")
            print(f"FAIL {source.get('id')}: {exc}", file=sys.stderr)

    if not teams:
        print("No teams fetched; refusing to overwrite output.", file=sys.stderr)
        return 1

    payload = {
        "season": sources.get("season", ""),
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "netstand",
        "teams": teams,
        "errors": errors,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    return 0 if not errors else 0  # partial success still publishes


if __name__ == "__main__":
    raise SystemExit(main())
