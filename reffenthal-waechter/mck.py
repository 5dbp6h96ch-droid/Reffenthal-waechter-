"""MCK Kurpfalz Mannheim – Kraftstoffpreis-Scraper.

Liest Benzin- und Dieselpreise von der offiziellen MCK-Webseite.
Robuste Erkennung: funktioniert auch wenn sich das Seitenlayout ändert.
"""
import logging
import re
from datetime import datetime, timezone

import requests  # noqa: E402  (immer verfügbar in reffenthal-waechter env)

MCK_URL = "https://www.mck-mannheim.de/"
logger = logging.getLogger(__name__)


def fetch_prices() -> dict:
    """Holt Kraftstoffpreise von www.mck-mannheim.de.

    Returns:
        Dict mit source, petrol, diesel, unit, sourceDate, checkedAt.
        Bei Fehler zusätzlich error-Schlüssel; petrol/diesel dann None.
    """
    checked_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    result: dict = {
        "source": "MCK Kurpfalz Mannheim",
        "petrol": None,
        "diesel": None,
        "unit": "€/l",
        "sourceDate": None,
        "checkedAt": checked_at,
    }

    try:
        resp = requests.get(
            MCK_URL,
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (compatible; Reffenthal-Waechter/1.0)"},
        )
        resp.raise_for_status()
        html = resp.text
    except Exception as exc:  # noqa: BLE001
        logger.warning("MCK: Abruf fehlgeschlagen: %s", exc)
        result["error"] = str(exc)
        return result

    # Plain-Text nach Tag-Strip (Fallback-Basis)
    plain = re.sub(r"<[^>]+>", " ", html)

    for fuel, key in [("Benzin", "petrol"), ("Diesel", "diesel")]:
        # Primär: Format mit Superscript-Drittelstelle
        # z.B. Benzin 2,37<sup style="font-size: 0.6em;">0</sup>€
        m = re.search(
            rf"{fuel}\s+(\d+),(\d{{2}})<sup[^>]*>(\d)</sup>",
            html,
            re.IGNORECASE,
        )
        if m:
            result[key] = float(f"{m.group(1)}.{m.group(2)}{m.group(3)}")
            continue

        # Fallback A: X,YZD direkt ohne Superscript (z.B. Benzin 2,370€)
        m = re.search(
            rf"{fuel}\s+(\d+),(\d{{3}})\s*€",
            html,
            re.IGNORECASE,
        )
        if m:
            result[key] = float(f"{m.group(1)}.{m.group(2)}")
            continue

        # Fallback B: X,YZ ohne dritte Stelle (plain text)
        m2 = re.search(
            rf"{fuel}[\s:]+(\d+)[,.](\d+)",
            plain,
            re.IGNORECASE,
        )
        if m2:
            result[key] = float(f"{m2.group(1)}.{m2.group(2)}")

    # Stand-Datum (optional)
    m = re.search(r"[Ss]tand[\s:]*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})", plain)
    if m:
        result["sourceDate"] = m.group(1)

    # Validierung: Kraftstoffpreise müssen realistische €/l-Werte sein
    def _valid(p: object) -> bool:
        return isinstance(p, float) and 0.5 <= p <= 5.0

    for key in ("petrol", "diesel"):
        if not _valid(result[key]):
            logger.warning("MCK: %s-Preis ungültig oder nicht erkannt: %s", key, result[key])
            result[key] = None

    if result["petrol"] is None and result["diesel"] is None:
        result["error"] = "Preise nicht erkannt"
        logger.warning("MCK: Keine gültigen Preise auf %s gefunden.", MCK_URL)
    else:
        logger.info(
            "MCK: Benzin=%s €/l  Diesel=%s €/l  Stand=%s",
            result["petrol"],
            result["diesel"],
            result["sourceDate"] or "unbekannt",
        )

    return result
