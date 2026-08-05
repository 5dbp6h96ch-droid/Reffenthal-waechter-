# Reffenthal-Wächter 🌊

Ein automatischer Wächter, der Informationen rund um den Reffenthal (Altrhein bei Speyer) sammelt und per Telegram meldet.

## Was er überwacht

| Modul | Quelle | Aktion |
|-------|--------|--------|
| **RSS** | [Boote-Forum](https://www.boote-forum.de) | Neue Forenbeiträge mit relevanten Begriffen per Telegram |
| **Pegel** | [WSV Pegelonline](https://pegelonline.wsv.de) | Alarm bei Änderung ≥ 5 cm oder Pegel < 260 cm |

### Überwachte Suchbegriffe
- Reffenthal, Reffenthaler
- Angelhofer Altrhein, Otterstädter Altrhein
- Wassertiefe, Wasserstand, Versandung
- Zufahrt, Einfahrt
- Pegel Speyer

---

## Projektstruktur

```
reffenthal-waechter/
├── watcher.py       # Hauptprogramm
├── config.py        # Konfiguration (Suchbegriffe, Schwellen, Telegram)
├── rss.py           # RSS-Feed-Überwachung
├── forum.py         # Direkte Forum-Suche
├── pegel.py         # Pegel-Speyer-Überwachung
├── telegram.py      # Telegram Bot API
├── storage.py       # JSON-Speicherung
├── requirements.txt # Python-Abhängigkeiten
├── seen.json        # Bereits gesendete RSS-Einträge (auto)
├── state.json       # Letzter Pegelstand + Verlauf (auto)
└── .github/
    └── workflows/
        └── watcher.yml  # GitHub Actions (alle 30 Min.)
```

---

## Installation & Betrieb

### In Replit

1. Dieses Repository in Replit öffnen oder klonen.
2. **Replit Secret** setzen (siehe unten).
3. `config.py` öffnen und `TELEGRAM_CHAT_ID` eintragen.
4. Im Terminal ausführen:

```bash
cd reffenthal-waechter
pip install -r requirements.txt
python watcher.py
```

### Lokal

```bash
git clone https://github.com/DEIN-BENUTZERNAME/reffenthal-waechter.git
cd reffenthal-waechter/reffenthal-waechter
pip install -r requirements.txt
export TELEGRAM_BOT_TOKEN="dein_bot_token"
python watcher.py
```

---

## Secrets & Konfiguration

### Replit Secrets

| Secret | Beschreibung |
|--------|-------------|
| `TELEGRAM_BOT_TOKEN` | Token deines Telegram Bots (von [@BotFather](https://t.me/BotFather)) |

### GitHub Actions Secrets

Im Repository unter **Settings → Secrets and variables → Actions** eintragen:

| Secret | Beschreibung |
|--------|-------------|
| `TELEGRAM_BOT_TOKEN` | Gleicher Token wie in Replit |

### config.py anpassen

```python
# Deine Telegram Chat-ID (Gruppe oder Einzelperson)
# Ermitteln via https://t.me/userinfobot
TELEGRAM_CHAT_ID = "-1001234567890"

# Alarm wenn Pegel unter diesen Wert fällt (in cm)
PEGEL_LOW_THRESHOLD_CM = 260

# Alarm nur wenn Änderung mindestens so groß (in cm)
PEGEL_CHANGE_THRESHOLD_CM = 5
```

---

## Telegram Bot einrichten

1. [@BotFather](https://t.me/BotFather) in Telegram öffnen.
2. `/newbot` senden und Anweisungen folgen.
3. Den Bot-Token kopieren und als Secret speichern.
4. Den Bot zu deiner Gruppe hinzufügen (oder direkt anschreiben).
5. Chat-ID ermitteln: [@userinfobot](https://t.me/userinfobot) anschreiben oder den Bot in einer Gruppe nutzen und die Group-ID auslesen.

---

## GitHub Actions

Der Workflow `watcher.yml` läuft automatisch **alle 30 Minuten** und:
1. Installiert Python 3.12 + Abhängigkeiten
2. Führt `watcher.py` aus
3. Committet den aktualisierten Zustand (`seen.json`, `state.json`) zurück ins Repository

### GitHub Actions manuell starten

Im Repository unter **Actions → Reffenthal-Wächter → Run workflow**.

### Mit GitHub synchronisieren

```bash
# Änderungen committen
git add .
git commit -m "feat: Änderung beschreiben"

# Nach GitHub pushen
git push origin main

# Von GitHub holen (z.B. nach Actions-Lauf)
git pull origin main
```

---

## Fehlerbehandlung

Das Programm stürzt **niemals** ab. Fehler in einzelnen Modulen (RSS, Pegel, Telegram) werden geloggt und das Programm läuft weiter.

Beispiel-Log:
```
2025-01-15 08:00:01 [INFO] root: Reffenthal-Wächter gestartet
2025-01-15 08:00:01 [INFO] rss: RSS gestartet: https://www.boote-forum.de/external.php?type=rss2
2025-01-15 08:00:02 [INFO] rss: RSS Einträge: 25
2025-01-15 08:00:02 [INFO] rss: RSS Treffer gesamt: 1
2025-01-15 08:00:03 [INFO] rss: RSS: Gesendet – Reffenthal Einfahrt gesperrt?
2025-01-15 08:00:03 [INFO] pegel: Pegel: 274 cm (2025-01-15T07:45:00+01:00)
2025-01-15 08:00:03 [INFO] telegram: Telegram: Nachricht gesendet (142 Zeichen).
2025-01-15 08:00:03 [INFO] root: Fertig.
```

---

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| `TELEGRAM_BOT_TOKEN nicht gesetzt` | Replit Secret `TELEGRAM_BOT_TOKEN` anlegen |
| `Chat-ID Platzhalter` | In `config.py` echte Chat-ID eintragen |
| Keine Telegram-Nachrichten | Bot muss in der Gruppe Admin-Rechte für Nachrichten haben |
| Pegel-API nicht erreichbar | Kurzer Ausfall des WSV-Servers – wird beim nächsten Lauf wiederholt |
| `feedparser` nicht gefunden | `pip install -r requirements.txt` ausführen |
