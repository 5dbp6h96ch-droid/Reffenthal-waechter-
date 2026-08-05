"""
Reffenthal-Wächter – Hauptprogramm.

Führt alle Überwachungsmodule aus:
  1. RSS-Feeds prüfen
  2. Pegel Speyer prüfen
  3. Telegram-Benachrichtigungen senden

Start: python watcher.py
"""

import logging
import sys

import config
import pegel
import rss
import storage
import telegram

# ── Logging einrichten ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)

logger = logging.getLogger(__name__)


def run_rss(seen: set[str]) -> set[str]:
    """Prüft alle RSS-Feeds und sendet neue Treffer per Telegram.

    Args:
        seen: Bereits versendete Eintrags-IDs.

    Returns:
        Aktualisierte seen-Menge.
    """
    logger.info("─── RSS-Check startet ───")
    entries = rss.check_all_feeds()

    new_count = 0
    for entry in entries:
        if entry.entry_id in seen:
            logger.debug("RSS: Übersprungen (bereits gesendet): %s", entry.title)
            continue

        msg = rss.format_telegram_message(entry)
        success = telegram.send_message(msg)

        if success:
            seen.add(entry.entry_id)
            new_count += 1
            logger.info("RSS: Gesendet – %s", entry.title)
        else:
            logger.warning("RSS: Senden fehlgeschlagen – %s", entry.title)

    logger.info("RSS: %d neue Meldungen gesendet.", new_count)
    return seen


def run_pegel(state: dict) -> dict:
    """Prüft den Pegel Speyer und sendet Telegram-Alarm bei Bedarf.

    Args:
        state: Gespeicherter Pegel-Zustand.

    Returns:
        Aktualisierter Zustand.
    """
    logger.info("─── Pegel-Check startet ───")
    current = pegel.fetch_pegel()

    if current is None:
        logger.warning("Pegel: Kein Messwert – überspringe.")
        return state

    value_cm = current["value_cm"]
    timestamp = current["timestamp"]
    logger.info("Pegel: %d cm", value_cm)

    analysis = pegel.analyze_pegel(current, state)
    updated_state = analysis["updated_state"]

    # Niedrigwasser-Warnung hat Vorrang
    if analysis["low_alert"]:
        msg = pegel.format_low_alert_message(value_cm, timestamp)
        success = telegram.send_message(msg)
        if success:
            logger.info("Pegel: Niedrigwasser-Alarm gesendet.")
        else:
            logger.warning("Pegel: Niedrigwasser-Alarm konnte nicht gesendet werden.")

    # Nur bei signifikanter Änderung und kein Alarm (Doppelnachricht vermeiden)
    elif analysis["changed"]:
        msg = pegel.format_change_message(value_cm, analysis["delta_cm"], timestamp)
        success = telegram.send_message(msg)
        if success:
            logger.info("Pegel: Änderungsmeldung gesendet.")
        else:
            logger.warning("Pegel: Änderungsmeldung konnte nicht gesendet werden.")

    else:
        logger.info("Pegel: Keine signifikante Änderung (< %d cm).",
                    config.PEGEL_CHANGE_THRESHOLD_CM)

    return updated_state


def main() -> None:
    """Hauptfunktion – startet alle Überwachungsmodule."""
    logger.info("══════════════════════════════════════")
    logger.info("  Reffenthal-Wächter gestartet")
    logger.info("══════════════════════════════════════")

    # Prüfe Token
    if not config.TELEGRAM_BOT_TOKEN:
        logger.error(
            "TELEGRAM_BOT_TOKEN ist nicht gesetzt! "
            "Bitte als Replit Secret hinterlegen."
        )

    if config.TELEGRAM_CHAT_ID.startswith("-1001234567890"):
        logger.warning(
            "TELEGRAM_CHAT_ID ist noch der Platzhalter. "
            "Bitte in config.py anpassen."
        )

    # Zustand laden
    seen = storage.load_seen(config.SEEN_FILE)
    state = storage.load_state(config.STATE_FILE)
    logger.info("Bekannte RSS-Einträge: %d", len(seen))

    # RSS überwachen
    try:
        seen = run_rss(seen)
    except Exception as exc:  # noqa: BLE001
        logger.error("RSS: Unerwarteter Fehler: %s", exc)

    # Pegel überwachen
    try:
        state = run_pegel(state)
    except Exception as exc:  # noqa: BLE001
        logger.error("Pegel: Unerwarteter Fehler: %s", exc)

    # Zustand speichern
    storage.save_seen(config.SEEN_FILE, seen)
    storage.save_state(config.STATE_FILE, state)
    logger.info("Zustand gespeichert.")

    logger.info("══════════════════════════════════════")
    logger.info("  Fertig.")
    logger.info("══════════════════════════════════════")


if __name__ == "__main__":
    main()
