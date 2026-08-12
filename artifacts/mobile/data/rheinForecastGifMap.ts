export type RheinForecastGifEntry = {
  name: string;
  pegelUuid: string | null;
  hvzId: string | null;
  forecastType: 'water-level' | 'discharge-only' | 'none' | 'unknown';
  gifUrl: string | null;
};

const gif = (id: string) => `https://www.hvz.baden-wuerttemberg.de/gifs/${id}-2001.GIF`;

/**
 * Feste Zuordnung der Rheinpegel in Flussrichtung.
 * Die App loest die Vorhersage ausschliesslich ueber die eindeutige
 * PEGELONLINE-UUID auf. Pegelnamen werden NICHT zur Auswahl verwendet.
 *
 * Eine GIF-URL wird nur gesetzt, wenn die HVZ-Wasserstands-Vorhersage
 * fuer den Pegel verifiziert ist. Unbekannte UUIDs bleiben null.
 */
export const RHEIN_FORECAST_GIF_MAP: RheinForecastGifEntry[] = [
  { name: 'Basel Rheinhalle', pegelUuid: null, hvzId: '09012', forecastType: 'discharge-only', gifUrl: null },
  { name: 'Rheinweiler', pegelUuid: null, hvzId: '09013', forecastType: 'unknown', gifUrl: null },
  { name: 'Hartheim', pegelUuid: null, hvzId: '09135', forecastType: 'none', gifUrl: null },
  { name: 'KW Breisach', pegelUuid: null, hvzId: '09030', forecastType: 'discharge-only', gifUrl: null },
  { name: 'Breisach', pegelUuid: '9da1ad2b-88db-4cbb-8132-eddfab07d5ba', hvzId: '09029', forecastType: 'water-level', gifUrl: gif('09029') },
  { name: 'Kappel', pegelUuid: null, hvzId: '09066', forecastType: 'unknown', gifUrl: null },
  { name: 'Ottenheim', pegelUuid: null, hvzId: '09141', forecastType: 'unknown', gifUrl: null },
  { name: 'Altenheim', pegelUuid: null, hvzId: null, forecastType: 'unknown', gifUrl: null },
  { name: 'Kehl-Kronenhof', pegelUuid: null, hvzId: '09014', forecastType: 'discharge-only', gifUrl: null },
  { name: 'Iffezheim', pegelUuid: null, hvzId: '09137', forecastType: 'water-level', gifUrl: gif('09137') },
  { name: 'Plittersdorf', pegelUuid: '6b774802-fcb5-49ae-8ecb-ecaf1a278b1c', hvzId: null, forecastType: 'unknown', gifUrl: null },
  { name: 'Lauterbourg', pegelUuid: null, hvzId: '09000', forecastType: 'none', gifUrl: null },
  { name: 'Maxau', pegelUuid: 'b6c6d5c8-e2d5-4469-8dd8-fa972ef7eaea', hvzId: '09016', forecastType: 'water-level', gifUrl: gif('09016') },
  { name: 'Philippsburg', pegelUuid: '88e972e1-88a0-4eb9-847c-0925e5999a46', hvzId: null, forecastType: 'unknown', gifUrl: null },
  { name: 'Speyer', pegelUuid: '2cb8ae5b-c5c9-4fa8-bac0-bb724f2754f4', hvzId: '09017', forecastType: 'water-level', gifUrl: gif('09017') },
  { name: 'Mannheim', pegelUuid: '57090802-c51a-4d09-8340-b4453cd0e1f5', hvzId: '09001', forecastType: 'water-level', gifUrl: gif('09001') },
  { name: 'Worms', pegelUuid: '844a620f-f3b8-4b6b-8e3c-783ae2aa232a', hvzId: '09018', forecastType: 'water-level', gifUrl: gif('09018') },
];

export function getRheinForecastGif(pegelUuid: string | null): string | null {
  if (!pegelUuid) return null;
  return RHEIN_FORECAST_GIF_MAP.find((entry) => entry.pegelUuid === pegelUuid)?.gifUrl ?? null;
}
