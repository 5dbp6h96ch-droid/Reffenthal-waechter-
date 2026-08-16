"""
Pegel-Überwachung für den Reffenthal-Wächter.
"""

import logging
from datetime import datetime

import requests

from config import HTTP_TIMEOUT, PEGEL_API_URL, PEGEL_CHANGE_THRESHOLD_CM, PEGEL_LOW_THRESHOLD_CM, USER_AGENT

logger = logging.getLogger(__name__)
MAX_HISTORY = 8640


def fetch_pegel() -> dict | None:
    headers = {"User-Agent": USER_AGENT}
    try:
        response = requests.get(PEGEL_API_URL, headers=headers, timeout=HTTP_TIMEOUT)
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.Timeout:
        logger.error("Pegel: Zeitüberschreitung beim Abrufen.")
        return None
    except requests.exceptions.ConnectionError as exc:
        logger.error("Pegel: Verbindungsfehler: %s", exc)
        return None
    except requests.exceptions.HTTPError as exc:
        logger.error("Pegel: HTTP-Fehler %s", exc.response.status_code)
        return None
    except requests.exceptions.RequestException as exc:
        logger.error("Pegel: Fehler: %s", exc)
        return None
    except (KeyError, ValueError) as exc:
        logger.error("Pegel: Ungültige Antwort: %s", exc)
        return None
    try:
        value_cm = int(round(float(data["value"])))
        timestamp = data.get("timestamp", datetime.now().isoformat())
        logger.info("Pegel: %d cm (%s)", value_cm, timestamp)
        return {"value_cm": value_cm, "timestamp": timestamp}
    except (KeyError, TypeError, ValueError) as exc:
        logger.error("Pegel: Fehler beim Parsen der Antwort: %s – %s", data, exc)
        return None


def fetch_history(days: int = 30) -> list[dict]:
    url = "https://pegelonline.wsv.de/webservices/rest-api/v2/stations/" f"SPEYER/W/measurements.json?start=P{days}D"
    headers = {"User-Agent": USER_AGENT}
    try:
        response = requests.get(url, headers=headers, timeout=HTTP_TIMEOUT)
        response.raise_for_status()
        data = response.json()
        history = []
        for m in data:
            try:
                history.append({"cm": int(round(float(m["value"]))), "ts": m["timestamp"]})
            except (KeyError, TypeError, ValueError):
                continue
        logger.info("Pegel: %d historische Messwerte geladen (%d Tage).", len(history), days)
        return history
    except Exception as exc:
        logger.warning("Pegel: Historische Daten konnten nicht geladen werden: %s", exc)
        return []


def analyze_pegel(current: dict, state: dict) -> dict:
    value_cm = current["value_cm"]
    timestamp = current["timestamp"]
    last_cm = state.get("last_pegel_cm")
    history: list = state.get("history", [])
    history.append({"cm": value_cm, "ts": timestamp})
    if len(history) > MAX_HISTORY:
        history = history[-MAX_HISTORY:]
    updated_state = {"last_pegel_cm": value_cm, "last_pegel_time": timestamp, "history": history}

    delta_cm = None
    changed = False
    if last_cm is not None:
        delta_cm = value_cm - last_cm
        changed = abs(delta_cm) >= PEGEL_CHANGE_THRESHOLD_CM
        if changed:
            direction = "gestiegen" if delta_cm > 0 else "gefallen"
            logger.info("Pegel: %d → %d cm (%+d cm, %s).", last_cm, value_cm, delta_cm, direction)
    else:
        logger.info("Pegel: Erster Messwert (%d cm).", value_cm)

    low_alert = value_cm < PEGEL_LOW_THRESHOLD_CM and (last_cm is None or last_cm >= PEGEL_LOW_THRESHOLD_CM)
    if low_alert:
        logger.warning("Pegel: WARNUNG – Pegel %d cm unter Schwelle %d cm!", value_cm, PEGEL_LOW_THRESHOLD_CM)

    return {
        "changed": changed,
        "low_alert": low_alert,
        "delta_cm": delta_cm,
        "previous_cm": last_cm,
        "updated_state": updated_state,
    }


def format_change_message(value_cm: int, delta_cm: int | None, timestamp: str) -> str:
    if delta_cm is not None:
        direction = "⬆️ gestiegen" if delta_cm > 0 else "⬇️ gefallen"
        delta_str = f"\n📊 Veränderung: {delta_cm:+d} cm ({direction})"
    else:
        delta_str = ""
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        ts_str = dt.strftime("%d.%m.%Y %H:%M Uhr")
    except (ValueError, AttributeError):
        ts_str = timestamp
    return f"💧 *Pegel Speyer – Änderung*\n\n🌊 Aktuell: *{value_cm} cm*{delta_str}\n🕐 Stand: {ts_str}"


def format_daily_report_message(value_cm: int, timestamp: str, history: list) -> str:
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        ts_str = dt.strftime("%d.%m.%Y %H:%M Uhr")
    except (ValueError, AttributeError):
        ts_str = timestamp
    trend = ""
    if len(history) >= 2:
        recent = history[-6:]
        delta = recent[-1]["cm"] - recent[0]["cm"]
        if delta > 2:
            trend = f"\n📈 Tendenz: steigend ({delta:+d} cm)"
        elif delta < -2:
            trend = f"\n📉 Tendenz: fallend ({delta:+d} cm)"
        else:
            trend = "\n➡️ Tendenz: stabil"
    status = f"\n⚠️ Unter Schwelle ({PEGEL_LOW_THRESHOLD_CM} cm)!" if value_cm < PEGEL_LOW_THRESHOLD_CM else ""
    return f"🌅 *Täglicher Pegel-Bericht – Speyer*\n\n🌊 Aktuell: *{value_cm} cm*{trend}{status}\n🕐 Stand: {ts_str}"


def format_low_alert_message(value_cm: int, timestamp: str) -> str:
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        ts_str = dt.strftime("%d.%m.%Y %H:%M Uhr")
    except (ValueError, AttributeError):
        ts_str = timestamp
    return f"*Niedrigwasser-Warnung – Pegel Speyer*\n\nAktuell: *{value_cm} cm*\nUnter Schwelle: {PEGEL_LOW_THRESHOLD_CM} cm\nStand: {ts_str}"
