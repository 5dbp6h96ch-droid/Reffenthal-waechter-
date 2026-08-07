"""
app.py – NfB-Monitor: Flask-Weboberfläche + APScheduler-Hintergrundjob.

Alle Routen laufen unter dem Prefix /nfb (Replit-Proxy-Pfad).
Der Hintergrundjob läuft alle 30 Minuten und fragt neue ELWIS-NfBs
für Rhein km 380–415 ab, gespeichert in einer SQLite-Datenbank.

Starten:
    python app.py
"""

import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, render_template

import scraper

# ── Logging konfigurieren ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s – %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Konfiguration ──────────────────────────────────────────────────────────────
DB_PATH           = os.path.join(os.path.dirname(__file__), "nfb.db")
PORT              = int(os.environ.get("PORT", 5150))
URL_PREFIX        = ""                   # Proxy-Prefix /nfb wird von Express bereits abgeschnitten
SCAN_INTERVAL_MIN = 30                   # Wie oft der Hintergrundjob läuft
NEW_HOURS         = 24                   # Meldungen jünger als N Stunden = „neu"

# Flask mit URL-Prefix konfigurieren
app = Flask(__name__)
app.config["APPLICATION_ROOT"] = "/"
app.config["PREFERRED_URL_SCHEME"] = "https"


# ── Datenbank ──────────────────────────────────────────────────────────────────
def init_db() -> None:
    """Erstellt die SQLite-Tabellen beim ersten Start."""
    with sqlite3.connect(DB_PATH) as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS nfb (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                nfb_id      TEXT    UNIQUE NOT NULL,   -- z.B. '2026/1911'
                titel       TEXT    NOT NULL,
                km_von      REAL,                       -- kleinster Rhein-km-Wert
                km_bis      REAL,                       -- größter Rhein-km-Wert
                gueltig_ab  TEXT,
                gueltig_bis TEXT,
                url         TEXT,
                first_seen  TEXT    NOT NULL,           -- ISO-8601 UTC
                last_seen   TEXT    NOT NULL,           -- ISO-8601 UTC
                expired     INTEGER NOT NULL DEFAULT 0  -- 0=aktiv, 1=abgelaufen
            )
        """)
        # Scan-Fortschritt (letzte bekannte ID pro Jahr)
        con.execute("""
            CREATE TABLE IF NOT EXISTS scan_state (
                key     TEXT PRIMARY KEY,
                value   TEXT NOT NULL
            )
        """)
        con.commit()
    logger.info("Datenbank initialisiert: %s", DB_PATH)


@contextmanager
def get_db():
    """Thread-sichere SQLite-Verbindung als Context-Manager."""
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
    finally:
        con.close()


# ── Scan-State ─────────────────────────────────────────────────────────────────
def _load_last_id(year: int) -> int:
    with get_db() as con:
        row = con.execute(
            "SELECT value FROM scan_state WHERE key = ?", (f"last_id_{year}",)
        ).fetchone()
    return int(row["value"]) if row else 0


def _save_last_id(year: int, last_id: int) -> None:
    with get_db() as con:
        con.execute(
            "INSERT INTO scan_state (key, value) VALUES (?, ?)"
            " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (f"last_id_{year}", str(last_id)),
        )
        con.commit()


# ── NfB speichern ─────────────────────────────────────────────────────────────
def _upsert_nfb(entry: dict) -> bool:
    """
    Legt eine neue NfB an oder aktualisiert last_seen bei bekannter ID.
    Gibt True zurück wenn es sich um einen neuen Eintrag handelt.
    """
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as con:
        existing = con.execute(
            "SELECT id FROM nfb WHERE nfb_id = ?", (entry["nfb_id"],)
        ).fetchone()

        if existing:
            con.execute(
                "UPDATE nfb SET last_seen = ?, expired = 0 WHERE nfb_id = ?",
                (now, entry["nfb_id"]),
            )
            con.commit()
            return False
        else:
            con.execute("""
                INSERT INTO nfb
                    (nfb_id, titel, km_von, km_bis, gueltig_ab,
                     gueltig_bis, url, first_seen, last_seen, expired)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """, (
                entry["nfb_id"],
                entry["titel"],
                entry.get("km_von"),
                entry.get("km_bis"),
                entry.get("gueltig_ab", ""),
                entry.get("gueltig_bis", ""),
                entry.get("url", ""),
                now,
                now,
            ))
            con.commit()
            return True


# ── Hintergrundjob ─────────────────────────────────────────────────────────────
def run_scan() -> None:
    """
    Scannt neue ELWIS-NfBs und speichert Treffer in der DB.
    Wird alle 30 Minuten vom APScheduler aufgerufen.
    Fehler werden geloggt; die Anwendung stürzt nicht ab.
    """
    year    = datetime.now().year
    last_id = _load_last_id(year)

    logger.info("Scan startet (letzter Index: %d/%04d) …", year, last_id)

    try:
        treffer, new_last_id = scraper.scan(last_id=last_id, year=year)
    except Exception as exc:
        logger.error("Unerwarteter Fehler im Scraper: %s", exc, exc_info=True)
        return

    neue = 0
    for entry in treffer:
        if _upsert_nfb(entry):
            neue += 1
            logger.info("Neu: %s – %s", entry["nfb_id"], entry["titel"])

    if new_last_id > last_id:
        _save_last_id(year, new_last_id)

    logger.info("Scan fertig: %d Treffer, %d davon neu.", len(treffer), neue)

    # nfb.json für GitHub Pages schreiben
    _export_nfb_json()


def _export_nfb_json() -> None:
    """
    Schreibt alle aktiven NfBs als nfb.json ins Wächter-Verzeichnis,
    damit die statische GitHub-Pages-App sie laden kann.
    """
    import json
    threshold_new = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    try:
        with get_db() as con:
            rows = con.execute("""
                SELECT nfb_id, titel, km_von, km_bis, gueltig_ab,
                       gueltig_bis, url, first_seen,
                       (first_seen > ?) AS is_new
                FROM nfb WHERE expired = 0
                ORDER BY first_seen DESC
            """, (threshold_new,)).fetchall()
        meldungen = [dict(r) for r in rows]
        payload = {"meldungen": meldungen, "count": len(meldungen)}

        # Ziel: reffenthal-waechter/nfb.json (von GitHub Raw gelesen)
        out_path = os.path.join(
            os.path.dirname(__file__),   # artifacts/nfb-monitor/
            "..", "..",                  # → workspace root
            "reffenthal-waechter",
            "nfb.json",
        )
        out_path = os.path.normpath(out_path)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        logger.info("nfb.json exportiert: %d Einträge → %s", len(meldungen), out_path)
    except Exception as exc:
        logger.warning("nfb.json Export fehlgeschlagen: %s", exc)


# ── Flask-Routen ───────────────────────────────────────────────────────────────
@app.route("/")
def index():
    """
    Tabelle aller aktiven NfBs für Rhein km 380–415.
    Abgelaufene Meldungen werden nicht angezeigt.
    Neue Meldungen (first_seen < NEW_HOURS) sind grün markiert.
    """
    threshold_new = (
        datetime.now(timezone.utc) - timedelta(hours=NEW_HOURS)
    ).isoformat()

    with get_db() as con:
        rows = con.execute("""
            SELECT
                nfb_id, titel, km_von, km_bis,
                gueltig_ab, gueltig_bis, url, first_seen,
                (first_seen > ?) AS is_new
            FROM nfb
            WHERE expired = 0
            ORDER BY first_seen DESC
        """, (threshold_new,)).fetchall()

    meldungen = [dict(r) for r in rows]
    last_scan = _get_last_scan_time()

    return render_template(
        "index.html",
        meldungen=meldungen,
        last_scan=last_scan,
        km_von=scraper.KM_VON,
        km_bis=scraper.KM_BIS,
        new_hours=NEW_HOURS,
        url_prefix=URL_PREFIX,
    )


@app.route("/scan-now", methods=["POST"])
def trigger_scan():
    """Manueller Scan-Auslöser (z.B. per Button in der Oberfläche)."""
    try:
        run_scan()
        return {"status": "ok", "message": "Scan abgeschlossen."}, 200
    except Exception as exc:
        logger.error("Fehler beim manuellen Scan: %s", exc, exc_info=True)
        return {"status": "error", "message": str(exc)}, 500


def _get_last_scan_time() -> str | None:
    """Zeitstempel des neuesten DB-Eintrags als Proxy für den letzten Scan."""
    with get_db() as con:
        row = con.execute("SELECT MAX(last_seen) AS ts FROM nfb").fetchone()
    return row["ts"] if row and row["ts"] else None


# ── Start ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    init_db()

    # APScheduler: erster Lauf sofort im Hintergrund, danach alle 30 Min.
    scheduler = BackgroundScheduler(daemon=True, timezone="UTC")
    scheduler.add_job(
        run_scan,
        trigger="interval",
        minutes=SCAN_INTERVAL_MIN,
        id="nfb_scan",
        name="ELWIS NfB Scan",
        max_instances=1,
        misfire_grace_time=120,
        next_run_time=datetime.now(timezone.utc),   # sofort starten
    )
    scheduler.start()
    logger.info(
        "Scheduler aktiv: initialer Scan im Hintergrund, dann alle %d Min.",
        SCAN_INTERVAL_MIN,
    )

    # Flask sofort verfügbar (Scan läuft parallel)
    app.run(host="0.0.0.0", port=PORT, debug=False, use_reloader=False)
