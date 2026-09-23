#!/usr/bin/env python3
import json
import os
import re
from datetime import datetime
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(__file__))
DATA_PATH = os.path.join(ROOT, "docs", "data", "season.json")
OUT_DIR = os.path.join(ROOT, "docs", "kalender")


def load_season():
    with open(DATA_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def fold_line(line, limit=73):
    if len(line) <= limit:
        return line
    parts = []
    while len(line) > limit:
        parts.append(line[:limit])
        line = " " + line[limit:]
    parts.append(line)
    return "\r\n".join(parts)


def dt_local(date_str, time_str):
    return datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")


def build_ics(data):
    season = data.get("season", "season")
    tz = data.get("timezone", "Europe/Amsterdam")
    start = data.get("default_start", "20:00")
    end = data.get("default_end", "23:00")
    location = data.get("location", "De Scheve Toren")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//De Scheve Toren//Club Calendar//NL",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:De Scheve Toren {season}",
        f"X-WR-TIMEZONE:{tz}",
    ]
    for date_str, label, kind in data.get("events", []):
        dt_start = dt_local(date_str, start).strftime("%Y%m%dT%H%M%S")
        dt_end = dt_local(date_str, end).strftime("%Y%m%dT%H%M%S")
        uid = f"{date_str}-{kind}@schevetoren"
        summary = f"De Scheve Toren — {label}"
        desc = f"Clubavond ({kind}). https://github.com/ScheveToren/schevetoren-site"
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}",
            f"DTSTART;TZID={tz}:{dt_start}",
            f"DTEND;TZID={tz}:{dt_end}",
            fold_line(f"SUMMARY:{summary}"),
            fold_line(f"DESCRIPTION:{desc}"),
            fold_line(f"LOCATION:{location}"),
            "END:VEVENT",
        ])
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def main():
    data = load_season()
    os.makedirs(OUT_DIR, exist_ok=True)
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", data.get("season", "season"))
    out_path = os.path.join(OUT_DIR, f"scheve-toren-{slug}.ics")
    content = build_ics(data)
    old = open(out_path, encoding="utf-8").read() if os.path.exists(out_path) else None
    if old != content:
        with open(out_path, "w", encoding="utf-8", newline="") as fh:
            fh.write(content)
        print(f"Updated {out_path}")
    else:
        print(f"No change: {out_path}")


if __name__ == "__main__":
    main()
