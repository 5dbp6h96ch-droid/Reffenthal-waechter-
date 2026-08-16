"""Dynamische Pegel-Auswahl für den Reffenthal-Wächter.

Liest die von Benutzern aktuell ausgewählten Pegel und deren Alarmgrenzen
aus dem ausdrücklich gewählten Supabase-Projekt. Nicht ausgewählte Pegel
werden nicht überwacht. Damit können Test- und Production-Einstellungen
sowie alte/unselektierte Benutzereinstellungen nicht in einen Lauf
hineinbluten.
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
    """Pegel-ID (UUID oder Kurzname) zu (kanonische UUID, Anzeigename) auflösen."""
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
    """Aktive user_gauge_settings eines Supabase-Projekts lesen."""
    resp = requests.get(
        f"{base_url}/rest/v1/user_gauge_settings",
        params={
            "select": "user_id,gauge_id,alert_threshold_cm",
            "alert_enabled": "eq.true",
        },
        headers={"apikey": secret_key, "Authorization": f"Bearer {secret_key}"},
        timeout=config.HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def _fetch_selected(base_url: str, secret_key: str) -> dict[str, str]:
    """Aktuell ausgewählten Pegel je Benutzer lesen."""
    resp = requests.get(
        f"{base_url}/rest/v1/user_settings",
        params={"select": "user_id,selected_gauge_id"},
        headers={"apikey": secret_key, "Authorization": f"Bearer {secret_key}"},
        timeout=config.HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    return {
        str(row["user_id"]): str(row["selected_gauge_id"])
        for row in resp.json()
        if row.get("user_id") and row.get("selected_gauge_id")
    }


def load_watched_gauges() -> list[dict]:
    """Zu überwachende Pegel aus dem gewählten Supabase-Projekt bestimmen.

    Es werden ausschließlich aktive Alarm-Einstellungen für den Pegel
    berücksichtigt, den der jeweilige Benutzer aktuell ausgewählt hat.
    Die höchste der tatsächlich relevanten Schwellen wird zum Auslösen
    eines Events verwendet; die Edge Function filtert anschließend je
    Benutzer auf dessen eigene Schwelle.
    """
    resolved: dict[str, dict] = {}

    targets = webpush._targets()
    for name, push_url, secret_key in targets:
        base_url = push_url.split("/functions/")[0]
        try:
            selected = _fetch_selected(base_url, secret_key)
            rows = _fetch_settings(base_url, secret_key)
        except (requests.exceptions.RequestException, ValueError) as exc:
            logger.warning("Pegelauswahl [%s]: Abfrage fehlgeschlagen: %s", name, exc)
            continue

        for row in rows:
            user_id = str(row.get("user_id") or "")
            raw_id = str(row.get("gauge_id") or "").strip()
            if not user_id or not raw_id:
                continue

            # Nur der aktuell ausgewählte Pegel dieses Benutzers ist für
            # dessen Warnung relevant. So können alte/andere Einstellungen
            # keine Production-Überwachung verfälschen.
            if selected.get(user_id) != raw_id:
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
            "Pegelauswahl: Keine aktive Auswahl gefunden – Fallback Pegel Speyer (%d cm).",
            config.PEGEL_LOW_THRESHOLD_CM,
        )
        resolved = {SPEYER_UUID: {
            "uuid": SPEYER_UUID, "name": "Speyer",
            "threshold_cm": config.PEGEL_LOW_THRESHOLD_CM,
            "thresholds": {config.PEGEL_LOW_THRESHOLD_CM},
        }}

    gauges = list(resolved.values())
    for gauge in gauges:
        gauge["thresholds"] = sorted(gauge["thresholds"])

    logger.info(
        "Pegelauswahl: %d aktuell ausgewählte Pegel überwacht: %s",
        len(gauges),
        ", ".join(f"{g['name']} (<{g['threshold_cm']} cm)" for g in gauges),
    )
    return gauges
