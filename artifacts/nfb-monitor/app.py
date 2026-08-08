"""
app.py – NfB-Monitor: Flask-Weboberfläche + APScheduler-Hintergrundjob.

Alle Routen laufen unter dem Prefix /nfb (Replit-Proxy-Pfad).
Der Hintergrundjob läuft alle 30 Minuten und fragt neue ELWIS-NfBs
für den gesamten Rhein ab (Filterung erfolgt App-seitig), gespeichert in einer SQLite-Datenbank.
Neue Treffer werden direkt per Telegram gemeldet.

Starten:
    python app.py
"""

import logging
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta

import requests
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
CURSOR_FILE       = os.path.join(os.path.dirname(__file__), "cursor.json")
PORT              = int(os.environ.get("PORT", 5150))
URL_PREFIX        = ""                   # Proxy-Prefix /nfb wird von Express bereits abgeschnitten
SCAN_INTERVAL_MIN = 30                   # Wie oft der Hintergrundjob läuft
NEW_HOURS         = 24                   # Meldungen jünger als N Stunden = „neu"

# ── Telegram-Konfiguration ─────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN: str = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID:   str = "916729935"    # Empfänger-Chat

# Flask mit URL-Prefix konfigurieren
app = Flask(__name__)
app.config["APPLICATION_ROOT"] = "/"
app.config["PREFERRED_URL_SCHEME"] = "https"


# ── Datenbank ──────────────────────────────────────────────────────────────────
def init_db() -> None:
    """Erstellt die SQLite-Tabellen beim ersten Start; migriert bestehende Schemas."""
    with sqlite3.connect(DB_PATH) as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS nfb (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                nfb_id          TEXT    UNIQUE NOT NULL,   -- z.B. '2026/1911'
                titel           TEXT    NOT NULL,
                km_von          REAL,                       -- kleinster Rhein-km-Wert
                km_bis          REAL,                       -- größter Rhein-km-Wert
                gueltig_ab      TEXT,
                gueltig_bis     TEXT,
                url             TEXT,
                first_seen      TEXT    NOT NULL,           -- ISO-8601 UTC
                last_seen       TEXT    NOT NULL,           -- ISO-8601 UTC
                expired         INTEGER NOT NULL DEFAULT 0, -- 0=aktiv, 1=abgelaufen
                telegram_sent   INTEGER NOT NULL DEFAULT 0  -- 1=Telegram-Alert versendet
            )
        """)
        # Migration: telegram_sent-Spalte für bestehende Tabellen nachrüsten.
        # Bereits vorhandene Zeilen werden als gesendet markiert (=1), damit
        # historische NfBs keine Telegram-Flut auslösen.
        existing_cols = {
            row[1]
            for row in con.execute("PRAGMA table_info(nfb)").fetchall()
        }
        if "telegram_sent" not in existing_cols:
            con.execute(
                "ALTER TABLE nfb ADD COLUMN telegram_sent INTEGER NOT NULL DEFAULT 1"
            )
            logger.info(
                "Datenbank-Migration: Spalte 'telegram_sent' ergänzt "
                "(vorhandene Zeilen als bereits gesendet markiert)."
            )
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
#
# cursor.json (CURSOR_FILE) speichert last_id pro Jahr außerhalb der SQLite-DB.
# Dadurch überlebt der Scan-Cursor auch einen kompletten DB-Reset:
# _load_last_id liest zuerst aus scan_state; findet es dort nichts (frische DB),
# fällt es auf cursor.json zurück. So nimmt der Scraper den Scan genau dort auf,
# wo er vor dem Reset aufgehört hat – kein Rückblick, keine doppelten Alerts.

def _read_cursor_file() -> dict:
    """Liest cursor.json; gibt leeres Dict zurück wenn nicht vorhanden oder fehlerhaft."""
    import json as _json
    try:
        with open(CURSOR_FILE, "r", encoding="utf-8") as f:
            return _json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def _write_cursor_file(data: dict) -> None:
    """Schreibt cursor.json atomar (temporäre Datei + rename)."""
    import json as _json
    tmp = CURSOR_FILE + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            _json.dump(data, f)
        os.replace(tmp, CURSOR_FILE)
    except Exception as exc:
        logger.warning("cursor.json: Schreiben fehlgeschlagen: %s", exc)


def _load_last_id(year: int) -> int:
    """Liest den Scan-Cursor aus scan_state; fällt auf cursor.json zurück (nach DB-Reset).

    Gibt immer eine nicht-negative ganze Zahl zurück (0 wenn kein Cursor bekannt).
    """
    with get_db() as con:
        row = con.execute(
            "SELECT value FROM scan_state WHERE key = ?", (f"last_id_{year}",)
        ).fetchone()
    if row:
        try:
            return max(0, int(row["value"]))
        except (ValueError, TypeError):
            pass

    # Fallback: cursor.json (überlebt DB-Resets)
    cursor_data = _read_cursor_file()
    raw = cursor_data.get(str(year), 0)
    try:
        fallback = max(0, int(raw))
    except (ValueError, TypeError):
        logger.warning("cursor.json: Ungültiger Wert für Jahr %d: %r – ignoriert.", year, raw)
        fallback = 0

    if fallback:
        logger.info(
            "Scan-Cursor aus cursor.json wiederhergestellt: %d/%04d "
            "(DB war zurückgesetzt).", year, fallback
        )
        # Cursor sofort in scan_state schreiben damit Folgescans konsistent sind
        _save_last_id(year, fallback)
    return fallback


def _save_last_id(year: int, last_id: int) -> None:
    """Schreibt den Scan-Cursor in scan_state UND cursor.json."""
    with get_db() as con:
        con.execute(
            "INSERT INTO scan_state (key, value) VALUES (?, ?)"
            " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (f"last_id_{year}", str(last_id)),
        )
        con.commit()

    # cursor.json als externer Fallback nach DB-Reset aktuell halten
    cursor_data = _read_cursor_file()
    cursor_data[str(year)] = last_id
    _write_cursor_file(cursor_data)


def _backfill_if_range_changed(year: int) -> None:
    """Rollt den Scan-Zeiger zurück wenn KM_BIS seit dem letzten Start gewachsen ist.

    Beim ersten Start nach einer KM_BIS-Erweiterung wurden bereits geprüfte IDs
    mit dem alten, engeren Filter verworfen.  Damit keine aktiven NfBs im neuen
    Bereich dauerhaft fehlen, wird last_id um INITIAL_LOOKBACK zurückgesetzt,
    sodass der nächste Scan-Lauf die IDs mit dem neuen Filter erneut prüft.

    km_bis_config wird auch in cursor.json gespeichert, damit nach einem DB-Reset
    kein falscher Rückroll ausgelöst wird (leere scan_state-Tabelle ≠ KM_BIS-Änderung).
    """
    km_bis_key = "km_bis_config"
    stored_km_bis_str: str | None = None

    # 1. Zuerst aus scan_state lesen
    with get_db() as con:
        row = con.execute(
            "SELECT value FROM scan_state WHERE key = ?", (km_bis_key,)
        ).fetchone()
        if row:
            stored_km_bis_str = row["value"]

    # 2. Falls scan_state leer ist (frische DB nach Reset): cursor.json als Fallback
    if stored_km_bis_str is None:
        cursor_data = _read_cursor_file()
        stored_km_bis_str = cursor_data.get(km_bis_key)
        if stored_km_bis_str:
            logger.info(
                "km_bis_config aus cursor.json wiederhergestellt: %s "
                "(DB war zurückgesetzt).", stored_km_bis_str
            )
            # Sofort in scan_state schreiben damit der nächste Start konsistent ist
            with get_db() as con:
                con.execute(
                    "INSERT INTO scan_state (key, value) VALUES (?, ?)"
                    " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (km_bis_key, stored_km_bis_str),
                )
                con.commit()

    current_km_bis = str(scraper.KM_BIS)

    if stored_km_bis_str == current_km_bis:
        return  # Keine Änderung – nichts zu tun

    # KM_BIS hat sich verändert (oder war noch nie gespeichert).
    # Scan-Zeiger zurückrollen damit die neuen km auch rückwirkend geprüft werden.
    old_last_id = _load_last_id(year)
    new_last_id = max(0, old_last_id - scraper.INITIAL_LOOKBACK)

    with get_db() as con:
        con.execute(
            "INSERT INTO scan_state (key, value) VALUES (?, ?)"
            " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (f"last_id_{year}", str(new_last_id)),
        )
        con.execute(
            "INSERT INTO scan_state (key, value) VALUES (?, ?)"
            " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (km_bis_key, current_km_bis),
        )
        con.commit()

    # Rückroll und neuen km_bis_config auch in cursor.json spiegeln,
    # damit der externe Fallback den beabsichtigten Zustand korrekt abbildet.
    cursor_data = _read_cursor_file()
    cursor_data[str(year)] = new_last_id
    cursor_data[km_bis_key] = current_km_bis
    _write_cursor_file(cursor_data)

    logger.info(
        "KM_BIS geändert (%s → %s): Scan-Zeiger zurückgesetzt von %d auf %d "
        "(Backfill der letzten %d IDs beim nächsten Lauf).",
        stored_km_bis_str or "–",
        current_km_bis,
        old_last_id,
        new_last_id,
        scraper.INITIAL_LOOKBACK,
    )


# ── Telegram-Versand ───────────────────────────────────────────────────────────
def _escape_md(text: str) -> str:
    """Escaped Sonderzeichen für Telegram MarkdownV1."""
    for ch in ("_", "*", "`", "["):
        text = text.replace(ch, f"\\{ch}")
    return text


def _format_telegram_message(entry: dict) -> str:
    """Formatiert einen NfB-Eintrag als Telegram-Nachricht."""
    nfb_id  = entry.get("nfb_id", "")
    titel   = _escape_md(entry.get("titel", "Kein Titel"))
    km_von  = entry.get("km_von")
    km_bis  = entry.get("km_bis")
    ab      = _escape_md(re.sub(r"\s+", " ", entry.get("gueltig_ab", "") or "").strip())
    bis_str = _escape_md(re.sub(r"\s+", " ", entry.get("gueltig_bis", "") or "").strip())
    url     = entry.get("url", "")

    if km_von is not None and km_bis is not None:
        km_str = (
            f"km {km_von:.1f}–{km_bis:.1f}" if km_von != km_bis else f"km {km_von:.1f}"
        )
    else:
        km_str = "km unbekannt"

    lines = [
        f"⚓ *NfB {nfb_id} – Rhein {km_str}*",
        "",
        f"*{titel}*",
    ]
    if ab:
        lines += ["", f"📅 von {ab}"]
        if bis_str:
            lines.append(f"📅 bis {bis_str}")
    if url:
        lines += ["", f"🔗 [Detailseite]({url})"]

    return "\n".join(lines)


def _send_telegram(text: str) -> bool:
    """Sendet eine Nachricht über die Telegram Bot API.

    Gibt True zurück bei Erfolg, False bei Fehler oder fehlendem Token.
    Fehler werden geloggt; die Anwendung läuft weiter.
    """
    if not TELEGRAM_BOT_TOKEN:
        logger.warning(
            "Telegram: TELEGRAM_BOT_TOKEN nicht gesetzt – Benachrichtigung übersprungen."
        )
        return False
    if not TELEGRAM_CHAT_ID:
        logger.warning(
            "Telegram: TELEGRAM_CHAT_ID nicht konfiguriert – Benachrichtigung übersprungen."
        )
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        resp = requests.post(
            url,
            json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
                "parse_mode": "Markdown",
                "disable_web_page_preview": False,
            },
            timeout=15,
        )
        resp.raise_for_status()
        logger.info("Telegram: Nachricht gesendet (%d Zeichen).", len(text))
        return True
    except requests.exceptions.HTTPError as exc:
        logger.error(
            "Telegram: HTTP-Fehler %s – %s",
            exc.response.status_code,
            exc.response.text[:200],
        )
    except requests.exceptions.RequestException as exc:
        logger.error("Telegram: Verbindungsfehler: %s", exc)
    return False


def _mark_telegram_sent(nfb_id: str) -> None:
    """Setzt telegram_sent=1 für eine NfB-ID in der Datenbank."""
    with get_db() as con:
        con.execute(
            "UPDATE nfb SET telegram_sent = 1 WHERE nfb_id = ?", (nfb_id,)
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



# ── Telegram-Retry ─────────────────────────────────────────────────────────────
def _retry_pending_telegram_alerts() -> None:
    """Sendet ausstehende Telegram-Alerts für Einträge mit telegram_sent=0.

    Wird am Anfang jedes Scan-Laufs aufgerufen, damit vorübergehend
    fehlgeschlagene Benachrichtigungen beim nächsten Lauf erneut versucht werden.
    """
    try:
        with get_db() as con:
            rows = con.execute(
                "SELECT nfb_id, titel, km_von, km_bis, gueltig_ab, gueltig_bis, url "
                "FROM nfb WHERE telegram_sent = 0 AND expired = 0"
            ).fetchall()
    except Exception as exc:
        logger.error("Telegram-Retry: DB-Fehler: %s", exc)
        return

    if not rows:
        return

    logger.info("Telegram-Retry: %d ausstehende Alerts.", len(rows))
    for row in rows:
        entry = dict(row)
        msg = _format_telegram_message(entry)
        if _send_telegram(msg):
            _mark_telegram_sent(entry["nfb_id"])
            logger.info("Telegram-Retry: %s erfolgreich gesendet.", entry["nfb_id"])
        else:
            logger.warning("Telegram-Retry: %s noch nicht gesendet (nächster Versuch beim nächsten Lauf).", entry["nfb_id"])


# ── nfb.json Export ────────────────────────────────────────────────────────────
def _export_nfb_json() -> None:
    """Exportiert aktive NfBs als JSON-Datei ins Wächter-Verzeichnis.

    Die Datei reffenthal-waechter/nfb.json wird nach jedem Scan geschrieben.
    Die mobile App liest diese Datei über GitHub Raw.
    Der NfB-Monitor veröffentlicht sie anschließend per _publish_nfb_json_via_api() zu GitHub.
    """
    import json
    threshold_new = (datetime.now(timezone.utc) - timedelta(hours=NEW_HOURS)).isoformat()
    try:
        with get_db() as con:
            rows = con.execute("""
                SELECT nfb_id, titel, km_von, km_bis, gueltig_ab,
                       gueltig_bis, url, first_seen,
                       (first_seen > ?) AS is_new
                FROM   nfb
                WHERE  expired = 0
                ORDER  BY first_seen DESC
            """, (threshold_new,)).fetchall()

        meldungen = [dict(r) for r in rows]
        payload = {
            "meldungen": meldungen,
            "count": len(meldungen),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        # Zielort: reffenthal-waechter/nfb.json (vom Workspace-Root aus)
        out_path = os.path.normpath(
            os.path.join(
                os.path.dirname(__file__),  # artifacts/nfb-monitor/
                "..", "..",                  # → workspace root
                "reffenthal-waechter",
                "nfb.json",
            )
        )
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        logger.info("nfb.json exportiert: %d Einträge → %s", len(meldungen), out_path)
    except Exception as exc:
        logger.warning("nfb.json Export fehlgeschlagen: %s", exc)


def _publish_nfb_json_via_api() -> None:
    """Veröffentlicht nfb.json über die GitHub Contents API (atomarer SHA-Check).

    Nutzt GITHUB_TOKEN (Replit Secret).
    Im Gegensatz zu git-push gibt es keine Race Conditions mit dem Wächter,
    da die API das aktuelle SHA der Datei im Request verlangt und bei
    Konflikten 409 zurückgibt – dann wird der aktuelle SHA neu gelesen und
    ein weiterer Versuch unternommen.
    Fehler werden geloggt, kein Absturz.
    """
    import base64

    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        logger.debug("GitHub-API: GITHUB_TOKEN nicht gesetzt – kein nfb.json Upload.")
        return

    out_path = os.path.normpath(
        os.path.join(
            os.path.dirname(__file__), "..", "..",
            "reffenthal-waechter", "nfb.json",
        )
    )
    if not os.path.isfile(out_path):
        logger.warning("GitHub-API: nfb.json nicht gefunden – Export fehlgeschlagen?")
        return

    api_log = logging.getLogger("github.api")
    owner   = "5dbp6h96ch-droid"
    repo    = "Reffenthal-waechter-"
    path    = "reffenthal-waechter/nfb.json"
    api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    with open(out_path, "rb") as f:
        raw_bytes = f.read()
    content_b64 = base64.b64encode(raw_bytes).decode()

    MAX_RETRIES = 3
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            # Aktuellen SHA der Datei abrufen (erforderlich für Updates)
            get_resp = requests.get(api_url, headers=headers, timeout=15)
            current_sha: str | None = None
            if get_resp.status_code == 200:
                current_sha = get_resp.json().get("sha")
            elif get_resp.status_code != 404:
                api_log.warning(
                    "GitHub-API: GET nfb.json → HTTP %d", get_resp.status_code
                )
                return

            payload: dict = {
                "message": "data: nfb.json aktualisiert [skip ci]",
                "content": content_b64,
                "branch": "main",
            }
            if current_sha:
                payload["sha"] = current_sha

            put_resp = requests.put(
                api_url, json=payload, headers=headers, timeout=20
            )
            if put_resp.status_code in (200, 201):
                api_log.info("GitHub-API: nfb.json erfolgreich veröffentlicht.")
                return
            elif put_resp.status_code == 409 and attempt < MAX_RETRIES:
                api_log.warning(
                    "GitHub-API: Konflikt beim PUT (Versuch %d/%d) – erneuter Versuch.",
                    attempt, MAX_RETRIES,
                )
                # Kurz warten damit das Remote-SHA stabil ist
                import time
                time.sleep(2)
                continue
            else:
                api_log.warning(
                    "GitHub-API: PUT nfb.json → HTTP %d: %s",
                    put_resp.status_code,
                    put_resp.text[:200],
                )
                return
        except requests.exceptions.RequestException as exc:
            api_log.warning("GitHub-API: Netzwerkfehler (Versuch %d): %s", attempt, exc)
            if attempt < MAX_RETRIES:
                import time
                time.sleep(2)

    api_log.warning("GitHub-API: nfb.json nach %d Versuchen nicht veröffentlicht.", MAX_RETRIES)


# ── Hintergrundjob ─────────────────────────────────────────────────────────────
def run_scan() -> None:
    """
    Scannt neue ELWIS-NfBs, speichert Treffer in der DB, sendet Telegram-Alerts
    und exportiert nfb.json für die Mobile-App.
    Wird alle 30 Minuten vom APScheduler aufgerufen.
    Fehler werden geloggt; die Anwendung stürzt nicht ab.

    DB-Reset-Schutz:
        Der Scan-Cursor (last_id) wird in cursor.json außerhalb der SQLite-DB
        persistiert. Nach einem DB-Reset liest _load_last_id() den Cursor aus
        cursor.json zurück, sodass der Scraper genau dort weitermacht wo er
        vor dem Reset aufgehört hat. Kein Rückblick, keine doppelten Alerts.
    """
    year    = datetime.now().year
    last_id = _load_last_id(year)

    logger.info("Scan startet (letzter Index: %d/%04d) …", year, last_id)

    # Ausstehende Telegram-Alerts aus vorherigen Läufen nachliefern
    _retry_pending_telegram_alerts()

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
            # Telegram-Alert für neue NfBs (Retry beim nächsten Lauf falls fehlgeschlagen)
            msg = _format_telegram_message(entry)
            if _send_telegram(msg):
                _mark_telegram_sent(entry["nfb_id"])

    if new_last_id > last_id:
        _save_last_id(year, new_last_id)

    logger.info("Scan fertig: %d Treffer, %d davon neu.", len(treffer), neue)

    # nfb.json für Mobile-App exportieren und atomar via GitHub Contents API veröffentlichen
    _export_nfb_json()
    _publish_nfb_json_via_api()


# ── Flask-Routen ───────────────────────────────────────────────────────────────
@app.route("/")
def index():
    """
    Tabelle aller aktiven NfBs für Rhein km 380–435.
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

    # Backfill: Scan-Zeiger zurückrollen wenn KM_BIS seit dem letzten Start gewachsen ist.
    _backfill_if_range_changed(datetime.now().year)

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
