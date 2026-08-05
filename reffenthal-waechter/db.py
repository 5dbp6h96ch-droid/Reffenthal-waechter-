"""
Datenbankanbindung für den Reffenthal-Wächter.

Schreibt jeden Pegelstand-Messwert dauerhaft in die PostgreSQL-Tabelle
`pegel_history`, damit Wochen- und Monatstrends im Dashboard sichtbar werden.
"""

import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_conn = None


def _get_connection():
    """Gibt eine persistente Datenbankverbindung zurück (lazy init)."""
    global _conn
    if _conn is not None:
        try:
            # Prüfe ob Verbindung noch lebt
            _conn.cursor().execute("SELECT 1")
            return _conn
        except Exception:
            _conn = None

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.warning("DATABASE_URL nicht gesetzt – Pegelstand wird nicht in DB gespeichert.")
        return None

    try:
        import psycopg2
        _conn = psycopg2.connect(database_url)
        _conn.autocommit = True
        logger.info("DB: Verbindung hergestellt.")
        return _conn
    except Exception as exc:
        logger.error("DB: Verbindung fehlgeschlagen: %s", exc)
        return None


def save_pegel(value_cm: int, timestamp: str) -> bool:
    """Speichert einen Pegelstand-Messwert in der Datenbank.

    Args:
        value_cm: Pegelstand in cm.
        timestamp: ISO 8601-Zeitstempel des Messwerts (z.B. vom WSV-API).

    Returns:
        True bei Erfolg, False bei Fehler.
    """
    conn = _get_connection()
    if conn is None:
        return False

    try:
        # Zeitstempel normalisieren
        measured_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        if measured_at.tzinfo is None:
            measured_at = measured_at.replace(tzinfo=timezone.utc)

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pegel_history (value_cm, measured_at)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING
                """,
                (value_cm, measured_at),
            )
        logger.debug("DB: Pegelstand %d cm (%s) gespeichert.", value_cm, measured_at)
        return True
    except Exception as exc:
        logger.error("DB: Fehler beim Speichern des Pegelstands: %s", exc)
        # Verbindung zurücksetzen damit beim nächsten Aufruf neu verbunden wird
        global _conn
        _conn = None
        return False


def close() -> None:
    """Schließt die Datenbankverbindung."""
    global _conn
    if _conn is not None:
        try:
            _conn.close()
        except Exception:
            pass
        _conn = None
