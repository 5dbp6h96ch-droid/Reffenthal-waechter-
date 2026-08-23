# R(h)einschiffer – verbindliche Umgebungszuordnung

## TEST – einzige gültige aktuelle Testumgebung

- URL: `https://rheinschiffer-test.5dbp6h96ch.workers.dev/`
- Cloudflare-Zieltyp: **Worker**
- Worker-Name: `rheinschiffer-test`
- GitHub-Arbeitsbranch: `test`
- bestätigte gute Worker-Version: `57cd69f3-d291-465f-b451-dbd8b4e46c88`
- Cloudflare-Alias dieser Version: `clickfix`
- vom Nutzer visuell als richtige neue Testoberfläche bestätigt: **ja, 2026-08-23**
- Worker-Ursprung: Wrangler-Version-Upload mit `fetch` + `scheduled`, Static Assets, D1 und weiteren Bindings
- Quellpfad im Repository: **noch nicht vollständig rekonstruiert**

### Verbindliche Schutzregeln

1. `rheinschiffer-test.5dbp6h96ch.workers.dev` darf niemals aus dem alten Expo/Cloudflare-Pages-Deploypfad überschrieben werden.
2. Vor jedem Worker-Deploy muss die aktuell aktive Worker-Version geprüft und als Rollback-Version festgehalten werden.
3. Solange der Quellpfad der bestätigten guten Version `57cd69f3-d291-465f-b451-dbd8b4e46c88` nicht reproduzierbar rekonstruiert ist, sind automatische Worker-Deployments gesperrt.
4. Push-Änderungen werden erst in den rekonstruierten Worker-Quellpfad übernommen und danach ausschließlich im Testsystem geprüft.
5. Produktion wird durch Arbeiten am Testsystem niemals verändert.
6. Bestehender fachlicher Rollback-Punkt vor der Push-Weiterentwicklung: `backup/after-marina-map-complete-2026-08-21`.

## NICHT als aktuelle Testumgebung verwenden

Ein Cloudflare-Pages-Projekt oder ein daraus erzeugter Expo-Web-Build mit dem Namen `rheinschiffer-test` ist **nicht** automatisch identisch mit der oben genannten Worker-Testumgebung. Der Name allein ist kein gültiges Zuordnungskriterium.

## Pflichtprüfung vor Änderungen

Vor jeder Umsetzung zuerst prüfen:

- exakte URL,
- Zieltyp Worker/Pages,
- aktive Worker-Version,
- erwartete Oberfläche,
- Quellpfad,
- Rollback-Version.

Erst wenn diese Punkte zusammenpassen, darf deployed werden.
