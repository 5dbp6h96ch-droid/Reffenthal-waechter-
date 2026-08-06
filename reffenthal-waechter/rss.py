"""
RSS-Überwachung für den Reffenthal-Wächter.

Liest konfigurierte RSS-Feeds und filtert Einträge nach Suchbegriffen.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import feedparser
import requests

from config import HTTP_TIMEOUT, RSS_FEEDS, SEARCH_TERMS, USER_AGENT

# Einträge älter als N Tage werden ignoriert
MAX_ENTRY_AGE_DAYS: int = 7

logger = logging.getLogger(__name__)


@dataclass
class RssEntry:
    """Repräsentiert einen gefundenen RSS-Treffer."""

    entry_id: str
    title: str
    link: str
    summary: str
    feed_url: str
    matched_terms: list[str]


def _contains_search_term(text: str) -> list[str]:
    """Gibt alle Suchbegriffe zurück, die im Text (case-insensitiv) vorkommen."""
    text_lower = text.lower()
    return [term for term in SEARCH_TERMS if term.lower() in text_lower]


def _make_entry_id(entry, feed_url: str) -> str:
    """Erzeugt eine eindeutige ID für einen RSS-Eintrag."""
    if hasattr(entry, "id") and entry.id:
        return entry.id
    if hasattr(entry, "link") and entry.link:
        return entry.link
    title = getattr(entry, "title", "")
    return f"{feed_url}::{title}"


def fetch_feed(feed_url: str) -> list[RssEntry]:
    """Lädt einen RSS-Feed und gibt alle Treffer zurück.

    Args:
        feed_url: URL des RSS-Feeds.

    Returns:
        Liste mit RssEntry-Objekten für alle Einträge mit Suchbegriff-Treffer.
    """
    logger.info("RSS gestartet: %s", feed_url)

    headers = {"User-Agent": USER_AGENT}
    try:
        response = requests.get(
            feed_url,
            headers=headers,
            timeout=HTTP_TIMEOUT,
        )
        response.raise_for_status()
        raw_content = response.content
    except requests.exceptions.Timeout:
        logger.error("RSS: Zeitüberschreitung bei %s", feed_url)
        return []
    except requests.exceptions.ConnectionError as exc:
        logger.error("RSS: Verbindungsfehler bei %s: %s", feed_url, exc)
        return []
    except requests.exceptions.HTTPError as exc:
        logger.error(
            "RSS: HTTP-Fehler %s bei %s",
            exc.response.status_code,
            feed_url,
        )
        return []
    except requests.exceptions.RequestException as exc:
        logger.error("RSS: Fehler bei %s: %s", feed_url, exc)
        return []

    feed = feedparser.parse(raw_content)
    entries_total = len(feed.entries)
    logger.info("RSS Einträge: %d", entries_total)

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=MAX_ENTRY_AGE_DAYS)

    results: list[RssEntry] = []
    for entry in feed.entries:
        title = getattr(entry, "title", "")
        summary = getattr(entry, "summary", "")
        link = getattr(entry, "link", "")
        combined = f"{title} {summary}"

        # Datum prüfen: Eintrag darf nicht älter als MAX_ENTRY_AGE_DAYS sein
        pub = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
        if pub is not None:
            try:
                import calendar
                pub_dt = datetime.fromtimestamp(calendar.timegm(pub), tz=timezone.utc)
                if pub_dt < cutoff:
                    logger.debug("RSS: Eintrag zu alt (%s), übersprungen: %s", pub_dt.date(), title[:50])
                    continue
            except Exception:
                pass  # Kein Datum → trotzdem verarbeiten

        matched = _contains_search_term(combined)
        if not matched:
            continue

        entry_id = _make_entry_id(entry, feed_url)
        results.append(
            RssEntry(
                entry_id=entry_id,
                title=title,
                link=link,
                summary=summary,
                feed_url=feed_url,
                matched_terms=matched,
            )
        )
        logger.debug("RSS Treffer: %s (Begriffe: %s)", title, matched)

    logger.info("RSS Treffer gesamt: %d", len(results))
    return results


def check_all_feeds() -> list[RssEntry]:
    """Prüft alle konfigurierten RSS-Feeds.

    Returns:
        Kombinierte Liste aller Treffer aus allen Feeds.
    """
    all_results: list[RssEntry] = []
    for feed_url in RSS_FEEDS:
        entries = fetch_feed(feed_url)
        all_results.extend(entries)
    return all_results


def _escape_md(text: str) -> str:
    """Escaped Sonderzeichen für Telegram MarkdownV1."""
    for ch in ('_', '*', '`', '['):
        text = text.replace(ch, f'\\{ch}')
    return text


def format_telegram_message(entry: RssEntry) -> str:
    """Formatiert einen RSS-Treffer als Telegram-Nachricht."""
    title = _escape_md(entry.title)
    terms_str = _escape_md(", ".join(entry.matched_terms))
    return (
        f"📰 *Neuer Forentreffer*\n\n"
        f"*{title}*\n\n"
        f"🔍 Suchbegriffe: {terms_str}\n"
        f"🔗 [Zum Beitrag]({entry.link})"
    )
