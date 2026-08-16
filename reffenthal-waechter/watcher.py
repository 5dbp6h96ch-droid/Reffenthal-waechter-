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
import gauges
import mck
import nfb
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


def _push_ts(timestamp: str) -> str:
    """Zeitstempel für den sachlichen Push-Text formatieren."""
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y %H:%M")
    except (ValueError, AttributeError):
        return timestamp


def run_pegel(state: dict) -> dict:
    """Prüft alle von Benutzern gewählten Pegel und alarmiert bei Bedarf.

    Der zu überwachende Pegel ist NICHT mehr fest Speyer: Die Auswahl kommt
    dynamisch aus `user_gauge_settings` (Test + Production); ohne Auswahl
    gilt der Fallback Speyer. Für Speyer bleiben die bisherigen
    Top-Level-Zustandsfelder (history …) erhalten, damit App/Verlauf
    weiter funktionieren.

    Returns:
        Aktualisierter Zustand.
    """
    logger.info("─── Pegel-Check startet ───")

    try:
        watched = gauges.load_watched_gauges()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Pegelauswahl: Fehler (%s) – Fallback Speyer.", exc)
        watched = [{
            "uuid": gauges.SPEYER_UUID,
            "name": "Speyer",
            "threshold_cm": config.PEGEL_LOW_THRESHOLD_CM,
        }]

    gauge_states: dict = state.get("gauges", {})

    for gauge in watched:
        try:
            state, gauge_states = _check_gauge(gauge, state, gauge_states)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Pegel [%s]: Fehler (%s) – nächster Pegel.", gauge["name"], exc)

    state["gauges"] = gauge_states
    return state


def _check_gauge(gauge: dict, state: dict, gauge_states: dict) -> tuple[dict, dict]:
    """Einen einzelnen Pegel prüfen; Fehler isoliert der Aufrufer."""
    uuid = gauge["uuid"]
    name = gauge["name"]
    threshold_cm = gauge["threshold_cm"]
    thresholds = gauge.get("thresholds") or [threshold_cm]
    is_speyer = uuid == gauges.SPEYER_UUID

    current = pegel.fetch_pegel(uuid)
    if current is None:
        logger.warning("Pegel [%s]: Kein Messwert – überspringe.", name)
        return state, gauge_states

    value_cm = current["value_cm"]
    timestamp = current["timestamp"]
    logger.info("Pegel [%s]: %d cm (Schwelle %d cm)", name, value_cm, threshold_cm)

    # Zustand: Speyer nutzt die bisherigen Top-Level-Felder (Kompatibilität
    # mit App-Verlauf), andere Pegel liegen unter state["gauges"][uuid].
    gstate = state if is_speyer else gauge_states.get(uuid, {})
    previous_cm = gstate.get("last_pegel_cm")
    analysis = pegel.analyze_pegel(current, gstate, threshold_cm)
    if is_speyer:
        state = {**state, **analysis["updated_state"]}
    else:
        gauge_states[uuid] = analysis["updated_state"]

    # Alle Benutzer-Schwellen prüfen, nicht nur die höchste: Ein Alarm wird
    # ausgelöst, sobald IRGENDEINE eingestellte Schwelle neu unterschritten
    # wird (die Edge-Funktion filtert dann je Benutzer die eigene Schwelle).
    crossed = [
        t for t in thresholds
        if value_cm < t and (previous_cm is None or previous_cm >= t)
    ]

    # Dauerhaft in Datenbank speichern (Wochen-/Monatstrends, nur Speyer –
    # pegel_history ist eine Ein-Pegel-Tabelle)
    if is_speyer:
        db.save_pegel(value_cm, timestamp)

    # Niedrigwasser-Warnung hat Vorrang
    if crossed:
        thr_used = max(crossed)
        msg = pegel.format_low_alert_message(value_cm, timestamp, name, thr_used)
        push_meta = {
            "event_type": "threshold_crossed",
            "title": "Pegelwarnung",
            "body": (
                f"Pegel: {name}\nAktuell: {value_cm} cm\n"
                f"Unter Schwelle: {thr_used} cm\nStand: {_push_ts(timestamp)}"
            ),
            "url": "/",
            "gauge_id": uuid,
            "gauge_name": name,
            "current_cm": value_cm,
            "previous_cm": previous_cm,
            "threshold_cm": thr_used,
            "timestamp": timestamp,
        }
        success = telegram.send_message(msg, push_meta=push_meta)
        if success:
            logger.info("Pegel [%s]: Niedrigwasser-Alarm gesendet.", name)
        else:
            logger.warning("Pegel [%s]: Niedrigwasser-Alarm konnte nicht gesendet werden.", name)

    # Nur bei signifikanter Änderung und kein Alarm (Doppelnachricht vermeiden)
    elif analysis["changed"]:
        msg = pegel.format_change_message(value_cm, analysis["delta_cm"], timestamp, name)
        delta = analysis["delta_cm"]
        push_meta = {
            "event_type": "gauge_change",
            "title": "Pegeländerung",
            "body": (
                f"Pegel: {name}\nAktuell: {value_cm} cm\n"
                f"Veränderung: {delta:+d} cm\nStand: {_push_ts(timestamp)}"
            ),
            "url": "/",
            "gauge_id": uuid,
            "gauge_name": name,
            "current_cm": value_cm,
            "previous_cm": previous_cm,
            "timestamp": timestamp,
        }
        success = telegram.send_message(msg, push_meta=push_meta)
        if success:
            logger.info("Pegel [%s]: Änderungsmeldung gesendet.", name)
        else:
            logger.warning("Pegel [%s]: Änderungsmeldung konnte nicht gesendet werden.", name)

    else:
        logger.info("Pegel [%s]: Keine signifikante Änderung (< %d cm).",
                    name, config.PEGEL_CHANGE_THRESHOLD_CM)

    # Tagesbericht (nur Speyer, wie bisher)
    if is_speyer:
        now = datetime.now()
        today_str = now.strftime("%Y-%m-%d")
        last_report = state.get("last_daily_report_date")
        if now.hour >= config.DAILY_REPORT_HOUR and last_report != today_str:
            msg = pegel.format_daily_report_message(
                value_cm, timestamp, state.get("history", [])
            )
            success = telegram.send_message(msg)
            if success:
                state["last_daily_report_date"] = today_str
                logger.info("Pegel: Tagesbericht gesendet.")
            else:
                logger.warning("Pegel: Tagesbericht konnte nicht gesendet werden.")

    return state, gauge_states


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

    # Verlauf aus Pegelonline nachladen wenn er dünn ist (< 1 Tag ≈ 96 Werte)
    if len(state.get("history", [])) < 96:
        logger.info("Pegel: Verlauf leer – lade 30 Tage historische Daten von Pegelonline.")
        hist = pegel.fetch_history(30)
        if hist:
            existing_ts = {h["ts"] for h in state.get("history", [])}
            merged = [h for h in hist if h["ts"] not in existing_ts]
            merged += state.get("history", [])
            merged.sort(key=lambda h: h["ts"])
            state = {**state, "history": merged[-pegel.MAX_HISTORY:]}
            storage.save_state(config.STATE_FILE, state)
            logger.info(
                "Pegel: %d Einträge im Verlauf nach Seeding.", len(state["history"])
            )

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

    # MCK Tankstellenpreise aktualisieren
    try:
        import json as _json
        import os as _os
        mck_data = mck.fetch_prices()
        mck_path = _os.path.join(_os.path.dirname(__file__), "mck.json")
        with open(mck_path, "w", encoding="utf-8") as _f:
            _json.dump(mck_data, _f, ensure_ascii=False, indent=2)
        logger.info("MCK: Preise gespeichert (%s).", mck_path)
    except Exception as exc:  # noqa: BLE001
        logger.error("MCK: Fehler beim Preis-Abruf: %s", exc)
        if last_error is None:
            last_error = f"MCK: {exc}"

    # ELWIS NfB-Scan (zuvor im separaten NfB-Monitor)
    try:
        nfb_new = nfb.run(
            telegram_token=config.TELEGRAM_BOT_TOKEN,
            telegram_chat_id=config.TELEGRAM_CHAT_ID,
        )
        logger.info("NfB: %d neue Meldung(en) gesendet.", nfb_new)
    except Exception as exc:  # noqa: BLE001
        logger.error("NfB: Unerwarteter Fehler: %s", exc)
        if last_error is None:
            last_error = f"NfB: {exc}"

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
            "reffenthal-waechter/nfb.json",
            "reffenthal-waechter/nfb-state.json",
            "reffenthal-waechter/mck.json",   # MCK Tankstellenpreise
        ]
        run(["git", "add", "--force"] + files)

        # Prüfen ob es Änderungen gibt
        diff = run(["git", "diff", "--cached", "--quiet"])
        if diff.returncode == 0:
            git_log.debug("Git: Keine Änderungen, kein Commit nötig.")
            return

        run(["git", "commit", "-m", "chore: Wächter-Zustand aktualisiert [skip ci]"])

        # Push mit Retry: bei Race Condition (remote ahead) Remote-Stand holen,
        # hart resetten und Datei-Änderungen neu committen – kein Rebase, der bei
        # Datei-Konflikten still fehlschlägt und git in einen kaputten Zustand bringt.
        for attempt in range(1, 4):
            result = run(["git", "push", repo_url, "main"])
            if result.returncode == 0:
                git_log.info("Git: Zustand erfolgreich gepusht (Versuch %d).", attempt)
                return
            git_log.warning(
                "Git: Push fehlgeschlagen (Versuch %d/3): %s", attempt, result.stderr[:200]
            )
            if attempt < 3:
                # Etwaigen steckenden Rebase abbrechen, Remote holen, hart resetten,
                # dann die Datei-Änderungen erneut stagen und committen.
                run(["git", "rebase", "--abort"])
                run(["git", "fetch", repo_url, "main"])
                run(["git", "reset", "--hard", "FETCH_HEAD"])
                run(["git", "add", "--force"] + files)
                needs_commit = run(["git", "diff", "--cached", "--quiet"])
                if needs_commit.returncode != 0:
                    run(["git", "commit", "-m", "chore: Wächter-Zustand aktualisiert [skip ci]"])

        git_log.error("Git: Push nach 3 Versuchen gescheitert.")
    except Exception as exc:  # noqa: BLE001
        git_log.warning("Git: Fehler beim State-Commit: %s", exc)


if __name__ == "__main__":
    import os
    import time

    # GitHub Actions setzt GITHUB_ACTIONS="true" automatisch.
    # Dort läuft watcher.py als Einmal-Skript (cron alle 30 Min).
    # Lokal (Replit-Workflow) läuft er als Endlosschleife.
    if os.environ.get("GITHUB_ACTIONS") == "true":
        main()
    else:
        LOOP_INTERVAL_MINUTES = 30
        while True:
            main()
            logger.info(
                "Nächster Lauf in %d Minuten …", LOOP_INTERVAL_MINUTES
            )
            time.sleep(LOOP_INTERVAL_MINUTES * 60)
