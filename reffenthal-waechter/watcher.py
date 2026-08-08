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

from datetime import datetime

import clubs
import config
import db
import pegel
import rss
import storage
import telegram
import websearch
from storage import normalize_url

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

    # Dauerhaft in Datenbank speichern (Wochen-/Monatstrends)
    db.save_pegel(value_cm, timestamp)

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

    # Tagesbericht prüfen
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    last_report = state.get("last_daily_report_date")

    if now.hour >= config.DAILY_REPORT_HOUR and last_report != today_str:
        msg = pegel.format_daily_report_message(
            value_cm, timestamp, updated_state["history"]
        )
        success = telegram.send_message(msg)
        if success:
            updated_state["last_daily_report_date"] = today_str
            logger.info("Pegel: Tagesbericht gesendet.")
        else:
            logger.warning("Pegel: Tagesbericht konnte nicht gesendet werden.")

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

    # Laufstatus-Tracking
    rss_new_count = 0
    last_error: str | None = None

    # Zustand laden
    seen = storage.load_seen(config.SEEN_FILE)
    state = storage.load_state(config.STATE_FILE)
    logger.info("Bekannte RSS-Einträge: %d", len(seen))

    # RSS überwachen
    try:
        seen_before = len(seen)
        seen = run_rss(seen)
        rss_new_count += len(seen) - seen_before
    except Exception as exc:  # noqa: BLE001
        logger.error("RSS: Unerwarteter Fehler: %s", exc)
        last_error = f"RSS: {exc}"

    # Web-Recherche
    try:
        logger.info("─── Web-Recherche startet ───")
        web_results = websearch.check_web()
        web_new = 0
        for entry in web_results:
            link = entry.get("link", "")
            if not link:
                continue
            norm = normalize_url(link)
            if norm in seen:
                continue
            msg = websearch.format_telegram_message(entry)
            success = telegram.send_message(msg)
            if success:
                seen.add(norm)
                web_new += 1
                rss_new_count += 1
        logger.info("Web-Recherche: %d neue Treffer gesendet.", web_new)
    except Exception as exc:  # noqa: BLE001
        logger.error("Web-Recherche: Unerwarteter Fehler: %s", exc)
        if last_error is None:
            last_error = f"Web-Recherche: {exc}"

    # Club- und Hafenwebseiten auf Neuigkeiten prüfen
    try:
        logger.info("─── Club-Check startet ───")
        clubs_seen_list = storage.load_clubs_seen(config.CLUBS_FILE)
        clubs_seen_keys = {e["dedup_key"] for e in clubs_seen_list}
        club_results = clubs.check_clubs(seen)
        clubs_new = 0
        for entry in club_results:
            dedup_key = entry["dedup_key"]
            msg = clubs.format_telegram_message(entry)
            success = telegram.send_message(msg)
            if success:
                seen.add(dedup_key)
                clubs_new += 1
                rss_new_count += 1
                # Persistiere vollständigen Treffer in clubs_seen.json
                if dedup_key not in clubs_seen_keys:
                    clubs_seen_list.append({
                        "name": entry["name"],
                        "icon": entry["icon"],
                        "url": entry["url"],
                        "snippet": entry["snippet"],
                        "dedup_key": dedup_key,
                        "seen_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                    })
                    clubs_seen_keys.add(dedup_key)
        storage.save_clubs_seen(config.CLUBS_FILE, clubs_seen_list)
        logger.info("Clubs: %d neue Meldungen gesendet.", clubs_new)
    except Exception as exc:  # noqa: BLE001
        logger.error("Clubs: Unerwarteter Fehler: %s", exc)
        if last_error is None:
            last_error = f"Clubs: {exc}"

    # Hinweis: ELWIS-NfB-Scan und Telegram-Alerts werden vollständig vom
    # NfB-Monitor (artifacts/nfb-monitor/app.py) übernommen.
    # Kein separater ELWIS-Scan mehr im Wächter → kein Doppel-Scan.

    # Pegel überwachen
    try:
        state = run_pegel(state)
    except Exception as exc:  # noqa: BLE001
        logger.error("Pegel: Unerwarteter Fehler: %s", exc)
        if last_error is None:
            last_error = f"Pegel: {exc}"

    # Zustand speichern
    storage.save_seen(config.SEEN_FILE, seen)
    storage.save_state(config.STATE_FILE, state)
    logger.info("Zustand gespeichert.")
    db.close()

    # Laufstatus speichern
    run_status = {
        "last_run_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rss_new_count": rss_new_count,
        "last_error": last_error,
    }
    storage.save_run_status(config.RUN_STATUS_FILE, run_status)
    logger.info("Laufstatus gespeichert: %s", run_status)

    # Zustandsdateien auf GitHub committen damit GitHub Pages aktuelle Daten hat
    _git_commit_state()

    logger.info("══════════════════════════════════════")
    logger.info("  Fertig.")
    logger.info("══════════════════════════════════════")


def _git_commit_state() -> None:
    """Committed state.json / seen.json / clubs_seen.json auf GitHub.

    Nur aktiv wenn GITHUB_TOKEN gesetzt ist.
    Fehler werden geloggt aber nicht weitergeworfen.

    Strategie: fetch → merge → eigene Dateien stagen → commit → normaler push.
    Kein force-push, damit parallele Schreiber (z.B. NfB-Monitor via Contents API)
    nicht überschrieben werden.  Da Wächter und NfB-Monitor unterschiedliche Dateien
    schreiben, entstehen dabei keine Merge-Konflikte.
    """
    import os
    import subprocess

    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        return

    repo_url = f"https://x-access-token:{token}@github.com/5dbp6h96ch-droid/Reffenthal-waechter-.git"
    git_log = logging.getLogger("git")

    try:
        # Arbeitsverzeichnis ist das Repo-Root (eine Ebene über watcher.py)
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        def run(args: list[str]) -> subprocess.CompletedProcess:
            return subprocess.run(
                args, cwd=root, capture_output=True, text=True, timeout=30
            )

        run(["git", "config", "user.email", "waechter@replit.local"])
        run(["git", "config", "user.name", "Reffenthal-Wächter"])

        # Nur eigene Zustandsdateien stagen.
        files = [
            "reffenthal-waechter/state.json",
            "reffenthal-waechter/seen.json",
            "reffenthal-waechter/clubs_seen.json",
            "reffenthal-waechter/run_status.json",
            "reffenthal-waechter/nfb.json",   # vom NfB-Monitor geschrieben
        ]
        run(["git", "add", "--force"] + files)

        # Prüfen ob es Änderungen gibt
        diff = run(["git", "diff", "--cached", "--quiet"])
        if diff.returncode == 0:
            git_log.debug("Git: Keine Änderungen, kein Commit nötig.")
            return

        run(["git", "commit", "-m", "chore: Wächter-Zustand aktualisiert [skip ci]"])

        # Push mit Retry: bei Race Condition (remote ahead) rebasen und nochmals versuchen.
        for attempt in range(1, 4):
            result = run(["git", "push", repo_url, "main"])
            if result.returncode == 0:
                git_log.info("Git: Zustand erfolgreich gepusht (Versuch %d).", attempt)
                return
            git_log.warning(
                "Git: Push fehlgeschlagen (Versuch %d/3): %s", attempt, result.stderr[:200]
            )
            if attempt < 3:
                # Neuen Remote-Stand holen und lokalen Commit darüber rebasen.
                run(["git", "fetch", repo_url, "main"])
                run(["git", "rebase", "FETCH_HEAD"])

        git_log.error("Git: Push nach 3 Versuchen gescheitert.")
    except Exception as exc:  # noqa: BLE001
        git_log.warning("Git: Fehler beim State-Commit: %s", exc)


if __name__ == "__main__":
    main()
