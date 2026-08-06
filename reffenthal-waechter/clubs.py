"""
Vereins- und Hafenwebseiten-Monitor für den Reffenthal-Wächter.

Prüft die Homepages lokaler Clubs und Häfen auf Neuigkeiten,
die mit Wasserstand, Sperrungen oder dem Revier zusammenhängen.

Dedup-Schlüssel in seen.json:  club:{domain}:{content_hash}
"""

import hashlib
import logging
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from config import HTTP_TIMEOUT, USER_AGENT

logger = logging.getLogger(__name__)

# ── Clubs & Häfen ──────────────────────────────────────────────────────────────
# Jeder Eintrag: name, urls (Homepage + optionale Unterseiten)
CLUBS: list[dict] = [
    {
        "name": "1. MBC Speyer",
        "icon": "⚓",
        "urls": [
            "https://mbc-speyer.de/",
        ],
    },
    {
        "name": "Yachthafen Speyer",
        "icon": "🚢",
        "urls": [
            "https://yachthafen-speyer.de/",
        ],
    },
    {
        "name": "YC Otterstadt (Angelhofer Altrhein)",
        "icon": "⛵",
        "urls": [
            "https://ycoa.de/",
        ],
    },
    {
        "name": "MYCL Kiefweiher",
        "icon": "🚤",
        "urls": [
            "https://www.mycl.de/",
        ],
    },
    {
        "name": "WCC Kiefweiher",
        "icon": "🏕️",
        "urls": [
            "http://www.wcc-kiefweiher.de/",
        ],
    },
]

# Schlüsselwörter: Mindestens eines muss in einem News-Absatz vorkommen
ALERT_KEYWORDS: list[str] = [
    "niedrigwasser",
    "hochwasser",
    "sperrung",
    "gesperrt",
    "geschlossen",
    "einfahrt",
    "zufahrt",
    "fahrverbot",
    "pegel",
    "wasserstand",
    "wassertiefe",
    "tiefgang",
    "versandung",
    "fahrrinne",
    "grundberührung",
    "sanierung",
    "baggerung",
    "schleuse",
    "warnung",
    "absage",
    "abgesagt",
]

# CSS-Selektoren für News-Bereiche (werden der Reihe nach probiert)
NEWS_SELECTORS: list[str] = [
    "article",
    ".news",
    ".post",
    ".entry",
    ".aktuell",
    ".meldung",
    "main",
]

# Maximale Textlänge pro News-Item für Telegram
MAX_SNIPPET_LEN: int = 280


# ── Interne Hilfsfunktionen ───────────────────────────────────────────────────

def _fetch_html(url: str) -> str | None:
    """Lädt eine URL und gibt den HTML-Text zurück. None bei Fehler."""
    try:
        resp = requests.get(
            url,
            timeout=HTTP_TIMEOUT,
            headers={"User-Agent": USER_AGENT},
            allow_redirects=True,
        )
        resp.raise_for_status()
        return resp.text
    except Exception as exc:  # noqa: BLE001
        logger.warning("Clubs: Fehler beim Abrufen von %s: %s", url, exc)
        return None


def _extract_news_blocks(html: str) -> list[str]:
    """Extrahiert Text-Blöcke aus News-/Artikel-Bereichen einer Seite."""
    soup = BeautifulSoup(html, "html.parser")
    blocks: list[str] = []

    # Zuerst gezielte News-Selektoren probieren
    for selector in NEWS_SELECTORS:
        elements = soup.select(selector)
        if elements:
            for el in elements:
                text = el.get_text(separator=" ", strip=True)
                if len(text) > 30:
                    blocks.append(text)
            if blocks:
                return blocks

    # Fallback: alle <p> und <h2>/<h3> Texte
    for tag in soup.find_all(["h2", "h3", "p"]):
        text = tag.get_text(strip=True)
        if len(text) > 30:
            blocks.append(text)

    return blocks


def _content_hash(text: str) -> str:
    """Kurzer SHA-256-Hash des bereinigten Texts (erste 12 Zeichen)."""
    normalized = " ".join(text.lower().split())
    return hashlib.sha256(normalized.encode()).hexdigest()[:12]


def _is_relevant(text: str) -> bool:
    """Prüft ob ein Text ein Alarm-Schlüsselwort enthält."""
    lower = text.lower()
    return any(kw in lower for kw in ALERT_KEYWORDS)


def _domain(url: str) -> str:
    """Extrahiert die Domain aus einer URL."""
    return urlparse(url).netloc.replace("www.", "")


def _shorten(text: str, maxlen: int = MAX_SNIPPET_LEN) -> str:
    """Kürzt Text auf maxlen Zeichen."""
    text = " ".join(text.split())  # Leerzeichen normalisieren
    if len(text) <= maxlen:
        return text
    return text[:maxlen].rsplit(" ", 1)[0] + " …"


# ── Öffentliche API ───────────────────────────────────────────────────────────

def check_clubs(seen: set[str]) -> list[dict]:
    """Prüft alle Club-Webseiten auf relevante Neuigkeiten.

    Args:
        seen: Bereits gemeldete Dedup-Schlüssel.

    Returns:
        Liste von dicts mit keys: name, icon, url, snippet, dedup_key
    """
    results: list[dict] = []

    for club in CLUBS:
        club_name = club["name"]
        club_icon = club["icon"]

        for url in club["urls"]:
            html = _fetch_html(url)
            if not html:
                continue

            blocks = _extract_news_blocks(html)
            domain = _domain(url)

            for block in blocks:
                if not _is_relevant(block):
                    continue

                chash = _content_hash(block)
                dedup_key = f"club:{domain}:{chash}"

                if dedup_key in seen:
                    logger.debug("Clubs: Übersprungen (bekannt): %s / %s", club_name, chash)
                    continue

                snippet = _shorten(block)
                results.append({
                    "name": club_name,
                    "icon": club_icon,
                    "url": url,
                    "snippet": snippet,
                    "dedup_key": dedup_key,
                })
                logger.info("Clubs: Neuer Treffer – %s: %s…", club_name, snippet[:60])

    return results


def _escape_md(text: str) -> str:
    """Escaped Sonderzeichen für Telegram MarkdownV1."""
    for ch in ("_", "*", "`", "["):
        text = text.replace(ch, f"\\{ch}")
    return text


def format_telegram_message(entry: dict) -> str:
    """Formatiert einen Club-Treffer als Telegram-Nachricht."""
    icon = entry.get("icon", "📢")
    name = _escape_md(entry.get("name", ""))
    snippet = _escape_md(entry.get("snippet", ""))
    url = entry.get("url", "")

    return (
        f"{icon} *{name}*\n\n"
        f"{snippet}\n\n"
        f"🔗 [Zur Webseite]({url})"
    )
