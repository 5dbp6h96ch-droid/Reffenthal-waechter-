export type Marina = {
  id: string;
  name: string;
  ort: string;
  lat: number;
  lon: number;
  website?: string;
  details?: string;
};

/**
 * Statischer Marina-Datensatz für die Rhein-Karte im Testsystem.
 *
 * Koordinatenbasis: OpenSeaMap/OpenStreetMap-Daten, gegengeprüft über die
 * Rhein-Gewässerübersicht von NavShip am 21.08.2026. Es werden ausschließlich
 * eindeutig benannte Sportboot-/Yachthäfen und Wassersportanlagen übernommen;
 * unbekannte, industrielle oder als gesperrt markierte Hafenobjekte bleiben
 * bewusst außen vor.
 *
 * Keine Laufzeit-API: Die Karte benötigt für diese Marker keine zusätzlichen
 * Netzwerkaufrufe. Änderungen an diesem Bestand erfolgen zentral in dieser Datei.
 */
export const MARINAS: Marina[] = [
  { id: 'myc-weil', name: 'Motorboot- und Yachtclub Weil am Rhein', ort: 'Weil am Rhein', lat: 47.61377, lon: 7.58037, website: 'https://www.yachtclub-weilamrhein.de/' },
  { id: 'ile-du-rhin', name: "Port de Plaisance de l’Île du Rhin", ort: 'Biesheim / Breisach', lat: 48.02890, lon: 7.57020 },
  { id: 'myc-breisach', name: 'Motorboot- & Yachtclub Breisach', ort: 'Breisach', lat: 48.02874, lon: 7.57646, website: 'https://www.myc-breisach.de/' },
  { id: 'nautic-burkheim', name: 'Nauticclub Burkheim', ort: 'Burkheim', lat: 48.10327, lon: 7.58074, website: 'http://www.nc-burkheim.de' },
  { id: 'myc-weisweil', name: 'Motorboot- und Yachtclub Weisweil', ort: 'Weisweil', lat: 48.21352, lon: 7.65655, website: 'https://www.myc-weisweil.de/', details: 'Vereinseigene Steganlage; Gästeplätze laut Quelldaten vorhanden.' },
  { id: 'vwwc-weisweil', name: 'Vereinigung Weisweiler Wassersportclubs', ort: 'Weisweil', lat: 48.21455, lon: 7.65864, website: 'http://www.vwwc.de/' },
  { id: 'ycl-lahr', name: 'Yachtclub Lahr', ort: 'Schwanau', lat: 48.36473, lon: 7.73659, website: 'https://www.yclr.de/' },
  { id: 'wsc-goldscheuer', name: 'Wassersportclub Goldscheuer', ort: 'Kehl-Goldscheuer', lat: 48.52524, lon: 7.80863, website: 'https://www.wassersportclub-goldscheuer.de/' },
  { id: 'port-strasbourg', name: 'Port de Plaisance de Strasbourg', ort: 'Straßburg', lat: 48.53895, lon: 7.78984 },
  { id: 'nautic-kehl', name: 'Nautic Club Kehl', ort: 'Kehl', lat: 48.57813, lon: 7.80295, website: 'https://www.nautic-club-kehl.de/' },
  { id: 'myc-greffern', name: 'Motor-Yacht-Club Greffern', ort: 'Rheinmünster-Greffern', lat: 48.75600, lon: 8.00219, website: 'https://www.myc-greffern.de/' },
  { id: 'yc-oberrhein-karlsruhe', name: 'Yachtclub Oberrhein Karlsruhe', ort: 'Karlsruhe', lat: 48.97473, lon: 8.25422, website: 'https://www.yachtclub-oberrhein.de/index.html' },
  { id: 'mbc-karlsruhe', name: 'Motorboot-Club Karlsruhe', ort: 'Karlsruhe', lat: 49.03772, lon: 8.30857, website: 'https://www.mbc-karlsruhe.de/' },
  { id: 'segelclub-lingenfeld', name: 'Segelclub Lingenfeld', ort: 'Lingenfeld', lat: 49.24918, lon: 8.39367, website: 'https://www.sclf.de/' },
  { id: 'skc-philippsburg', name: 'Ski- und Kanu-Club Philippsburg', ort: 'Philippsburg', lat: 49.25344, lon: 8.42972, website: 'http://www.skcphilippsburg.de' },
  { id: 'kurpfalz-yachthafen-speyer', name: 'Kurpfalz-Yachthafen Speyer', ort: 'Speyer', lat: 49.32114, lon: 8.44764, website: 'https://www.yachthafen-speyer.de/' },
  { id: 'segelclub-speyer', name: 'Segel-Club Speyer', ort: 'Speyer / Reffenthal', lat: 49.36161, lon: 8.47362, website: 'http://sc-speyer.de/' },
  { id: 'sv-mannheim-reffenthal', name: 'Segler-Vereinigung Mannheim – Stützpunkt Reffenthal', ort: 'Speyer / Reffenthal', lat: 49.36249, lon: 8.47330, website: 'https://www.svmannheim.de/' },
  { id: 'mbc-speyer', name: '1. MBC Speyer', ort: 'Speyer / Reffenthal', lat: 49.36604, lon: 8.47435, website: 'https://www.mbc-speyer.de/' },
  { id: 'vcr-reffenthal', name: 'Marina VCR Campingfreunde Reffenthal', ort: 'Speyer / Reffenthal', lat: 49.36583, lon: 8.48166, website: 'http://www.vcr-reffenthal.de/' },
  { id: 'ycoa-otterstadt', name: 'YCOA Yacht-Club Otterstadt im Angelwald', ort: 'Otterstadt', lat: 49.35974, lon: 8.47530, website: 'http://www.ycoa.de' },
  { id: 'mc-altrip', name: 'Motorboot Club Altrip', ort: 'Altrip', lat: 49.44172, lon: 8.48603, website: 'https://www.mc-altrip.de/' },
  { id: 'mck-mannheim', name: 'MCK Motoryacht-Club Kurpfalz Mannheim', ort: 'Mannheim', lat: 49.41649, lon: 8.50149, website: 'http://www.mck-mannheim.com' },
  { id: 'sbc-ludwigshafen', name: 'Sportboot-Club Ludwigshafen/Rhein', ort: 'Ludwigshafen', lat: 49.44103, lon: 8.45079, website: 'https://www.sbc-ludwigshafen.de/' },
  { id: 'mcp-ludwigshafen', name: 'Motorboot-Club-Pfalz Ludwigshafen', ort: 'Ludwigshafen', lat: 49.44235, lon: 8.45257, website: 'https://www.mcp-ludwigshafen.org/' },
  { id: 'mycl-ludwigshafen', name: 'Motor-Yacht-Club Ludwigshafen', ort: 'Ludwigshafen', lat: 49.44042, lon: 8.45150, website: 'https://www.mycl.de/' },
  { id: 'myc-worms', name: 'Motor-Yacht-Club Worms', ort: 'Worms', lat: 49.62079, lon: 8.38412 },
  { id: 'eicher-see', name: 'Sportboothafen Eicher See', ort: 'Eich', lat: 49.76200, lon: 8.43879 },
  { id: 'oppenheim', name: 'Sportboothafen Oppenheim', ort: 'Oppenheim', lat: 49.85957, lon: 8.35834 },
  { id: 'ginsheim', name: 'Yachthafen Ginsheim', ort: 'Ginsheim-Gustavsburg', lat: 49.96262, lon: 8.34464 },
  { id: 'yachtclub-mainz', name: 'Yacht Club Mainz – Winterhafen', ort: 'Mainz', lat: 49.99315, lon: 8.28615 },
  { id: 'marina-zollhafen', name: 'Marina Zollhafen', ort: 'Mainz', lat: 50.01480, lon: 8.25894, website: 'https://www.marina-zollhafen.de/' },
  { id: 'mittelheim-winkler-bucht', name: 'Sportboothafen Mittelheim / Winkler Bucht', ort: 'Oestrich-Winkel', lat: 49.99710, lon: 8.01042 },
  { id: 'ruedesheimer-yc', name: 'Rüdesheimer Yacht Club', ort: 'Rüdesheim', lat: 49.97918, lon: 7.94525, website: 'http://rued-yc.de/' },
  { id: 'myc-bingen', name: 'Motor-Yacht-Club Bingen', ort: 'Bingen', lat: 49.97064, lon: 7.91960, website: 'https://www.myc-bingen.de/' },
  { id: 'loreleyhafen', name: 'Loreleyhafen', ort: 'St. Goarshausen', lat: 50.14394, lon: 7.72751 },
  { id: 'stadthafen-st-goar', name: 'Stadthafen St. Goar', ort: 'St. Goar', lat: 50.15476, lon: 7.70765 },
  { id: 'yc-st-goar', name: 'Yachtclub St. Goar', ort: 'St. Goar', lat: 50.16606, lon: 7.69656, website: 'https://www.yachtclubstgoar.de/' },
  { id: 'yc-vallendar', name: 'Yachtclub Vallendar', ort: 'Vallendar', lat: 50.39562, lon: 7.61458 },
  { id: 'yachthafen-oberwinter', name: 'Yachthafen Oberwinter', ort: 'Remagen-Oberwinter', lat: 50.61816, lon: 7.20900, website: 'http://www.yachthafenoberwinter.de' },
  { id: 'bonner-yc', name: 'Bonner Yacht-Club', ort: 'Bonn', lat: 50.62055, lon: 7.20835 },
  { id: 'wsv-honnef', name: 'Wassersportverein Honnef', ort: 'Bad Honnef', lat: 50.64407, lon: 7.21563, website: 'https://wsvhonnef.de/' },
  { id: 'mondorfer-yc', name: 'Mondorfer Yacht Club', ort: 'Niederkassel-Mondorf', lat: 50.77176, lon: 7.07678, website: 'http://www.myc-mondorf.de', details: 'Gastliegeplätze sowie Strom, Wasser und WC laut Quelldaten.' },
  { id: 'ryc-mondorf', name: 'Rhein Yacht Club', ort: 'Niederkassel-Mondorf', lat: 50.77188, lon: 7.07755, website: 'https://ryc-mondorf.de/', details: 'Gastliegeplätze sowie Wasser, Strom, WC und Dusche laut Quelldaten.' },
  { id: 'rheinau-koeln', name: 'Rheinau Sporthafen Köln', ort: 'Köln', lat: 50.92756, lon: 6.96460, website: 'http://www.rheinau-sporthafen.de/' },
  { id: 'yclh-hitdorf', name: 'Yacht-Club Leverkusen Hitdorf', ort: 'Leverkusen-Hitdorf', lat: 51.05998, lon: 6.91383, website: 'https://www.yclh.de/', details: 'Strom, Wasser, WC, Dusche und Abfall laut Quelldaten.' },
  { id: 'sporthafen-neuss', name: 'Sporthafen Neuss', ort: 'Neuss', lat: 51.18506, lon: 6.72836 },
  { id: 'marina-duesseldorf', name: 'Yachthafen Düsseldorf', ort: 'Düsseldorf', lat: 51.24963, lon: 6.75808, website: 'https://www.marina-duesseldorf.de/' },
  { id: 'paradieshafen-loerick', name: 'Paradieshafen Lörick', ort: 'Düsseldorf-Lörick', lat: 51.25234, lon: 6.73051 },
  { id: 'ruhrorter-yc', name: 'Ruhrorter Yachtclub', ort: 'Duisburg-Ruhrort', lat: 51.45753, lon: 6.72922, website: 'https://www.ruhrorter-yachtclub.de/' },
  { id: 'yc-wesel', name: 'Yacht Club Wesel', ort: 'Wesel', lat: 51.66183, lon: 6.58780, website: 'http://www.yc-wesel.de/' },
  { id: 'wsc-rees', name: 'Wassersport-Club Rees', ort: 'Rees', lat: 51.76739, lon: 6.34638, website: 'https://www.wsc-rees.de/' },
  { id: 'ryc-rees', name: 'Rheinberger Yacht Club 1971', ort: 'Rees', lat: 51.76711, lon: 6.34838, website: 'http://www.rycrees.de' },
];
