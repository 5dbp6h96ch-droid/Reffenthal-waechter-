/**
 * useGauges.ts – Pegelorte aus Supabase laden
 *
 * Liest alle aktiven Einträge aus public.gauges.
 * Im TEST-Build gibt es zusätzlich einen sicheren Fallback mit den drei
 * vorgesehenen Pegeln, damit die Testwelt auch dann funktionsfähig bleibt,
 * wenn das Test-Supabase-Schema noch keine gauges-Tabelle enthält.
 */

import { useState, useEffect } from 'react';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';
import type { Gauge } from '@/app/types/database';

export interface UseGaugesResult {
  gauges: Gauge[];
  loading: boolean;
  error: string | null;
}

const TEST_GAUGE_FALLBACK: Gauge[] = [
  {
    id: '2cb8ae5b-c5c9-4fa8-bac0-bb724f2754f4',
    name: 'Speyer',
    river: 'Rhein',
    river_km: 400.61,
    pegel_nr: 'SPEYER',
    pegel_uuid: '2cb8ae5b-c5c9-4fa8-bac0-bb724f2754f4',
    active: true,
    created_at: '2026-08-11T00:00:00.000Z',
  },
  {
    id: '57090802-c51a-4d09-8340-b4453cd0e1f5',
    name: 'Mannheim',
    river: 'Rhein',
    river_km: 424.73,
    pegel_nr: 'MANNHEIM',
    pegel_uuid: '57090802-c51a-4d09-8340-b4453cd0e1f5',
    active: true,
    created_at: '2026-08-11T00:00:00.000Z',
  },
  {
    id: '844a620f-f3b8-4b6b-8e3c-783ae2aa232a',
    name: 'Worms',
    river: 'Rhein',
    river_km: 443.37,
    pegel_nr: 'WORMS',
    pegel_uuid: '844a620f-f3b8-4b6b-8e3c-783ae2aa232a',
    active: true,
    created_at: '2026-08-11T00:00:00.000Z',
  },
];

export function useGauges(): UseGaugesResult {
  const [gauges, setGauges] = useState<Gauge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setGauges(TEST_GAUGE_FALLBACK);
      setLoading(false);
      return;
    }

    const client = supabase;

    const fetchGauges = async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await client
        .from('gauges')
        .select('*')
        .eq('active', true)
        .order('river_km', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
        setGauges(TEST_GAUGE_FALLBACK);
      } else {
        setGauges(data && data.length > 0 ? data : TEST_GAUGE_FALLBACK);
      }
      setLoading(false);
    };

    void fetchGauges();
  }, []);

  return { gauges, loading, error };
}

export function useSelectedGauge(gaugeId: string | null | undefined): {
  gauge: Gauge | null;
  loading: boolean;
  error: string | null;
} {
  const [gauge, setGauge] = useState<Gauge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gaugeId) {
      setGauge(null);
      return;
    }

    if (!supabaseConfigured || !supabase) {
      setGauge(TEST_GAUGE_FALLBACK.find((g) => g.id === gaugeId) ?? null);
      return;
    }

    const client = supabase;
    setLoading(true);
    (async () => {
      try {
        const { data, error: fetchError } = await client
          .from('gauges')
          .select('*')
          .eq('id', gaugeId)
          .single();
        if (fetchError) {
          setError(fetchError.message);
          setGauge(TEST_GAUGE_FALLBACK.find((g) => g.id === gaugeId) ?? null);
        } else setGauge(data);
      } catch {
        setGauge(TEST_GAUGE_FALLBACK.find((g) => g.id === gaugeId) ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [gaugeId]);

  return { gauge, loading, error };
}
