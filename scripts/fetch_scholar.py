#!/usr/bin/env python3
"""Fetch Google Scholar stats for Elias Hossain and write to stats.json.

Uses the `scholarly` package to scrape Google Scholar via the author ID.
If fetching fails (rate-limited, blocked, etc.), the existing stats.json
is preserved so the workflow doesn't break the site.
"""
import json
import os
import sys
from datetime import datetime, timezone

from scholarly import scholarly

AUTHOR_ID = "l0L1NPAAAAAJ"  # Elias Hossain
STATS_PATH = os.path.join(os.path.dirname(__file__), "..", "stats.json")


def fetch_stats():
    author = scholarly.search_author_id(AUTHOR_ID)
    author = scholarly.fill(author, sections=["indices", "publications"])
    return {
        "citations": int(author.get("citedby", 0)),
        "h_index": int(author.get("hindex", 0)),
        "publications": len(author.get("publications", []) or []),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Google Scholar (scholarly)",
    }


def main():
    try:
        stats = fetch_stats()
    except Exception as exc:
        print(f"[fetch_scholar] error: {exc}", file=sys.stderr)
        print("[fetch_scholar] keeping existing stats.json", file=sys.stderr)
        sys.exit(0)

    with open(STATS_PATH, "w") as f:
        json.dump(stats, f, indent=2)
        f.write("\n")

    print(
        f"[fetch_scholar] updated: "
        f"{stats['citations']} citations, "
        f"h-index {stats['h_index']}, "
        f"{stats['publications']} publications"
    )


if __name__ == "__main__":
    main()
