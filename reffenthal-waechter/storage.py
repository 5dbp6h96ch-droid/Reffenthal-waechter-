"""
Persistente Speicherung für den Reffenthal-Wächter.

Verwaltet seen.json (bereits gesendete RSS-Einträge) und
state.json (letzter Pegelstand + Verlauf).
"""

import json
import logging
import os
from typing import Any
from urllib.parse import urlparse, urlunparse, urlencode, parse_qsl

# Tracking-Parameter die beim Normalisieren entfernt werden
_STRIP_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "ref", "source", "mc_cid", "mc_eid",
}


def normalize_url(url: str) -> str:
    """Normalisiert eine URL für zuverlässigen Duplikat-Abgleich.

    - Schema und Host werden kleingeschrieben
    - Trailing-Slash wird entfernt
    - Tracking-Parameter (utm_*, fbclid, …) werden entfernt
    - Fragment (#…) wird entfernt
    """
    try:
        p = urlparse(url.strip())
        host = p.netloc.lower()
        path = p.path.rstrip("/") or "/"
        # Query-Parameter filtern
        params = [(k, v) for k, v in parse_qsl(p.query) if k.lower() not in _STRIP_PARAMS]
        query = urlencode(params)
        return urlunparse((p.scheme.lower(), host, path, "", query, ""))
    except Exception:
        return url.strip()

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
    """Lädt die Menge bereits gesendeter Eintrags-IDs.

    URLs werden beim Laden normalisiert, damit alte Einträge auch nach
    einer URL-Normalisierungsänderung noch als bekannt erkannt werden.
    """
    data = _load_json(filepath, [])
    return {normalize_url(entry) if entry.startswith("http") else entry for entry in data}


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
