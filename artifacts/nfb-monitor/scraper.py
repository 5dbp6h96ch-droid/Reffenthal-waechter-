"""
scraper.py – ELWIS NfB-Scraper für den NfB-Monitor.

Strategie:
  - NfB-IDs sind sequentiell: YYYY/NNNN  (z. B. 2026/1911)
  - Beim ersten Lauf werden die letzten INITIAL_LOOKBACK IDs geprüft.
  - Danach startet jeder Lauf ab der zuletzt bekannten ID.
  - Filter 1 : Wasserstraße = Rhein
  - Filter 2 : Rhein-km-Abschnitt überschneidet [KM_VON, KM_BIS]
"""

import logging
import re
from datetime import datetime

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ── Konfiguration ──────────────────────────────────────────────────────────────
BASE_URL        = "https://www.elwis.de/DE/dynamisch/Nfb"
USER_AGENT      = "Mozilla/5.0 (compatible; NfB-Monitor/1.0)"

KM_VON: int     = 380          # Bereich-Untergrenze Rhein-km
KM_BIS: int     = 415          # Bereich-Obergrenze Rhein-km

MAX_PER_RUN: int        = 80   # Maximale IDs pro Scan-Lauf
INITIAL_LOOKBACK: int   = 300  # Beim ersten Lauf: wie viele IDs zurückblicken
NOT_FOUND_LIMIT: int    = 10   # Aufeinanderfolgende „404" → Scan stoppen
REQUEST_TIMEOUT: int    = 12   # Sekunden pro HTTP-Request


# ── HTTP-Session ───────────────────────────────────────────────────────────────
def _make_session() -> requests.Session:
    """Erstellt eine wiederverwendbare Requests-Session mit Browser-Header."""
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    return s


# ── HTML-Parser ────────────────────────────────────────────────────────────────
def _page_exists(html: str) -> bool:
    """True wenn die Detailseite eine echte NfB enthält (keine Fehlerseite)."""
    return "Folgender Fehler ist aufgetreten:" not in html


def _parse_detail(html: str, nfb_id: str) -> dict | None:
    """
    Parst eine NfB-Detailseite.

    Gibt None zurück wenn die Seite keine NfB enthält oder der Rhein
    nicht als Wasserstraße vorkommt.

    Rückgabe-Dict:
        nfb_id      str  z.B. '2026/1911'
        titel       str
        km_von      float | None  kleinster Rhein-km-Wert
        km_bis      float | None  größter Rhein-km-Wert
        gueltig_ab  str  (wie auf der Seite)
        gueltig_bis str
        url         str  Link zur Detailseite
        expired     bool
    """
    if not _page_exists(html):
        return None

    soup = BeautifulSoup(html, "html.parser")

    # Hauptinhalt finden
    main = (
        soup.find(id="main")
        or soup.find(class_=re.compile(r"content|main", re.I))
        or soup.body
    )
    if not main:
        return None

    # Alle sichtbaren Texte als flache Liste
    texts = [t.strip() for t in main.stripped_strings if t.strip()]
    full  = "\n".join(texts)

    # Abgelaufen?
    expired = "abgelaufen" in full.lower()

    # Label → Wert Extraktion (Label endet auf ':')
    fields: dict[str, str] = {}
    for i, text in enumerate(texts):
        if text.endswith(":") and i + 1 < len(texts):
            key = text[:-1].strip()
            val = texts[i + 1].strip()
            if key and val and not val.endswith(":"):
                fields[key] = val

    # Titel säubern
    titel = re.sub(r"\s+", " ", fields.get("Titel", "")).strip()

    # Rhein-km-Werte extrahieren
    rhein_km: list[float] = []

    # Suche nach 'Wasserstraße Rhein:'-Block
    wstr_match = re.search(r"Wasserstra[sß]e\s+Rhein\s*:", full, re.IGNORECASE)
    if wstr_match:
        section_start = wstr_match.end()
        # Block endet beim nächsten 'Wasserstraße'-Vorkommen
        next_wstr = re.search(r"Wasserstra[sß]e\s+\w+\s*:", full[section_start:])
        section_end = section_start + next_wstr.start() if next_wstr else len(full)
        section = full[section_start:section_end]

        # Deutsches Kommaformat: 380,0 oder 1234,5
        for m in re.finditer(r"\b(\d{3,4}),(\d+)\b", section):
            try:
                km = float(m.group(1) + "." + m.group(2))
                if 100 <= km <= 1200:   # Plausibilitätscheck
                    rhein_km.append(km)
            except ValueError:
                pass

    # Fallback: 'Rhein-km NNN,N' im Gesamttext
    if not rhein_km:
        for m in re.finditer(r"[Rr]hein[- ]km\s*(\d{3,4})[,.](\d)", full):
            try:
                rhein_km.append(float(m.group(1) + "." + m.group(2)))
            except ValueError:
                pass

    # Wenn kein Rhein-km gefunden → kein Rhein-Bezug
    if not rhein_km:
        return None

    # Detail-URL aufbauen
    detail_url = f"{BASE_URL}/NfbDetailview:elwis_nfb_search:{nfb_id}"

    return {
        "nfb_id":      nfb_id,
        "titel":       titel,
        "km_von":      min(rhein_km),
        "km_bis":      max(rhein_km),
        "gueltig_ab":  fields.get("Betreff gültig von", ""),
        "gueltig_bis": fields.get("Betreff gültig bis", ""),
        "url":         detail_url,
        "expired":     expired,
    }


def _overlaps_range(km_von: float, km_bis: float) -> bool:
    """True wenn [km_von, km_bis] den Bereich [KM_VON, KM_BIS] überschneidet."""
    return km_von <= KM_BIS and km_bis >= KM_VON


# ── Öffentliche API ────────────────────────────────────────────────────────────
def scan(last_id: int, year: int | None = None) -> tuple[list[dict], int]:
    """
    Scannt ELWIS-NfBs ab last_id+1.

    Args:
        last_id:  Letzter bekannter NfB-Index (0 = erster Lauf)
        year:     Prüfjahr (Standard: aktuelles Jahr)

    Returns:
        (treffer, neuer_last_id)
        treffer       – Liste gefilterte NfB-Dicts
        neuer_last_id – höchste bestätigte existierende ID
    """
    if year is None:
        year = datetime.now().year

    # Beim ersten Lauf zurückblicken
    if last_id == 0:
        last_id = max(1, _estimate_current_max(year) - INITIAL_LOOKBACK)
        logger.info("Erster Scan: starte ab %d/%04d", year, last_id)

    session     = _make_session()
    treffer     : list[dict] = []
    not_found   = 0
    checked     = 0
    highest_id  = last_id  # Höchste bestätigte existierende ID

    for num in range(last_id + 1, last_id + MAX_PER_RUN + NOT_FOUND_LIMIT + 1):
        # Abbruchbedingungen
        if checked >= MAX_PER_RUN:
            break
        if not_found >= NOT_FOUND_LIMIT:
            logger.debug("Scan: %d aufeinanderfolgende fehlende IDs → Stopp.", NOT_FOUND_LIMIT)
            break

        nfb_id = f"{year}/{num:04d}"
        url    = f"{BASE_URL}/NfbDetailview:elwis_nfb_search:{nfb_id}"

        try:
            resp = session.get(url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
        except requests.exceptions.Timeout:
            logger.warning("Timeout bei %s – übersprungen.", nfb_id)
            not_found += 1
            continue
        except requests.exceptions.ConnectionError as exc:
            logger.warning("Verbindungsfehler bei %s: %s", nfb_id, exc)
            not_found += 1
            continue
        except requests.exceptions.RequestException as exc:
            logger.warning("HTTP-Fehler bei %s: %s", nfb_id, exc)
            not_found += 1
            continue

        checked += 1

        if not _page_exists(resp.text):
            not_found += 1
            logger.debug("%s existiert nicht.", nfb_id)
            continue

        # ID existiert → Streak zurücksetzen
        not_found  = 0
        highest_id = num

        parsed = _parse_detail(resp.text, nfb_id)

        if parsed is None:
            logger.debug("%s: kein Rhein-km-Bezug.", nfb_id)
            continue

        if parsed["expired"]:
            logger.debug("%s: abgelaufen – übersprungen.", nfb_id)
            continue

        if not _overlaps_range(parsed["km_von"], parsed["km_bis"]):
            logger.debug(
                "%s: Rhein km %.1f–%.1f liegt außerhalb %d–%d.",
                nfb_id, parsed["km_von"], parsed["km_bis"], KM_VON, KM_BIS,
            )
            continue

        logger.info(
            "TREFFER: %s – %s – Rhein km %.1f–%.1f",
            nfb_id, parsed["titel"], parsed["km_von"], parsed["km_bis"],
        )
        treffer.append(parsed)

    logger.info(
        "Scan abgeschlossen: %d IDs geprüft, %d Treffer.", checked, len(treffer)
    )
    return treffer, highest_id


def _estimate_current_max(year: int) -> int:
    """
    Schätzt die aktuell höchste NfB-ID durch GET-Requests.
    Startet bei INITIAL_START und springt in 50er-Schritten vorwärts.
    Maximale 20 Sprünge (= 1000 IDs), danach Rückgabe des letzten Treffers.
    """
    INITIAL_START = 1800
    MAX_JUMPS     = 20

    session  = _make_session()
    num      = INITIAL_START
    for _ in range(MAX_JUMPS):
        candidate = num + 50
        test_id   = f"{year}/{candidate:04d}"
        test_url  = f"{BASE_URL}/NfbDetailview:elwis_nfb_search:{test_id}"
        try:
            r = session.get(test_url, timeout=8, allow_redirects=True)
            if r.status_code == 200 and _page_exists(r.text):
                num = candidate   # Diese ID existiert → weiter springen
            else:
                break             # Seite existiert nicht → Grenze gefunden
        except Exception:
            break
    logger.info("Schätzung aktuelle Max-ID: %d/%04d", year, num)
    return num
