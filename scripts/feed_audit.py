#!/usr/bin/env python3
"""
Feed audit utility (RSS/Atom).

Goal: produce a reproducible, non-LLM audit of "source usability":
- HTTP status code / content-type
- item count
- latest published date
- sample titles/links/dates

This script intentionally does NOT attempt semantic "signal/noise" scoring.
Use it to validate claims like "RSS stopped" vs "page is 403" vs "feed still works".
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Iterable, Optional

import requests


@dataclass(frozen=True)
class FeedItem:
    title: str
    link: str
    published_at: Optional[str]


def _safe_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _parse_rfc2822(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).astimezone(timezone.utc)
    except Exception:
        return None


def _parse_iso8601(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _fmt_dt(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    return dt.astimezone(timezone.utc).isoformat()


def _first_text(el: Optional[ET.Element], tags: Iterable[str]) -> str:
    if el is None:
        return ""
    for tag in tags:
        child = el.find(tag)
        if child is not None and child.text:
            return _safe_text(child.text)
    return ""


def _find_link_atom(entry: ET.Element, namespaces: dict[str, str]) -> str:
    # Atom: <link href="..."/> or <link rel="alternate" href="..."/>
    links = entry.findall("atom:link", namespaces) + entry.findall("link")
    for link in links:
        href = link.attrib.get("href") or ""
        rel = link.attrib.get("rel") or ""
        if href and (not rel or rel == "alternate"):
            return _safe_text(href)
    return ""


def _parse_rss(root: ET.Element) -> tuple[list[FeedItem], Optional[datetime]]:
    channel = root.find("channel")
    if channel is None:
        return ([], None)
    items: list[FeedItem] = []
    for item in channel.findall("item"):
        title = _first_text(item, ["title"])
        link = _first_text(item, ["link"])
        pub = _first_text(item, ["pubDate", "dc:date"])
        pub_dt = _parse_rfc2822(pub) or _parse_iso8601(pub)
        items.append(FeedItem(title=title, link=link, published_at=_fmt_dt(pub_dt)))
    latest_dt = None
    for it in items:
        if not it.published_at:
            continue
        dt = _parse_iso8601(it.published_at)
        if dt and (latest_dt is None or dt > latest_dt):
            latest_dt = dt
    return (items, latest_dt)


def _parse_atom(root: ET.Element) -> tuple[list[FeedItem], Optional[datetime]]:
    # Atom often uses namespace "http://www.w3.org/2005/Atom"
    namespaces = {"atom": "http://www.w3.org/2005/Atom"}
    entries = root.findall("atom:entry", namespaces) or root.findall("entry")
    items: list[FeedItem] = []
    latest_dt = None
    for entry in entries:
        title = _first_text(entry, ["atom:title", "title"])
        link = _find_link_atom(entry, namespaces) or _first_text(entry, ["atom:link", "link"])
        updated = _first_text(entry, ["atom:updated", "updated"])
        published = _first_text(entry, ["atom:published", "published"])
        dt = _parse_iso8601(updated) or _parse_iso8601(published)
        if dt and (latest_dt is None or dt > latest_dt):
            latest_dt = dt
        items.append(FeedItem(title=title, link=link, published_at=_fmt_dt(dt)))
    return (items, latest_dt)


def _detect_format(root: ET.Element) -> str:
    tag = root.tag.lower()
    if tag.endswith("rss"):
        return "rss"
    if tag.endswith("feed"):
        return "atom"
    return "unknown"


def audit_url(url: str, sample: int, timeout_s: int) -> dict[str, Any]:
    started_at = datetime.now(tz=timezone.utc)
    t0 = time.time()
    try:
        resp = requests.get(
            url,
            timeout=timeout_s,
            headers={
                "User-Agent": "feed-audit/1.0 (+https://example.invalid)",
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
            },
        )
    except Exception as e:
        return {
            "url": url,
            "ok": False,
            "error": f"{type(e).__name__}: {e}",
            "verified_at": started_at.isoformat(),
        }

    content_type = resp.headers.get("content-type", "")
    status_code = resp.status_code
    elapsed_ms = int((time.time() - t0) * 1000)

    body = resp.text or ""
    if status_code >= 400:
        return {
            "url": url,
            "ok": False,
            "status_code": status_code,
            "content_type": content_type,
            "elapsed_ms": elapsed_ms,
            "verified_at": started_at.isoformat(),
            "error": "http_error",
            "body_snippet": body[:200],
        }

    # quick xml sanity
    if "<rss" not in body.lower() and "<feed" not in body.lower():
        return {
            "url": url,
            "ok": False,
            "status_code": status_code,
            "content_type": content_type,
            "elapsed_ms": elapsed_ms,
            "verified_at": started_at.isoformat(),
            "error": "not_rss_or_atom",
            "body_snippet": body[:200],
        }

    try:
        root = ET.fromstring(body)
    except Exception as e:
        return {
            "url": url,
            "ok": False,
            "status_code": status_code,
            "content_type": content_type,
            "elapsed_ms": elapsed_ms,
            "verified_at": started_at.isoformat(),
            "error": f"xml_parse_error: {type(e).__name__}: {e}",
            "body_snippet": body[:200],
        }

    fmt = _detect_format(root)
    items: list[FeedItem]
    latest_dt: Optional[datetime]
    if fmt == "rss":
        items, latest_dt = _parse_rss(root)
    elif fmt == "atom":
        items, latest_dt = _parse_atom(root)
    else:
        items, latest_dt = ([], None)

    sample_items = [
        {"title": it.title, "link": it.link, "published_at": it.published_at}
        for it in items[: max(0, sample)]
    ]

    return {
        "url": url,
        "ok": True,
        "format": fmt,
        "status_code": status_code,
        "content_type": content_type,
        "elapsed_ms": elapsed_ms,
        "verified_at": started_at.isoformat(),
        "item_count": len(items),
        "latest_published_at": _fmt_dt(latest_dt),
        "sample_items": sample_items,
    }


def _read_urls_from_file(path: str) -> list[str]:
    raw = open(path, "r", encoding="utf-8").read().splitlines()
    urls: list[str] = []
    for line in raw:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        urls.append(line)
    return urls


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit RSS/Atom feeds.")
    parser.add_argument("urls", nargs="*", help="Feed URLs to audit")
    parser.add_argument("--file", help="Read feed URLs (one per line)")
    parser.add_argument("--sample", type=int, default=10, help="Number of items to include in sample_items")
    parser.add_argument("--timeout", type=int, default=15, help="HTTP timeout seconds")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    args = parser.parse_args()

    urls = list(args.urls)
    if args.file:
        urls.extend(_read_urls_from_file(args.file))

    urls = [_safe_text(u) for u in urls if _safe_text(u)]
    if not urls:
        print("No URLs provided. Example:\n  scripts/feed_audit.py https://openai.com/news/rss.xml", file=sys.stderr)
        return 2

    report = {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "count": len(urls),
        "results": [audit_url(u, sample=args.sample, timeout_s=args.timeout) for u in urls],
    }
    if args.pretty:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

