/**
 * useGauges.ts – Pegelorte aus Supabase laden
 *
 * Liest alle aktiven Einträge aus public.gauges.
 * Aktuell vorhanden: speyer, mannheim, worms.
 *
 * Verwendung:
 *   const { gauges, loading, error } = useGauges();
 *   const selected = useSelectedGauge(gaugeId);
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/app/utils/supabase';
import type { Gauge } from '@/app/types/database';

export interface UseGaugesResult {
  gauges: Gauge[];
  loading: boolean;
  error: string | null;
}

export function useGauges(): UseGaugesResult {
  const [gauges, setGauges] = useState<Gauge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGauges = async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('gauges')
        .select('*')
        .eq('active', true)
        .order('river_km', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setGauges(data ?? []);
      }
      setLoading(false);
    };

    void fetchGauges();
  }, []);

  return { gauges, loading, error };
}

/**
 * Einzelnen Gauge nach ID aus Supabase laden.
 */
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
    setLoading(true);
    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('gauges')
          .select('*')
          .eq('id', gaugeId)
          .single();
        if (fetchError) setError(fetchError.message);
        else setGauge(data);
      } catch {
        // Netzwerkfehler o.ä.
      } finally {
        setLoading(false);
      }
    })();
  }, [gaugeId]);

  return { gauge, loading, error };
}
