"""
Elwis NfB (Nachrichten für Binnenschiffer) Monitor.

Überwacht offizielle Schifffahrtsnachrichten für den Rhein bei Speyer
(ca. km 360–440). Elwis selbst ist nicht direkt scrapbar (JavaScript-Rendering),
daher wird DuckDuckGo genutzt, um neue indexierte Seiten auf elwis.de und der
WSA Oberrhein zu finden.
"""

import logging
import re

from ddgs import DDGS

from config import HTTP_TIMEOUT, USER_AGENT

logger = logging.getLogger(__name__)

# Suchanfragen – gezielt auf Elwis und WSA Oberrhein
ELWIS_QUERIES: list[str] = [
    'site:elwis.de Rhein NfB Oberrhein Speyer OR Germersheim',
    'site:elwis.de "Oberrhein" Schifffahrt Rhein NfB',
    'site:wsa-oberrhein.wsv.de Schifffahrt Rhein Nachrichten',
    'site:wsa-rhein.wsv.de NfB Rhein km 3 OR km 4',
]

# Rhein-km-Bereich rund um Speyer/Altrhein (±40 km Puffer)
_KM_MIN = 360
_KM_MAX = 440

# Mindestens eines dieser Wörter muss im Ergebnis vorkommen
_RHEIN_TERMS = [
    "rhein", "oberrhein", "speyer", "germersheim", "philippsburg",
    "nfb", "nachrichten für binnenschiffer", "schifffahrt",
    "wasserstraße", "fahrrinne", "fahrwasser", "schleuse",
]

# Negative Keywords – irrelevante Seiten ausfiltern
_EXCLUDE_TERMS = [
    "impressum", "datenschutz", "kontakt", "karriere",
    "organigramm", "login", "sitemap",
]


def _is_relevant(title: str, body: str, link: str = "") -> bool:
    """Prüft ob ein Elwis-Treffer relevant ist.

    Kriterien:
    - Enthält einen Rhein/NfB-Begriff
    - KEIN reiner Impressum/Datenschutz-Link
    - Optional: enthält km-Angabe im Bereich 360–440
    """
    combined = f"{title} {body} {link}".lower()

    # Ausschlussliste
    if any(ex in combined for ex in _EXCLUDE_TERMS):
        return False

    # Muss mindestens einen Rhein-Begriff enthalten
    if not any(term in combined for term in _RHEIN_TERMS):
        return False

    # Wenn km-Angabe vorhanden: im Speyer-Bereich?
    km_matches = re.findall(r'km\s*(\d{3})', combined)
    if km_matches:
        km_values = [int(k) for k in km_matches]
        if not any(_KM_MIN <= k <= _KM_MAX for k in km_values):
            return False

    return True


def check_elwis() -> list[dict]:
    """Sucht nach neuen Elwis/WSA-Schifffahrtsnachrichten für den Rhein.

    Returns:
        Liste von Treffern als Dicts mit 'title', 'link', 'body', 'query'.
    """
    seen_links: set[str] = set()
    results: list[dict] = []

    for query in ELWIS_QUERIES:
        try:
            with DDGS() as ddgs:
                hits = list(ddgs.text(query, max_results=5))
        except Exception as exc:
            logger.warning("Elwis-Suche: Fehler bei %r: %s", query, exc)
            continue

        for hit in hits:
            link = hit.get("href", hit.get("link", ""))
            title = hit.get("title", "")
            body = hit.get("body", "")

            if not link or link in seen_links:
                continue

            if not _is_relevant(title, body, link):
                logger.debug("Elwis: Übersprungen (nicht relevant): %s", title[:60])
                continue

            seen_links.add(link)
            results.append({
                "title": title,
                "link": link,
                "body": body,
                "query": query,
                "source": "elwis",
            })

    logger.info("Elwis: %d relevante Treffer gefunden.", len(results))
    return results


def _escape_md(text: str) -> str:
    """Escaped Sonderzeichen für Telegram MarkdownV1."""
    for ch in ('_', '*', '`', '['):
        text = text.replace(ch, f'\\{ch}')
    return text


def format_telegram_message(entry: dict) -> str:
    """Formatiert einen Elwis/WSA-Treffer als Telegram-Nachricht."""
    title = _escape_md(entry.get("title", "Kein Titel"))
    link = entry.get("link", "")
    body = entry.get("body", "")

    snippet = body[:200].strip()
    if len(body) > 200:
        snippet += "…"
    snippet = _escape_md(snippet)

    return (
        f"⚓ *Elwis / WSA Schifffahrtsnachricht*\n\n"
        f"*{title}*\n\n"
        f"_{snippet}_\n\n"
        f"🔗 [Zur Nachricht]({link})"
    )
