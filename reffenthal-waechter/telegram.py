"""
Telegram-Versand für den Reffenthal-Wächter.

Sendet Nachrichten über die Telegram Bot API und löst für die relevanten
Wächter-Alerts zusätzlich Web Push aus.
"""

import logging
import os

import requests

from config import HTTP_TIMEOUT, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, USER_AGENT
from webpush import send_for_alert, send_push

logger = logging.getLogger(__name__)


def send_message(text: str, push_meta: dict | None = None) -> bool:
    """Sendet Telegram und – bei relevanten Alerts – zusätzlich Web Push.

    Im isolierten Testlauf kann WEBPUSH_WITHOUT_TELEGRAM=1 gesetzt werden.
    Dann wird ein strukturierter Web-Push auch ohne Telegram-Zugangsdaten
    ausgelöst. Diese Ausnahme ist bewusst über eine eigene Umgebungsvariable
    opt-in und wird in Production nicht gesetzt.
    """
    push_without_telegram = os.environ.get("WEBPUSH_WITHOUT_TELEGRAM") == "1"

    if not TELEGRAM_BOT_TOKEN:
        if push_without_telegram and push_meta is not None:
            logger.info("Testmodus: Telegram fehlt – WebPush wird direkt ausgelöst.")
            try:
                return bool(send_push(push_meta))
            except Exception as exc:  # noqa: BLE001
                logger.warning("WebPush: unerwarteter Fehler: %s", exc)
                return False
        logger.error("Telegram: TELEGRAM_BOT_TOKEN ist nicht gesetzt.")
        return False

    if not TELEGRAM_CHAT_ID:
        if push_without_telegram and push_meta is not None:
            logger.info("Testmodus: Telegram-Chat-ID fehlt – WebPush wird direkt ausgelöst.")
            try:
                return bool(send_push(push_meta))
            except Exception as exc:  # noqa: BLE001
                logger.warning("WebPush: unerwarteter Fehler: %s", exc)
                return False
        logger.error("Telegram: TELEGRAM_CHAT_ID ist nicht konfiguriert.")
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": False,
    }
    headers = {"User-Agent": USER_AGENT}

    try:
        response = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=HTTP_TIMEOUT,
        )
        response.raise_for_status()
        logger.info("Telegram: Nachricht gesendet (%d Zeichen).", len(text))
        try:
            if push_meta is not None:
                send_push(push_meta)
            else:
                send_for_alert(text)
        except Exception as exc:  # noqa: BLE001
            logger.warning("WebPush: unerwarteter Fehler: %s", exc)
        return True
    except requests.exceptions.Timeout:
        logger.error("Telegram: Zeitüberschreitung beim Senden.")
    except requests.exceptions.ConnectionError as exc:
        logger.error("Telegram: Verbindungsfehler: %s", exc)
    except requests.exceptions.HTTPError as exc:
        logger.error(
            "Telegram: HTTP-Fehler %s – %s",
            exc.response.status_code,
            exc.response.text,
        )
    except requests.exceptions.RequestException as exc:
        logger.error("Telegram: Unbekannter Fehler: %s", exc)

    return False
