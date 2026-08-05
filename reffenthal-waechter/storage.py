"""
Persistente Speicherung für den Reffenthal-Wächter.

Verwaltet seen.json (bereits gesendete RSS-Einträge) und
state.json (letzter Pegelstand + Verlauf).
"""

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def _load_json(filepath: str, default: Any) -> Any:
    """Lädt eine JSON-Datei. Gibt default zurück, wenn die Datei fehlt oder
    defekt ist."""
    if not os.path.exists(filepath):
        return default
    try:
        with open(filepath, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Fehler beim Lesen von %s: %s", filepath, exc)
        return default


def _save_json(filepath: str, data: Any) -> None:
    """Schreibt Daten als JSON in eine Datei."""
    try:
        with open(filepath, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
    except OSError as exc:
        logger.error("Fehler beim Schreiben von %s: %s", filepath, exc)


# ── Seen (RSS-Duplikat-Schutz) ────────────────────────────────────────────────

def load_seen(filepath: str) -> set[str]:
    """Lädt die Menge bereits gesendeter Eintrags-IDs."""
    data = _load_json(filepath, [])
    return set(data)


def save_seen(filepath: str, seen: set[str]) -> None:
    """Speichert die Menge gesendeter Eintrags-IDs."""
    _save_json(filepath, list(seen))


# ── State (Pegel-Verlauf) ─────────────────────────────────────────────────────

def load_state(filepath: str) -> dict:
    """Lädt den Pegel-Zustand."""
    return _load_json(filepath, {
        "last_pegel_cm": None,
        "last_pegel_time": None,
        "history": [],
        "last_daily_report_date": None,
    })


def save_state(filepath: str, state: dict) -> None:
    """Speichert den Pegel-Zustand."""
    _save_json(filepath, state)
