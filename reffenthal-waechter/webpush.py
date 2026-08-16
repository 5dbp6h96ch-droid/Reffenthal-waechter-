"""Web-Push bridge for the watcher."""

import logging
import os
import re

import requests

logger = logging.getLogger(__name__)

_PROJECTS = [
    ("production", "cazlpbdcwycpoftohvtq"),
    ("test", "azssnqabyefqplnoehty"),
]

_MANAGEMENT_API = "https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true"
_key_cache: dict[str, str | None] = {}


def _service_key(ref: str) -> str | None:
    """Bevorzugt den neuen sb_secret_…-Key; der legacy service_role-JWT wird
    von send-event-push nachweislich mit 401 abgelehnt (live getestet)."""
    if ref in _key_cache:
        return _key_cache[ref]
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    key: str | None = None
    if token:
        try:
            resp = requests.get(
                _MANAGEMENT_API.format(ref=ref),
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
            if resp.ok:
                keys = resp.json()
                key = next(
                    (k.get("api_key") for k in keys if k.get("type") == "secret"),
                    None,
                ) or next(
                    (k.get("api_key") for k in keys if k.get("name") == "service_role"),
                    None,
                )
            else:
                logger.warning("WebPush: Management-API %s fehlgeschlagen (%d).", ref, resp.status_code)
        except requests.exceptions.RequestException as exc:
            logger.warning("WebPush: Management-API-Fehler (%s): %s", ref, exc)
    _key_cache[ref] = key
    return key


def _targets() -> list[tuple[str, str, str]]:
    """Liefert nur das ausdrücklich gewählte Ziel.

    WATCH_ENV=production oder WATCH_ENV=test verhindert, dass die Settings
    und Push-Abos der jeweils anderen Umgebung in den Lauf hineinbluten.
    Ohne WATCH_ENV bleibt der bisherige Dual-Target-Modus erhalten.
    """
    targets: list[tuple[str, str, str]] = []
    env_pairs = [
        ("production", "SUPABASE_URL", "SUPABASE_SECRET_KEY"),
        ("test", "TEST_SUPABASE_URL", "TEST_SUPABASE_SECRET_KEY"),
    ]
    watch_env = os.environ.get("WATCH_ENV", "").strip().lower()
    if watch_env in {"production", "test"}:
        env_pairs = [pair for pair in env_pairs if pair[0] == watch_env]

    explicit = set()
    for name, url_var, key_var in env_pairs:
        url = os.environ.get(url_var, "").rstrip("/")
        key = os.environ.get(key_var, "")
        if url and key:
            targets.append((name, f"{url}/functions/v1/send-event-push", key))
            explicit.add(name)

    for name, ref in _PROJECTS:
        if name in explicit or (watch_env and name != watch_env):
            continue
        key = _service_key(ref)
        if key:
            targets.append((name, f"https://{ref}.supabase.co/functions/v1/send-event-push", key))
        else:
            logger.info("WebPush: Kein Schlüssel für %s – Ziel übersprungen.", name)
    return targets


def _clean_markdown(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    text = re.sub(r"[*_`\\]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _link(text: str) -> str:
    match = re.search(r"\[[^\]]+\]\((https?://[^\)]+)\)", text)
    return match.group(1) if match else "/"


def _number_after(label: str, text: str) -> int | None:
    match = re.search(rf"{re.escape(label)}\s*:?\s*(\d+)\s*cm", text, re.IGNORECASE)
    return int(match.group(1)) if match else None


def classify_telegram(text: str) -> tuple[str, str, str, str, dict] | None:
    clean = _clean_markdown(text)
    url = _link(text)
    if text.startswith("⚓ *NfB "):
        # Production push always opens the installed/Home screen web app.
        return (
            "wsv_news", "Neue WSV-Meldung", clean[:240],
            "https://5dbp6h96ch-droid.github.io/Reffenthal-waechter-/", {},
        )
    if text.startswith("*Niedrigwasser-Warnung"):
        return (
            "threshold_crossed", "Pegelwarnung", clean[:240], "/",
            {
                "gauge_id": "SPEYER",
                "current_cm": _number_after("Aktuell", text),
                "threshold_cm": _number_after("Unter Schwelle", text),
            },
        )
    if text.startswith("💧 *Pegel Speyer – Änderung*"):
        return (
            "gauge_change", "Pegeländerung", clean[:240], "/",
            {"gauge_id": "SPEYER", "current_cm": _number_after("Aktuell", text)},
        )
    return None


def send_push(meta: dict) -> bool:
    """Sendet einen Web-Push mit strukturierten Daten (ohne Telegram-Parsing).

    Erwartete Felder in meta:
        event_type, title, body, url (optional), gauge_id, current_cm,
        threshold_cm (optional), previous_cm (optional).
    """
    payload = {
        "event_type": meta["event_type"],
        "title": meta["title"],
        "body": meta["body"],
        "url": meta.get("url", "/"),
    }
    for key in ("gauge_id", "gauge_name", "current_cm", "threshold_cm", "previous_cm", "timestamp"):
        if meta.get(key) is not None:
            payload[key] = meta[key]
    return _send_payload(payload)


def send_for_alert(text: str) -> bool:
    event = classify_telegram(text)
    if event is None:
        return False
    event_type, title, body, url, metadata = event
    payload = {"event_type": event_type, "title": title, "body": body, "url": url, **metadata}
    return _send_payload(payload)


def _send_payload(payload: dict) -> bool:
    targets = _targets()
    if not targets:
        logger.info("WebPush: Keine Ziele konfiguriert – Push übersprungen.")
        return False
    event_type = payload["event_type"]
    any_ok = False
    for name, push_url, secret_key in targets:
        try:
            response = requests.post(
                push_url,
                json=payload,
                headers={
                    "apikey": secret_key,
                    "Authorization": f"Bearer {secret_key}",
                },
                timeout=15,
            )
            if response.ok:
                data = response.json()
                logger.info(
                    "WebPush [%s]: %s – HTTP %d, %d Abo(s) angesprochen, %d Push(s) gesendet.",
                    name, event_type, response.status_code,
                    int(data.get("targeted", 0)), int(data.get("sent", 0)),
                )
                any_ok = any_ok or bool(data.get("ok"))
                continue
            logger.warning("WebPush [%s]: %s fehlgeschlagen (%d): %s", name, event_type, response.status_code, response.text[:300])
        except requests.exceptions.RequestException as exc:
            logger.warning("WebPush [%s]: Verbindungsfehler: %s", name, exc)
        except ValueError as exc:
            logger.warning("WebPush [%s]: Ungültige Antwort: %s", name, exc)
    return any_ok
