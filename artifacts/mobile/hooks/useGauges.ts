/**
 * useGauges.ts – Pegelorte aus Supabase laden
 *
 * Liest alle aktiven Einträge aus public.gauges.
 * Aktuell vorhanden: speyer, mannheim, worms.
 *
 * Wenn Supabase nicht konfiguriert ist, gibt der Hook eine leere Liste
 * zurück (kein Absturz – Pegelort-Auswahl ist dann nicht sichtbar).
 *
 * Verwendung:
 *   const { gauges, loading, error } = useGauges();
 *   const selected = useSelectedGauge(gaugeId);
 */

import { useState, useEffect } from 'react';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';
import type { Gauge } from '@/app/types/database';

export interface UseGaugesResult {
  gauges: Gauge[];
  loading: boolean;
  error: string | null;
}

export function useGauges(): UseGaugesResult {
  const [gauges, setGauges] = useState<Gauge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Ohne Supabase-Konfiguration: leere Liste, kein Netzwerkaufruf
    if (!supabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    // Lokale Referenz nach dem Guard – TypeScript kann non-null in async-Closures
    // nicht durch das Modul-Variable-Narrowing oben sicherstellen.
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
    // Ohne Supabase-Konfiguration: kein Netzwerkaufruf
    if (!supabaseConfigured || !supabase) {
      return;
    }
    const client = supabase; // non-null nach Guard (für async-Closure)
    setLoading(true);
    (async () => {
      try {
        const { data, error: fetchError } = await client
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
