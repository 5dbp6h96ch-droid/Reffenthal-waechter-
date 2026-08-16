"""Web-Push bridge for the Reffenthal-Wächter."""

import logging
import os
import re

import requests

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL",
    "https://azssnqabyefqplnoehty.supabase.co",
).rstrip("/")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
PUSH_URL = f"{SUPABASE_URL}/functions/v1/send-event-push"


def _clean_markdown(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    text = re.sub(r"[*_`\\]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _link(text: str) -> str:
    match = re.search(r"\[[^\]]+\]\((https?://[^\)]+)\)", text)
    return match.group(1) if match else "/"


def _number_after(label: str, text: str) -> int | None:
    match = re.search(rf"{re.escape(label)}\s*:?\s*(\d+)\s*cm", text, re.IGNORECASE)
    return int(match.group(1)) if match else None


def classify_telegram(text: str) -> tuple[str, str, str, str, dict] | None:
    """Map watcher alerts to Web-Push events and include alert metadata."""
    clean = _clean_markdown(text)
    url = _link(text)

    if text.startswith("⚓ *NfB "):
        return ("wsv_news", "Neue WSV-Meldung", clean[:240], url, {})

    if text.startswith("*Niedrigwasser-Warnung"):
        current = _number_after("Aktuell", text)
        threshold = _number_after("Unter Schwelle", text)
        return (
            "threshold_crossed",
            "Pegelwarnung",
            clean[:240],
            "/",
            {
                "gauge_id": "SPEYER",
                "current_cm": current,
                "threshold_cm": threshold,
            },
        )

    if text.startswith("💧 *Pegel Speyer – Änderung*"):
        current = _number_after("Aktuell", text)
        return (
            "gauge_change",
            "Pegeländerung",
            clean[:240],
            "/",
            {"gauge_id": "SPEYER", "current_cm": current},
        )

    return None


def send_for_alert(text: str) -> bool:
    """Send the corresponding Web Push for a supported watcher alert."""
    if not SUPABASE_SECRET_KEY:
        logger.info("WebPush: SUPABASE_SECRET_KEY fehlt – Push übersprungen.")
        return False

    event = classify_telegram(text)
    if event is None:
        return False

    event_type, title, body, url, metadata = event
    payload = {
        "event_type": event_type,
        "title": title,
        "body": body,
        "url": url,
        **metadata,
    }

    try:
        response = requests.post(
            PUSH_URL,
            json=payload,
            headers={
                "apikey": SUPABASE_SECRET_KEY,
                "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
            },
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
