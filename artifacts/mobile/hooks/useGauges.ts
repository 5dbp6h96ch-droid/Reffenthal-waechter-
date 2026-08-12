/**
 * useGauges.ts – Rhein-Pegel direkt aus PEGELONLINE laden.
 * PEGELONLINE ist die Stammdatenquelle; Supabase dient nur für lokale
 * Nutzerpräferenzen und Warnschwellen.
 */

import { useState, useEffect } from 'react';
import type { Gauge } from '@/app/types/database';

const PEGELONLINE_URL = 'https://pegelonline.wsv.de/webservices/rest-api/v2/stations.json?waters=RHEIN&includeTimeseries=true&includeForecastTimeseries=true';

// TEST fallback: keep the currently supported Rhein forecast stations available
// even when PEGELONLINE is temporarily unreachable. IDs are PEGELONLINE UUIDs.
const TEST_GAUGE_FALLBACK: Gauge[] = [
  { id: 'b6c6d5c8-e2d5-4469-8dd8-fa972ef7eaea', name: 'Maxau', river: 'Rhein', river_km: 362.327, pegel_nr: '23700200', pegel_uuid: 'b6c6d5c8-e2d5-4469-8dd8-fa972ef7eaea', active: true, created_at: '2026-08-11T00:00:00.000Z' },
  { id: '2cb8ae5b-c5c9-4fa8-bac0-bb724f2754f4', name: 'Speyer', river: 'Rhein', river_km: 400.61, pegel_nr: 'SPEYER', pegel_uuid: '2cb8ae5b-c5c9-4fa8-bac0-bb724f2754f4', active: true, created_at: '2026-08-11T00:00:00.000Z' },
  { id: '57090802-c51a-4d09-8340-b4453cd0e1f5', name: 'Mannheim', river: 'Rhein', river_km: 424.73, pegel_nr: 'MANNHEIM', pegel_uuid: '57090802-c51a-4d09-8340-b4453cd0e1f5', active: true, created_at: '2026-08-11T00:00:00.000Z' },
  { id: '844a620f-f3b8-4b6b-8e3c-783ae2aa232a', name: 'Worms', river: 'Rhein', river_km: 443.37, pegel_nr: 'WORMS', pegel_uuid: '844a620f-f3b8-4b6b-8e3c-783ae2aa232a', active: true, created_at: '2026-08-11T00:00:00.000Z' },
];

type PegelOnlineStation = {
  uuid: string;
  number?: string;
  shortname?: string;
  longname?: string;
  km?: number;
  water?: { shortname?: string; longname?: string };
  timeseries?: Array<{ shortname?: string; name?: string; unit?: string }>;
};

function mapStation(s: PegelOnlineStation): Gauge | null {
  if (!s.uuid || !s.shortname) return null;
  const hasWaterLevel = (s.timeseries ?? []).some(t => t.shortname === 'W');
  if (!hasWaterLevel) return null;
  return {
    id: s.uuid,
    name: s.shortname,
    river: 'Rhein',
    river_km: typeof s.km === 'number' ? s.km : null,
    // PEGELONLINE UUID is the only stable station key used by the app.
    pegel_nr: s.number ?? s.shortname,
    pegel_uuid: s.uuid,
    active: true,
    created_at: new Date().toISOString(),
  };
}

export interface UseGaugesResult { gauges: Gauge[]; loading: boolean; error: string | null; }

export function useGauges(): UseGaugesResult {
  const [gauges, setGauges] = useState<Gauge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(PEGELONLINE_URL, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`PEGELONLINE HTTP ${response.status}`);
        const stations = await response.json() as PegelOnlineStation[];
        const mapped = stations.map(mapStation).filter((g): g is Gauge => g !== null).sort((a, b) => (a.river_km ?? 0) - (b.river_km ?? 0));
        if (!mapped.length) throw new Error('Keine Rheinpegel mit Wasserstandszeitreihe gefunden');
        if (!cancelled) { setGauges(mapped); setError(null); }
      } catch (e) {
        if (!cancelled) { setGauges(TEST_GAUGE_FALLBACK); setError(e instanceof Error ? e.message : 'PEGELONLINE nicht erreichbar'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return { gauges, loading, error };
}

export function useSelectedGauge(gaugeId: string | null | undefined): { gauge: Gauge | null; loading: boolean; error: string | null } {
  const { gauges, loading, error } = useGauges();
  return { gauge: gauges.find(g => g.id === gaugeId) ?? null, loading, error };
}
