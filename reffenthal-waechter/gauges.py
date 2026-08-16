"""Dynamische Pegel-Auswahl für den Reffenthal-Wächter.

Liest die von Benutzern in der App gewählten Pegel (Tabelle
`user_gauge_settings`, alert_enabled = true) aus BEIDEN Supabase-Projekten
(Production + Test) und liefert die zu überwachenden Pegel samt Schwelle.

Fällt die Abfrage aus oder hat kein Benutzer etwas gewählt, wird als
Fallback der bisherige Standard (Pegel Speyer, Schwelle aus config)
verwendet – der Wächter bleibt damit immer funktionsfähig.
"""

import logging

import requests

import config
import webpush

logger = logging.getLogger(__name__)

# PEGELONLINE-UUID des Pegels Speyer (Standard/Fallback)
SPEYER_UUID = "2cb8ae5b-c5c9-4fa8-bac0-bb724f2754f4"

_PEGELONLINE_STATION = (
    "https://pegelonline.wsv.de/webservices/rest-api/v2/stations/{uuid}.json"
)

_station_cache: dict[str, tuple[str, str] | None] = {}


def resolve_station(station_id: str) -> tuple[str, str] | None:
    """Pegel-ID (UUID oder Kurzname) zu (kanonische UUID, Anzeigename) auflösen.

    In `user_gauge_settings` stehen gemischt UUIDs und Kurznamen – über
    PEGELONLINE wird beides auf dieselbe kanonische UUID normalisiert,
    damit kein Pegel doppelt überwacht wird.
    """
    if station_id in _station_cache:
        return _station_cache[station_id]
    result: tuple[str, str] | None = None
    try:
        resp = requests.get(
            _PEGELONLINE_STATION.format(uuid=station_id),
            headers={"User-Agent": config.USER_AGENT},
            timeout=config.HTTP_TIMEOUT,
        )
        if resp.ok:
            data = resp.json()
            uuid = data.get("uuid")
            raw = data.get("longname") or data.get("shortname") or ""
            if uuid:
                result = (uuid, raw.title() if raw else "Unbekannt")
        else:
            logger.warning(
                "Pegelauswahl: Unbekannter Pegel '%s' (HTTP %d) – wird übersprungen.",
                station_id, resp.status_code,
            )
    except requests.exceptions.RequestException as exc:
        logger.warning("Pegelauswahl: Pegel %s nicht auflösbar: %s", station_id, exc)
    _station_cache[station_id] = result
    return result


def _fetch_settings(base_url: str, secret_key: str) -> list[dict]:
    """user_gauge_settings eines Supabase-Projekts lesen (nur aktive Alarme)."""
    resp = requests.get(
        f"{base_url}/rest/v1/user_gauge_settings",
        params={
            "select": "gauge_id,alert_threshold_cm",
            "alert_enabled": "eq.true",
        },
        headers={"apikey": secret_key, "Authorization": f"Bearer {secret_key}"},
        timeout=config.HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def load_watched_gauges() -> list[dict]:
    """Zu überwachende Pegel bestimmen.

    Returns:
        Liste von {"uuid", "name", "threshold_cm"}; pro Pegel gilt die
        höchste von Benutzern gesetzte Schwelle (früheste Warnung – die
        Push-Funktion filtert anschließend je Benutzer individuell).
    """
    resolved: dict[str, dict] = {}

    for name, push_url, secret_key in webpush._targets():
        base_url = push_url.split("/functions/")[0]
        try:
            rows = _fetch_settings(base_url, secret_key)
        except (requests.exceptions.RequestException, ValueError) as exc:
            logger.warning("Pegelauswahl [%s]: Abfrage fehlgeschlagen: %s", name, exc)
            continue
        for row in rows:
            raw_id = (row.get("gauge_id") or "").strip()
            if not raw_id:
                continue
            station = resolve_station(raw_id)
            if station is None:
                continue
            uuid, display = station
            thr = int(row.get("alert_threshold_cm") or config.PEGEL_LOW_THRESHOLD_CM)
            entry = resolved.setdefault(
                uuid,
                {"uuid": uuid, "name": display, "threshold_cm": thr, "thresholds": set()},
            )
            entry["threshold_cm"] = max(entry["threshold_cm"], thr)
            entry["thresholds"].add(thr)

    if not resolved:
        logger.info(
            "Pegelauswahl: Keine Benutzerauswahl gefunden – Fallback Pegel Speyer (%d cm).",
            config.PEGEL_LOW_THRESHOLD_CM,
        )
        resolved = {SPEYER_UUID: {
            "uuid": SPEYER_UUID, "name": "Speyer",
            "threshold_cm": config.PEGEL_LOW_THRESHOLD_CM,
            "thresholds": {config.PEGEL_LOW_THRESHOLD_CM},
        }}

    gauges = list(resolved.values())
    for g in gauges:
        g["thresholds"] = sorted(g["thresholds"])
    logger.info(
        "Pegelauswahl: %d Pegel überwacht: %s",
        len(gauges),
        ", ".join(f"{g['name']} (<{g['threshold_cm']} cm)" for g in gauges),
    )
    return gauges
