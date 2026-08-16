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
    '"Berghäuser Altrhein"',
    '"Kiefweiher" Speyer',
]

# Boote-Forum wird ausschließlich über RSS überwacht (rss.py) –
# dort greift der 7-Tage-Filter zuverlässig.
# site:-Suchen bei DuckDuckGo ignorieren timelimit="w" oft und liefern
# jahrelang alte Threads zurück. Deshalb werden Web-Treffer zusätzlich
# anhand des von DuckDuckGo gelieferten Veröffentlichungsdatums geprüft.

# Gezielte Suche auf Facebook (nur öffentliche Seiten & Gruppen)
FACEBOOK_SEARCH_QUERIES: list[str] = [
    'site:facebook.com Reffenthal',
    'site:facebook.com "Otterstädter Altrhein"',
    'site:facebook.com "Berghäuser Altrhein"',
    'site:facebook.com Kiefweiher Speyer',
]

# Begriffe, die zwingend im Ergebnis vorkommen müssen (Orts-Bezug)
REQUIRED_TERMS: list[str] = [
    "reffenthal",
    "otterstädter altrhein",
    "angelhofer altrhein",
    "berghäuser altrhein",
    "reffenthaler",
    "kiefweiher",
]

# Mindestens eines dieser Wörter muss vorkommen (Boot-Bezug).
# Ausnahme: Ergebnisse von boote-forum.de sind immer relevant.
BOAT_TERMS: list[str] = [
    # Fahrzeugtypen
    "boot", "boote", "yacht", "yachten", "sportboot", "motorboot",
    "segelboot", "hausboot", "kajak", "kanu", "schiff",
    # Nautik & Infrastruktur
    "tiefgang", "slipanlage", "slip", "anker", "ankern",
    "liegeplatz", "marina", "schleuse", "fahrwasser", "fahrrinne",
    # Gewässer & Pegelzustand
    "einfahrt", "zufahrt", "wassertiefe", "versandung",
    "pegelstand", "wasserstand", "niedrigwasser", "pegel",
]


def _is_relevant(title: str, body: str, link: str = "") -> bool:
    """Prüft ob ein Suchergebnis Orts- UND Boot-Bezug hat.

    Ergebnisse von boote-forum.de sind immer relevant (Boot-Kontext gesichert).
    """
    combined = f"{title} {body}".lower()
    has_location = any(term.lower() in combined for term in REQUIRED_TERMS)
    if not has_location:
        return False
    if "boote-forum.de" in link.lower():
        return True
    return any(term in combined for term in BOAT_TERMS)


def _is_recent(date_value: object, days: int = 7) -> bool:
    """Prüft, ob ein Treffer höchstens 'days' Tage alt ist.

    Treffer ohne verwertbares Veröffentlichungsdatum werden verworfen,
    damit alte Beiträge nicht trotz DuckDuckGo-timelimit durchrutschen.
    """
    if not date_value:
        return False

    try:
        if isinstance(date_value, datetime):
            published = date_value.replace(tzinfo=None)
        else:
            value = str(date_value).strip()
            if value.endswith("Z"):
                value = value[:-1] + "+00:00"
            published = datetime.fromisoformat(value)
            if published.tzinfo is not None:
                published = published.astimezone().replace(tzinfo=None)

        now = datetime.now()
        cutoff = now - timedelta(days=days)
        return cutoff <= published <= now
    except (TypeError, ValueError, OverflowError) as exc:
        logger.debug("Websuche: Ungültiges Veröffentlichungsdatum '%s': %s", date_value, exc)
        return False


def search_web(query: str, max_results: int = 5) -> list[dict]:
    """Durchsucht DuckDuckGo nach einer Suchanfrage."""
    results: list[dict] = []
    try:
        with DDGS() as ddgs:
            raw = ddgs.text(
                query,
                max_results=max_results,
                timelimit="w",  # letzte Woche
            )
            for item in raw:
                published_date = item.get("date") or item.get("published")
                if not _is_recent(published_date):
                    logger.debug(
                        "Websuche: Übersprungen (älter als 7 Tage oder ohne Datum): %s",
                        item.get("title", ""),
                    )
                    continue
                results.append({
                    "title": item.get("title", ""),
                    "link": item.get("href", ""),
                    "body": item.get("body", ""),
                    "query": query,
                    "date": published_date,
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

    for query in WEB_SEARCH_QUERIES + FACEBOOK_SEARCH_QUERIES:
        entries = search_web(query)
        for entry in entries:
            link = entry.get("link", "")
            if not link or link in seen_links:
                continue
            if not _is_relevant(entry.get("title", ""), entry.get("body", ""), entry.get("link", "")):
                logger.debug("Websuche: Übersprungen (nicht relevant): %s", entry.get("title"))
                continue
            seen_links.add(link)
            all_results.append(entry)

    logger.info("Websuche gesamt: %d relevante Treffer", len(all_results))
    return all_results


def _escape_md(text: str) -> str:
    """Escaped Sonderzeichen für Telegram MarkdownV1."""
    for ch in ('_', '*', '`', '['):
        text = text.replace(ch, f'\\{ch}')
    return text


def format_telegram_message(entry: dict) -> str:
    """Formatiert ein Web-Suchergebnis als Telegram-Nachricht."""
    title = _escape_md(entry.get("title", "Kein Titel"))
    link = entry.get("link", "")
    body = entry.get("body", "")
    query = _escape_md(entry.get("query", ""))

    snippet = body[:200].strip()
    if len(body) > 200:
        snippet += "…"
    snippet = _escape_md(snippet)

    return (
        f"🔎 *Neuer Web-Treffer*\n\n"
        f"*{title}*\n\n"
        f"_{snippet}_\n\n"
        f"🔍 Suche: {query}\n"
        f"🔗 [Zum Artikel]({link})"
    )
