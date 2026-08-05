"""
Telegram-Versand für den Reffenthal-Wächter.

Sendet Nachrichten über die Telegram Bot API.
"""

import logging

import requests

from config import HTTP_TIMEOUT, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, USER_AGENT

logger = logging.getLogger(__name__)


def send_message(text: str) -> bool:
    """Sendet eine Textnachricht an den konfigurierten Telegram-Chat.

    Args:
        text: Der Nachrichtentext (Markdown-Formatierung erlaubt).

    Returns:
        True bei Erfolg, False bei Fehler.
    """
    if not TELEGRAM_BOT_TOKEN:
        logger.error("Telegram: TELEGRAM_BOT_TOKEN ist nicht gesetzt.")
        return False

    if not TELEGRAM_CHAT_ID:
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
