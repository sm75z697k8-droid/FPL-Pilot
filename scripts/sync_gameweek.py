#!/usr/bin/env python3
"""Fetch and validate public FPL gameweek metadata for the static FPLPilot site.

Uses the public, undocumented endpoint powering the official FPL website.
No player profiles, credentials, cookies or predictions are involved.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import os
import tempfile
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


EVENTS_URL = "https://fantasy.premierleague.com/api/events/"
BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/"
OUTPUT = Path(__file__).resolve().parent.parent / "data" / "gameweek.json"


def parse_utc(value: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError("deadline_time must be a string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("deadline_time must have a timezone")
    return parsed.astimezone(timezone.utc)


def normalize_events(payload: object, source_url: str, fetched_at: datetime) -> dict:
    """Reject unexpected or incomplete upstream data instead of publishing guesses."""
    events = payload if isinstance(payload, list) else (
        payload.get("events") if isinstance(payload, dict) else None
    )
    if not isinstance(events, list) or len(events) < 30 or len(events) > 50:
        raise ValueError("Invalid FPL events payload")

    clean = []
    seen = set()
    for item in events:
        if not isinstance(item, dict):
            raise ValueError("Event is not an object")
        event_id = item.get("id")
        if type(event_id) is not int or not 1 <= event_id <= 50 or event_id in seen:
            raise ValueError("Invalid or duplicate gameweek ID")
        seen.add(event_id)
        deadline = parse_utc(item.get("deadline_time"))
        clean.append({
            "id": event_id,
            "name": item.get("name") if isinstance(item.get("name"), str) and item["name"].strip() else f"Gameweek {event_id}",
            "deadline_time": deadline.isoformat().replace("+00:00", "Z"),
            "is_current": item.get("is_current") is True,
            "is_next": item.get("is_next") is True,
            "finished": item.get("finished") is True,
        })

    if len([e for e in clean if e["is_current"]]) > 1 or len([e for e in clean if e["is_next"]]) > 1:
        raise ValueError("Conflicting current/next flags")
    clean.sort(key=lambda item: item["id"])
    if any(clean[index]["deadline_time"] >= clean[index + 1]["deadline_time"] for index in range(len(clean) - 1)):
        raise ValueError("Deadlines are not chronological")

    return {
        "schema_version": 1,
        "source": source_url,
        "fetched_at": fetched_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "events": clean,
    }


def download_json(url: str) -> object:
    request = Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; FPLPilot/1.0; public gameweek metadata)",
    })
    with urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f"Unexpected HTTP status {response.status}")
        raw = response.read(3_000_001)
    if len(raw) > 3_000_000:
        raise RuntimeError("Unexpectedly large FPL API response")
    return json.loads(raw.decode("utf-8"))


def main() -> None:
    errors = []
    for url in (EVENTS_URL, BOOTSTRAP_URL):
        try:
            normalized = normalize_events(download_json(url), url, datetime.now(timezone.utc))
            break
        except (ValueError, RuntimeError, HTTPError, URLError, OSError, UnicodeError, json.JSONDecodeError) as exc:
            errors.append(f"{url}: {type(exc).__name__}: {exc}")
    else:
        raise SystemExit("FPL data unavailable; existing snapshot left untouched.\n" + "\n".join(errors))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".gameweek-", dir=str(OUTPUT.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(normalized, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
        os.replace(temporary, OUTPUT)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(f"Validated {len(normalized['events'])} official gameweeks from {normalized['source']}")


if __name__ == "__main__":
    main()
