"""
Elwis NfB (Nachrichten für Binnenschiffer) – direktes HTML-Scraping.

Strategie:
  - NfB-IDs sind sequentiell: YEAR/NNNN  (z. B. 2026/1911)
  - Jeder Lauf prüft IDs ab dem zuletzt gechecken Index aufwärts (max. 80)
  - Filter: Wasserstraße = Rhein  UND  km ∈ [KM_VON, KM_BIS]
  - Abgelaufene NfBs werden übersprungen

State-Schlüssel (in state.json unter 'elwis'):
  last_id_YYYY: int  – letzter geprüfter NfB-Index im Jahr YYYY
"""

import logging
import re
from datetime import datetime

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE_URL = "https://www.elwis.de/DE/dynamisch/Nfb"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"

KM_VON: int = 380
KM_BIS: int = 435

# Wieviele neue IDs maximal pro Lauf prüfen
MAX_PER_RUN: int = 80
# Startpunkt beim allerersten Lauf (wie viele IDs zurückblicken)
INITIAL_LOOKBACK: int = 600
# Wenn N aufeinanderfolgende IDs nicht existieren → Scan stoppen
NOT_FOUND_LIMIT: int = 10


# ──────────────────────────────────────────────
# Interne Hilfsfunktionen
# ──────────────────────────────────────────────

def _session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


def _current_year() -> int:
    return datetime.now().year


def _fetch_max_id_approx(session: requests.Session, year: int, hint: int) -> int:
    """Schätzt den aktuellen höchsten NfB-Index, indem ab hint vorwärts gesucht wird.

    Nutzt die leichtere PDF-URL (HEAD-Request) um schnell zu prüfen ob eine ID existiert.
    """
    num = hint
    while True:
        url = f"{BASE_URL}/NfbDetailview/showPdf:{num + 20:04d}/{year}"
        try:
            r = session.head(url, timeout=6, allow_redirects=True)
            if r.status_code == 200:
                num += 20
            else:
                break
        except Exception:
            break
    # Binärsuche Feintuning wäre übertrieben – einfach hint zurückgeben
    return num


def _nfb_exists(html_text: str) -> bool:
    """True wenn die Detailseite eine echte NfB enthält (kein Fehler)."""
    return "Folgender Fehler ist aufgetreten:" not in html_text


def _parse_nfb(html: str, nfb_id: str) -> dict | None:
    """Parst eine NfB-Detailseite und gibt ein Daten-Dict zurück oder None."""
    if not _nfb_exists(html):
        return None

    soup = BeautifulSoup(html, "html.parser")
    main = soup.find(id="main") or soup.find(class_=re.compile(r"content|main"))
    if not main:
        return None

    texts = [t.strip() for t in main.stripped_strings if t.strip()]
    full = "\n".join(texts)

    # Abgelaufen?
    expired = "abgelaufen" in full.lower()

    # Schlüssel-Wert-Felder (Label endet auf ':')
    fields: dict[str, str] = {}
    for i, text in enumerate(texts):
        if text.endswith(":") and i + 1 < len(texts):
            key = text[:-1].strip()
            val = texts[i + 1].strip()
            if key and val and not val.endswith(":"):
                fields[key] = val

    # Titel säubern
    titel = fields.get("Titel", "")
    titel = re.sub(r"\s+", " ", titel).strip()

    # Eingabestelle
    eingabestelle = fields.get("Eingabestelle", "")

    # PDF-Link
    pdf_url = fields.get("Nummer oder Adresse", "")
    if not pdf_url.startswith("http"):
        pdf_url = (
            f"https://www.elwis.de/DE/dynamisch/Nfb/NfbDetailview/"
            f"showPdf:{nfb_id.split('/')[1]}/{nfb_id.split('/')[0]}"
        )

    # Wasserstraße Rhein – km-Abschnitte extrahieren
    rhein_km_values: list[float] = []

    # Suche nach dem 'Wasserstraße Rhein:'-Block
    wstr_pattern = re.compile(r"Wasserstra[sß]e\s+Rhein\s*:", re.IGNORECASE)
    match = wstr_pattern.search(full)
    if match:
        section_start = match.end()
        # Ende des Abschnitts: nächstes 'Wasserstraße' oder Ende
        next_wstr = re.search(r"Wasserstra[sß]e\s+\w+\s*:", full[section_start:])
        section_end = section_start + next_wstr.start() if next_wstr else len(full)
        section = full[section_start:section_end]

        # Km-Werte im deutschen Format: 380,0 – 435,9
        for m in re.finditer(r"\b(\d{3,4}),(\d+)\b", section):
            try:
                km = float(m.group(1) + "." + m.group(2))
                if 100 <= km <= 1000:  # Plausibilitätscheck
                    rhein_km_values.append(km)
            except ValueError:
                pass

    # Fallback: 'Rhein-km NNN,N' Muster im gesamten Text
    if not rhein_km_values:
        for m in re.finditer(r"[Rr]hein[- ]km\s*(\d{3,4})[,.](\d)", full):
            try:
                km = float(m.group(1) + "." + m.group(2))
                rhein_km_values.append(km)
            except ValueError:
                pass

    return {
        "nfb_id": nfb_id,
        "expired": expired,
        "titel": titel,
        "eingabestelle": eingabestelle,
        "fields": fields,
        "rhein_km": rhein_km_values,
        "pdf_url": pdf_url,
        "detail_url": (
            f"{BASE_URL}/NfbDetailview:elwis_nfb_search:{nfb_id}"
        ),
        "full_text": full,
    }


def _in_range(parsed: dict) -> bool:
    """True wenn die NfB den Bereich Rhein km 380–435 betrifft."""
    km = parsed.get("rhein_km", [])
    if not km:
        return False
    # NfB überlappt mit [KM_VON, KM_BIS] wenn min <= KM_BIS und max >= KM_VON
    return min(km) <= KM_BIS and max(km) >= KM_VON


# ──────────────────────────────────────────────
# Hauptfunktion
# ──────────────────────────────────────────────

def check_elwis(state: dict) -> tuple[list[dict], dict]:
    """Prüft neue Elwis-NfBs für Rhein km 380–435.

    Args:
        state: aktueller Zustand aus state.json

    Returns:
        (relevante_neue_nfbs, aktualisierter_state)
    """
    year = _current_year()
    state_key = f"elwis_last_id_{year}"
    elwis_state = state.get("elwis", {})
    last_id: int = elwis_state.get(state_key, 0)

    session = _session()

    # Erster Lauf: Startpunkt schätzen
    if last_id == 0:
        # Nutze bekannten aktuellen Wert; Fallback: konservative Schätzung
        approx_max = _fetch_max_id_approx(session, year, hint=1900)
        last_id = max(1, approx_max - INITIAL_LOOKBACK)
        logger.info("Elwis: erster Lauf, starte bei ID %d/%04d", year, last_id)

    new_relevant: list[dict] = []
    not_found_streak = 0
    checked = 0
    current_id = last_id

    for num in range(last_id + 1, last_id + MAX_PER_RUN + NOT_FOUND_LIMIT + 1):
        if checked >= MAX_PER_RUN:
            break
        if not_found_streak >= NOT_FOUND_LIMIT:
            logger.debug("Elwis: %d aufeinanderfolgende IDs nicht gefunden – Stopp.", NOT_FOUND_LIMIT)
            break

        nfb_id = f"{year}/{num:04d}"
        url = f"{BASE_URL}/NfbDetailview:elwis_nfb_search:{nfb_id}"

        try:
            r = session.get(url, timeout=10)
        except Exception as exc:
            logger.warning("Elwis %s: Netzwerkfehler: %s", nfb_id, exc)
            not_found_streak += 1
            continue

        html = r.text
        checked += 1

        if not _nfb_exists(html):
            not_found_streak += 1
            logger.debug("Elwis %s: nicht vorhanden.", nfb_id)
            continue

        not_found_streak = 0
        current_id = num  # Merken dass diese ID existiert

        parsed = _parse_nfb(html, nfb_id)
        if parsed is None:
            continue

        if parsed["expired"]:
            logger.debug("Elwis %s: abgelaufen – übersprungen.", nfb_id)
            continue

        # Wasserstraße Rhein + km 380–435?
        if not _in_range(parsed):
            wstrs = re.findall(r"Wasserstra[sß]e\s+(\w+)\s*:", parsed["full_text"], re.IGNORECASE)
            logger.debug(
                "Elwis %s: kein Rhein-km-Treffer (Eingabe: %s, Wstrs: %s).",
                nfb_id, parsed["eingabestelle"], wstrs,
            )
            continue

        logger.info(
            "Elwis: Rhein km 380–435 TREFFER: %s – %s – km %s",
            nfb_id, parsed["titel"], parsed["rhein_km"],
        )
        new_relevant.append(parsed)

    # State aktualisieren – nur vorwärts
    if current_id > elwis_state.get(state_key, 0):
        elwis_state[state_key] = current_id
        state = {**state, "elwis": elwis_state}

    logger.info(
        "Elwis: %d IDs geprüft, %d neue Rhein-380–435-NfBs gefunden.",
        checked, len(new_relevant),
    )
    return new_relevant, state


# ──────────────────────────────────────────────
# Telegram-Formatierung
# ──────────────────────────────────────────────

def _escape_md(text: str) -> str:
    """Escaped Sonderzeichen für Telegram MarkdownV1."""
    for ch in ("_", "*", "`", "["):
        text = text.replace(ch, f"\\{ch}")
    return text


def format_telegram_message(entry: dict) -> str:
    """Formatiert eine NfB als Telegram-Nachricht."""
    titel = _escape_md(entry.get("titel", "Kein Titel"))
    nfb_id = entry.get("nfb_id", "")
    fields = entry.get("fields", {})
    km_list = entry.get("rhein_km", [])
    pdf_url = entry.get("pdf_url", "")
    detail_url = entry.get("detail_url", "")

    # km-Bereich kompakt darstellen
    if km_list:
        km_min = min(km_list)
        km_max = max(km_list)
        km_str = f"km {km_min:.1f}–{km_max:.1f}" if km_min != km_max else f"km {km_min:.1f}"
    else:
        km_str = "km unbekannt"

    # Gültigkeitszeitraum
    von = fields.get("Betreff gültig von", "")
    bis = fields.get("Betreff gültig bis", "")
    von = re.sub(r"\s+", " ", von).replace("\n", " ").strip()
    bis = re.sub(r"\s+", " ", bis).replace("\n", " ").strip()
    zeitraum = ""
    if von:
        zeitraum = f"📅 von {_escape_md(von)}"
        if bis:
            zeitraum += f"\n📅 bis {_escape_md(bis)}"

    grund = _escape_md(fields.get("Grund", ""))
    eingabe = _escape_md(fields.get("Eingabestelle", ""))

    lines = [
        f"⚓ *NfB {nfb_id} – Rhein {km_str}*",
        f"",
        f"*{titel}*",
    ]
    if grund:
        lines.append(f"Grund: {grund}")
    if eingabe:
        lines.append(f"Herausgeber: {eingabe}")
    if zeitraum:
        lines.append(f"")
        lines.append(zeitraum)
    if pdf_url:
        lines.append(f"")
        lines.append(f"🔗 [PDF-Bekanntmachung]({pdf_url})")
    elif detail_url:
        lines.append(f"")
        lines.append(f"🔗 [Detailseite]({detail_url})")

    return "\n".join(lines)
