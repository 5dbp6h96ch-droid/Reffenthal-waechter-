"""
Konfiguration für den Reffenthal-Wächter.

Alle zentralen Einstellungen: Suchbegriffe, Grenzwerte, Telegram, HTTP.
"""

import os

# ── Telegram ──────────────────────────────────────────────────────────────────
# Bot-Token aus Replit Secrets laden
TELEGRAM_BOT_TOKEN: str = os.environ.get("TELEGRAM_BOT_TOKEN", "")

# Deine persönliche Chat-ID (Gruppe oder Einzelperson)
# Ermittle sie mit: https://t.me/userinfobot
TELEGRAM_CHAT_ID: str = "916729935"

# ── RSS ───────────────────────────────────────────────────────────────────────
RSS_FEEDS: list[str] = [
    "https://www.boote-forum.de/external.php?type=rss2",
]

# Suchbegriffe (Groß-/Kleinschreibung egal)
SEARCH_TERMS: list[str] = [
    "Reffenthal",
    "Reffenthaler",
    "Angelhofer Altrhein",
    "Otterstädter Altrhein",
    "Berghäuser Altrhein",
    "Wassertiefe",
    "Wasserstand",
    "Versandung",
    "Zufahrt",
    "Einfahrt",
    "Pegel Speyer",
]

# ── Pegel ─────────────────────────────────────────────────────────────────────
# Offizielles WSV-Pegelonline REST-API
PEGEL_API_URL: str = (
    "https://pegelonline.wsv.de/webservices/rest-api/v2/stations/"
    "SPEYER/W/currentmeasurement.json"
)

# Alarm-Schwelle: Pegel unter diesem Wert → Warnung
PEGEL_LOW_THRESHOLD_CM: int = 225

# Mindestveränderung in cm, ab der ein Update gesendet wird
PEGEL_CHANGE_THRESHOLD_CM: int = 5

# ── HTTP ──────────────────────────────────────────────────────────────────────
HTTP_TIMEOUT: int = 15  # Sekunden

USER_AGENT: str = (
    "Mozilla/5.0 (compatible; Reffenthal-Waechter/1.0; "
    "+https://github.com/reffenthal-waechter)"
)

# ── Tagesbericht ──────────────────────────────────────────────────────────────
# Stunde (0–23), zu der der tägliche Pegelstand gesendet wird
DAILY_REPORT_HOUR: int = 8

# ── Dateipfade ────────────────────────────────────────────────────────────────
SEEN_FILE: str = "seen.json"
STATE_FILE: str = "state.json"
