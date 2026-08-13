"""
nfb.py – ELWIS-NfB-Scanner für den Reffenthal-Wächter.

Läuft als Modul im Wächter-Prozess (alle 30 Minuten via GitHub Actions
und Replit-Workflow). State wird in nfb-state.json gespeichert und per
Git gepusht – kein SQLite, kein dauerhafter Prozess nötig.

Strategie:
  - NfB-IDs sind sequentiell: YYYY/NNNN  (z.B. 2026/1911)
  - Beim ersten Lauf: INITIAL_LOOKBACK IDs zurückblicken
  - Filter: Wasserstraße = Rhein  (der Mobile-Client filtert nach km)
  - Neue Treffer  → Telegram-Alert + in active-Liste
  - Alle aktiven  → nfb.json (Mobile-App liest via GitHub Raw)
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

import requests
from bs4 import BeautifulSoup

from webpush import send_for_alert

logger = logging.getLogger(__name__)

BASE_URL          = "https://www.elwis.de/DE/dynamisch/Nfb"
USER_AGENT        = "Mozilla/5.0 (compatible; Reffenthal-Waechter/1.0)"
MAX_PER_RUN       = 80
INITIAL_LOOKBACK  = 300
NOT_FOUND_LIMIT   = 10

_HERE      = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(_HERE, "nfb-state.json")
NFB_JSON   = os.path.join(_HERE, "nfb.json")

_DEFAULT_STATE: dict[str, Any] = {
    "last_id":    0,
    "year":       datetime.now(timezone.utc).year,
    "active":     [],
    "alerted":    [],
    "updated_at": "",
}


def _load_state() -> dict[str, Any]:
    try:
        with open(STATE_FILE, encoding="utf-8") as f:
            data = json.load(f)
        for k, v in _DEFAULT_STATE.items():
            data.setdefault(k, v)
        return data
    except (FileNotFoundError, ValueError):
        return dict(_DEFAULT_STATE)


def _save_state(state: dict[str, Any]) -> None:
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    os.replace(tmp, STATE_FILE)


def _write_nfb_json(active: list[dict]) -> None:
    payload = {
        "meldungen":  active,
        "count":      len(active),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    tmp = NFB_JSON + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, NFB_JSON)
    logger.info("nfb.json geschrieben: %d Einträge.", len(active))


def _session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


def _page_exists(html: str) -> bool:
    return "Folgender Fehler ist aufgetreten:" not in html


def _parse_detail(html: str, nfb_id: str) -> dict | None:
    if not _page_exists(html):
        return None
    soup = BeautifulSoup(html, "html.parser")
    main = (
        soup.find(id="main")
        or soup.find(class_=re.compile(r"content|main", re.I))
        or soup.body
    )
    if not main:
        return None

    texts = [t.strip() for t in main.stripped_strings if t.strip()]
    full  = "\n".join(texts)
    expired = "abgelaufen" in full.lower()

    fields: dict[str, str] = {}
    for i, text in enumerate(texts):
        if text.endswith(":") and i + 1 < len(texts):
            key = text[:-1].strip()
            val = texts[i + 1].strip()
            if key and val and not val.endswith(":"):
                fields[key] = val

    titel = re.sub(r"\s+", " ", fields.get("Titel", "")).strip()

    rhein_km: list[float] = []
    wstr_match = re.search(r"Wasserstra[sß]e\s+Rhein\s*:", full, re.IGNORECASE)
    if wstr_match:
        s0  = wstr_match.end()
        nxt = re.search(r"Wasserstra[sß]e\s+\w+\s*:", full[s0:])
        sec = full[s0 : s0 + nxt.start()] if nxt else full[s0:]
        for m in re.finditer(r"\b(\d{3,4}),(\d+)\b", sec):
            try:
                km = float(m.group(1) + "." + m.group(2))
                if 100 <= km <= 1200:
                    rhein_km.append(km)
            except ValueError:
                pass

    if not rhein_km:
        for m in re.finditer(r"[Rr]hein[- ]km\s*(\d{3,4})[,.](\d)", full):
            try:
                rhein_km.append(float(m.group(1) + "." + m.group(2)))
            except ValueError:
                pass

    if not rhein_km:
        return None

    return {
        "nfb_id":      nfb_id,
        "titel":       titel,
        "km_von":      min(rhein_km),
        "km_bis":      max(rhein_km),
        "gueltig_ab":  fields.get("Betreff gültig von", ""),
        "gueltig_bis": fields.get("Betreff gültig bis", ""),
        "url":         f"{BASE_URL}/NfbDetailview:elwis_nfb_search:{nfb_id}",
        "expired":     expired,
        "first_seen":  datetime.now(timezone.utc).isoformat(),
    }


def _estimate_current_max(session: requests.Session, year: int) -> int:
    num = 1800
    for _ in range(20):
        candidate = num + 50
        url = f"{BASE_URL}/NfbDetailview:elwis_nfb_search:{year}/{candidate:04d}"
        try:
            r = session.get(url, timeout=8, allow_redirects=True)
            if r.status_code == 200 and _page_exists(r.text):
                num = candidate
            else:
                break
        except Exception:
            break
    logger.info("NfB: Schätzung Max-ID: %d/%04d", year, num)
    return num


def _scan(last_id: int, year: int) -> tuple[list[dict], int]:
    session    = _session()
    if last_id == 0:
        last_id = max(1, _estimate_current_max(session, year) - INITIAL_LOOKBACK)
        logger.info("NfB: Erster Scan, starte ab %d/%04d", year, last_id)

    treffer:   list[dict] = []
    not_found  = 0
    checked    = 0
    highest_id = last_id

    for num in range(last_id + 1, last_id + MAX_PER_RUN + NOT_FOUND_LIMIT + 1):
        if checked >= MAX_PER_RUN:
            break
        if not_found >= NOT_FOUND_LIMIT:
            break

        nfb_id = f"{year}/{num:04d}"
        url    = f"{BASE_URL}/NfbDetailview:elwis_nfb_search:{nfb_id}"
        try:
            resp = session.get(url, timeout=12)
            resp.raise_for_status()
        except requests.exceptions.Timeout:
            logger.warning("NfB: Timeout bei %s", nfb_id)
            not_found += 1
            continue
        except requests.exceptions.RequestException as exc:
            logger.warning("NfB: Fehler bei %s: %s", nfb_id, exc)
            not_found += 1
            continue

        checked += 1
        if not _page_exists(resp.text):
            not_found += 1
            continue

        not_found  = 0
        highest_id = num

        parsed = _parse_detail(resp.text, nfb_id)
        if parsed is None or parsed["expired"]:
            continue

        logger.info(
            "NfB TREFFER: %s – %s – Rhein km %.1f–%.1f",
            nfb_id, parsed["titel"], parsed["km_von"], parsed["km_bis"],
        )
        treffer.append(parsed)

    logger.info("NfB-Scan: %d IDs geprüft, %d Treffer.", checked, len(treffer))
    return treffer, highest_id


def _format_telegram(entry: dict) -> str:
    def esc(t: str) -> str:
        for ch in ("_", "*", "`", "["):
            t = t.replace(ch, f"\\{ch}")
        return t

    nfb_id = entry.get("nfb_id", "")
    titel  = esc(entry.get("titel", "Kein Titel"))
    kv     = entry.get("km_von")
    kb     = entry.get("km_bis")
    ab     = esc(re.sub(r"\s+", " ", entry.get("gueltig_ab", "") or "").strip())
    bis    = esc(re.sub(r"\s+", " ", entry.get("gueltig_bis", "") or "").strip())
    url    = entry.get("url", "")

    km_str = (
        f"km {kv:.1f}–{kb:.1f}" if (kv is not None and kb is not None and kv != kb)
        else f"km {kv:.1f}" if kv is not None
        else "km unbekannt"
    )
    lines = [f"⚓ *NfB {nfb_id} – Rhein {km_str}*", "", f"*{titel}*"]
    if ab:
        lines += ["", f"📅 von {ab}"]
        if bis:
            lines.append(f"📅 bis {bis}")
    if url:
        lines += ["", f"🔗 [Detailseite]({url})"]
    return "\n".join(lines)


def _send_telegram(text: str, token: str, chat_id: str) -> bool:
    if not token or not chat_id:
        logger.warning("NfB: Telegram nicht konfiguriert.")
        return False
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown",
                  "disable_web_page_preview": False},
            timeout=15,
        )
        resp.raise_for_status()
        logger.info("NfB: Telegram-Alert gesendet (%d Z.).", len(text))
        try:
            send_for_alert(text)
        except Exception as exc:  # noqa: BLE001
            logger.warning("WebPush: unerwarteter Fehler: %s", exc)
        return True
    except requests.exceptions.RequestException as exc:
        logger.error("NfB: Telegram-Fehler: %s", exc)
        return False


def run(telegram_token: str = "", telegram_chat_id: str = "") -> int:
    """
    Führt einen NfB-Scan-Lauf durch.

    Lädt State, scannt ELWIS, sendet Telegram-Alerts für neue Einträge,
    schreibt nfb.json und speichert den aktualisierten State.

    Returns: Anzahl neu gesendeter Alerts.
    """
    state = _load_state()
    year  = datetime.now(timezone.utc).year

    if state["year"] != year:
        logger.info("NfB: Jahreswechsel %d → %d, Cursor zurückgesetzt.", state["year"], year)
        state.update({"last_id": 0, "year": year, "active": [], "alerted": []})

    last_id     = state["last_id"]
    alerted_set = set(state.get("alerted", []))
    active      = state.get("active", [])
    active_ids  = {e["nfb_id"] for e in active}
    new_alerts  = 0

    treffer, new_last_id = _scan(last_id, year)

    for entry in treffer:
        nfb_id = entry["nfb_id"]
        if nfb_id not in active_ids:
            active.append(entry)
            active_ids.add(nfb_id)
        if nfb_id not in alerted_set:
            if _send_telegram(_format_telegram(entry), telegram_token, telegram_chat_id):
                alerted_set.add(nfb_id)
                new_alerts += 1

    state["last_id"] = new_last_id
    state["active"]  = active
    state["alerted"] = list(alerted_set)
    _save_state(state)
    _write_nfb_json(active)

    logger.info("NfB: %d neu gesendet, %d aktiv gesamt.", new_alerts, len(active))
    return new_alerts
