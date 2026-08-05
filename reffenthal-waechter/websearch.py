"""
Internet-Recherche für den Reffenthal-Wächter.

Durchsucht das Web via DuckDuckGo nach aktuellen Meldungen
zu konfigurierten Suchbegriffen. Kein API-Key erforderlich.
"""

import logging
from datetime import datetime, timedelta

from ddgs import DDGS

from config import HTTP_TIMEOUT, SEARCH_TERMS

logger = logging.getLogger(__name__)

# Suchbegriffe speziell für die Web-Recherche (möglichst präzise)
WEB_SEARCH_QUERIES: list[str] = [
    '"Reffenthal"',
    '"Reffenthal" Pegel',
    '"Otterstädter Altrhein"',
    '"Otterstädter Altrhein" Wasserstand',
    '"Angelhofer Altrhein"',
]

# Gezielte Suche im Boote-Forum
FORUM_SEARCH_QUERIES: list[str] = [
    'site:boote-forum.de Reffenthal',
    'site:boote-forum.de "Otterstädter Altrhein"',
    'site:boote-forum.de "Angelhofer Altrhein"',
    'site:boote-forum.de "Pegel Speyer" Einfahrt',
]

# Begriffe, die zwingend im Ergebnis vorkommen müssen
REQUIRED_TERMS: list[str] = [
    "reffenthal",
    "otterstädter altrhein",
    "angelhofer altrhein",
    "reffenthaler",
]


def _is_relevant(title: str, body: str) -> bool:
    """Prüft ob ein Suchergebnis einen der Pflichtbegriffe enthält."""
    combined = f"{title} {body}".lower()
    return any(term.lower() in combined for term in REQUIRED_TERMS)


def search_web(query: str, max_results: int = 5) -> list[dict]:
    """Durchsucht DuckDuckGo nach einer Suchanfrage.

    Args:
        query: Suchbegriff.
        max_results: Maximale Anzahl Ergebnisse pro Suche.

    Returns:
        Liste mit Ergebnissen als Dicts mit 'title', 'href', 'body', 'date'.
    """
    results: list[dict] = []
    try:
        with DDGS() as ddgs:
            raw = ddgs.text(
                query,
                max_results=max_results,
                timelimit="w",  # letzte Woche
            )
            for item in raw:
                results.append({
                    "title": item.get("title", ""),
                    "link": item.get("href", ""),
                    "body": item.get("body", ""),
                    "query": query,
                })
        logger.debug("Websuche '%s': %d Ergebnisse", query, len(results))
    except Exception as exc:  # noqa: BLE001
        logger.error("Websuche: Fehler bei '%s': %s", query, exc)

    return results


def check_web() -> list[dict]:
    """Führt alle Web-Suchanfragen durch und gibt relevante Treffer zurück.

    Dedupliziert nach URL und filtert nach Relevanz.
    Durchsucht allgemeines Web sowie gezielt boote-forum.de.
    """
    seen_links: set[str] = set()
    all_results: list[dict] = []

    for query in WEB_SEARCH_QUERIES + FORUM_SEARCH_QUERIES:
        entries = search_web(query)
        for entry in entries:
            link = entry.get("link", "")
            if not link or link in seen_links:
                continue
            # Nur Ergebnisse mit Pflichtbegriffen durchlassen
            if not _is_relevant(entry.get("title", ""), entry.get("body", "")):
                logger.debug("Websuche: Übersprungen (nicht relevant): %s", entry.get("title"))
                continue
            seen_links.add(link)
            all_results.append(entry)

    logger.info("Websuche gesamt: %d relevante Treffer", len(all_results))
    return all_results


def format_telegram_message(entry: dict) -> str:
    """Formatiert ein Web-Suchergebnis als Telegram-Nachricht."""
    title = entry.get("title", "Kein Titel")
    link = entry.get("link", "")
    body = entry.get("body", "")
    query = entry.get("query", "")

    # Vorschautext kürzen
    snippet = body[:200].strip()
    if len(body) > 200:
        snippet += "…"

    return (
        f"🔎 *Neuer Web-Treffer*\n\n"
        f"*{title}*\n\n"
        f"_{snippet}_\n\n"
        f"🔍 Suche: {query}\n"
        f"🔗 {link}"
    )
