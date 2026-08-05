"""
Forum-Überwachung für den Reffenthal-Wächter.

Ergänzt die RSS-Überwachung um direkte Suche im Boote-Forum
ohne Selenium oder Browser-Automatisierung.
"""

import logging

import requests
from bs4 import BeautifulSoup

from config import HTTP_TIMEOUT, SEARCH_TERMS, USER_AGENT

logger = logging.getLogger(__name__)

# Basis-URL für das Boote-Forum
FORUM_SEARCH_URL = "https://www.boote-forum.de/search.php"


def _contains_search_term(text: str) -> list[str]:
    """Gibt alle Suchbegriffe zurück, die im Text (case-insensitiv) vorkommen."""
    text_lower = text.lower()
    return [term for term in SEARCH_TERMS if term.lower() in text_lower]


def search_forum(term: str) -> list[dict]:
    """Durchsucht das Boote-Forum nach einem Begriff via HTTP-Anfrage.

    Args:
        term: Suchbegriff.

    Returns:
        Liste mit gefundenen Threads als Dicts mit 'title', 'link', 'snippet'.
    """
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "de-DE,de;q=0.9",
    }
    params = {
        "do": "process",
        "query": term,
        "titleonly": "0",
        "searchuser": "",
        "exactname": "1",
        "forums": "all",
        "sortby": "dateline",
        "order": "desc",
        "type": "posts",
    }

    results: list[dict] = []
    try:
        response = requests.get(
            FORUM_SEARCH_URL,
            params=params,
            headers=headers,
            timeout=HTTP_TIMEOUT,
        )
        response.raise_for_status()
    except requests.exceptions.Timeout:
        logger.error("Forum: Zeitüberschreitung bei Suche nach '%s'", term)
        return results
    except requests.exceptions.RequestException as exc:
        logger.error("Forum: Fehler bei Suche nach '%s': %s", term, exc)
        return results

    soup = BeautifulSoup(response.text, "html.parser")

    # Suchergebnisse extrahieren (vBulletin-typische Struktur)
    for item in soup.select("li.search-result, div.search-result, .searchresults li"):
        title_tag = item.find("a")
        if not title_tag:
            continue
        title = title_tag.get_text(strip=True)
        link = title_tag.get("href", "")
        if link and not link.startswith("http"):
            link = "https://www.boote-forum.de/" + link.lstrip("/")

        snippet_tag = item.find(class_=["search-excerpt", "preview"])
        snippet = snippet_tag.get_text(strip=True) if snippet_tag else ""

        results.append({
            "title": title,
            "link": link,
            "snippet": snippet,
            "term": term,
        })

    logger.debug("Forum Suche '%s': %d Ergebnisse", term, len(results))
    return results


def check_forum_for_terms() -> list[dict]:
    """Sucht das Forum nach allen konfigurierten Suchbegriffen.

    Gibt deduplizierte Ergebnisse zurück (nach Link).
    """
    seen_links: set[str] = set()
    all_results: list[dict] = []

    for term in SEARCH_TERMS:
        entries = search_forum(term)
        for entry in entries:
            link = entry.get("link", "")
            if link and link not in seen_links:
                seen_links.add(link)
                all_results.append(entry)

    logger.info("Forum Suche gesamt: %d neue Einträge", len(all_results))
    return all_results
