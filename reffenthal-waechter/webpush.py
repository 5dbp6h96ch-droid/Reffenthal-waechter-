"""Web-Push bridge for the TEST watcher.

The private Supabase server key is read only from the runtime environment.
If it is not configured, the watcher keeps its existing Telegram behaviour and
logs that Web Push is skipped.
"""

import logging
import os
import re

import requests

logger = logging.getLogger(__name__)

# Beide Werte kommen ausschließlich aus der Runtime-Umgebung (GitHub Secrets).
# Fehlt einer, wird Web Push übersprungen – Telegram bleibt unberührt.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
PUSH_URL = f"{SUPABASE_URL}/functions/v1/send-event-push" if SUPABASE_URL else ""


def _clean_markdown(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    text = re.sub(r"[*_`\\]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _link(text: str) -> str:
    match = re.search(r"\[[^\]]+\]\((https?://[^\)]+)\)", text)
    return match.group(1) if match else "/"


def classify_telegram(text: str) -> tuple[str, str, str, str] | None:
    """Map existing watcher alerts to the three requested Web-Push events."""
    clean = _clean_markdown(text)
    url = _link(text)

    if text.startswith("⚓ *NfB "):
        return (
            "wsv_news",
            "Neue WSV-Meldung",
            clean[:240],
            url,
        )

    if text.startswith("⚠️ *Niedrigwasser-Warnung"):
        return (
            "threshold_crossed",
            "Pegelwarnung",
            clean[:240],
            "/",
        )

    if text.startswith("💧 *Pegel Speyer – Änderung*"):
        return (
            "gauge_change",
            "Pegeländerung",
            clean[:240],
            "/",
        )

    return None


def send_for_alert(text: str) -> bool:
    """Send the corresponding Web Push for a supported watcher alert."""
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        logger.info(
            "WebPush: SUPABASE_URL/SUPABASE_SECRET_KEY fehlt – Push übersprungen."
        )
        return False

    event = classify_telegram(text)
    if event is None:
        return False

    event_type, title, body, url = event
    payload = {
        "event_type": event_type,
        "title": title,
        "body": body,
        "url": url,
        "gauge_id": "SPEYER",
        "threshold_cm": 225,
    }

    try:
        response = requests.post(
            PUSH_URL,
            json=payload,
            headers={"apikey": SUPABASE_SECRET_KEY},
            timeout=15,
        )
        if response.ok:
            data = response.json()
            logger.info(
                "WebPush: %s – %d Push(s) gesendet.",
                event_type,
                int(data.get("sent", 0)),
            )
            return bool(data.get("ok"))
        logger.warning(
            "WebPush: %s fehlgeschlagen (%d): %s",
            event_type,
            response.status_code,
            response.text[:300],
        )
    except requests.exceptions.RequestException as exc:
        logger.warning("WebPush: Verbindungsfehler: %s", exc)
    except ValueError as exc:
        logger.warning("WebPush: Ungültige Antwort: %s", exc)

    return False
