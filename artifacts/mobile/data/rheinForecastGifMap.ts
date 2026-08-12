export type RheinForecastGifEntry = {
  name: string;
  hvzId: string | null;
  forecastType: 'water-level' | 'discharge-only' | 'none' | 'unknown';
  gifUrl: string | null;
};

const gif = (id: string) => `https://www.hvz.baden-wuerttemberg.de/gifs/${id}-2001.GIF`;

/**
 * Feste Zuordnung der Rheinpegel in Flussrichtung.
 * Niemals ueber Pegelnamen aufloesen und niemals auf einen anderen Pegel fallen.
 *
 * IDs/Forecast-Typen sind nur dort eingetragen, wo sie aus der HVZ-Seite bzw.
 * der HVZ-Vorhersagenliste verifiziert wurden. Unbekannte IDs bleiben null.
 */
export const RHEIN_FORECAST_GIF_MAP: RheinForecastGifEntry[] = [
  { name: 'Basel Rheinhalle', hvzId: '09012', forecastType: 'discharge-only', gifUrl: null },
  { name: 'Rheinweiler', hvzId: '09013', forecastType: 'unknown', gifUrl: null },
  { name: 'Hartheim', hvzId: '09135', forecastType: 'none', gifUrl: null },
  { name: 'KW Breisach', hvzId: '09030', forecastType: 'discharge-only', gifUrl: null },
  { name: 'Breisach', hvzId: '09029', forecastType: 'water-level', gifUrl: gif('09029') },
  { name: 'Kappel', hvzId: '09066', forecastType: 'unknown', gifUrl: null },
  { name: 'Ottenheim', hvzId: '09141', forecastType: 'unknown', gifUrl: null },
  { name: 'Altenheim', hvzId: null, forecastType: 'unknown', gifUrl: null },
  { name: 'Kehl-Kronenhof', hvzId: '09014', forecastType: 'discharge-only', gifUrl: null },
  { name: 'Iffezheim', hvzId: '09137', forecastType: 'water-level', gifUrl: gif('09137') },
  { name: 'Plittersdorf', hvzId: null, forecastType: 'unknown', gifUrl: null },
  { name: 'Lauterbourg', hvzId: '09000', forecastType: 'none', gifUrl: null },
  { name: 'Maxau', hvzId: '09016', forecastType: 'water-level', gifUrl: gif('09016') },
  { name: 'Philippsburg', hvzId: null, forecastType: 'unknown', gifUrl: null },
  { name: 'Speyer', hvzId: '09017', forecastType: 'water-level', gifUrl: gif('09017') },
  { name: 'Mannheim', hvzId: '09001', forecastType: 'water-level', gifUrl: gif('09001') },
  { name: 'Worms', hvzId: '09018', forecastType: 'water-level', gifUrl: gif('09018') },
];

export function getRheinForecastGif(hvzId: string | null): string | null {
  if (!hvzId) return null;
  return RHEIN_FORECAST_GIF_MAP.find((entry) => entry.hvzId === hvzId)?.gifUrl ?? null;
}
