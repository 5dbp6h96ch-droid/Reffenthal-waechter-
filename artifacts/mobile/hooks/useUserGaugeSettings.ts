/**
 * useUserGaugeSettings.ts – Persönliche Pegelschwellen pro Nutzer und Pegel
 *
 * Liest und schreibt Einträge aus public.user_gauge_settings.
 * Jede Zeile verknüpft einen Nutzer (user_id) mit einem Pegel (gauge_id)
 * und speichert: alert_enabled, alert_threshold_cm.
 *
 * RLS-Policies sichern, dass der Nutzer ausschließlich seine eigenen
 * Einträge lesen und verändern kann.
 *
 * Wenn Supabase nicht konfiguriert ist oder kein Nutzer angemeldet ist,
 * gibt der Hook eine leere Liste zurück – kein Absturz.
 *
 * Verwendung:
 *   const { getGaugeSetting, updateGaugeSetting } = useUserGaugeSettings(userId);
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';
import type { UserGaugeSetting, UserGaugeSettingUpdate } from '@/app/types/database';

export interface UseUserGaugeSettingsResult {
  /** Alle persönlichen Pegeleinstellungen des Nutzers */
  settings: UserGaugeSetting[];
  loading: boolean;
  error: string | null;
  /** Einstellung für einen bestimmten Pegel (null wenn noch nicht gespeichert) */
  getGaugeSetting: (gaugeId: string) => UserGaugeSetting | null;
  /** Upsert: legt an oder aktualisiert die Einstellung für einen Pegel */
  updateGaugeSetting: (
    gaugeId: string,
    update: UserGaugeSettingUpdate,
  ) => Promise<{ error: string | null }>;
  refetch: () => void;
}

export function useUserGaugeSettings(
  userId: string | null | undefined,
): UseUserGaugeSettingsResult {
  const [settings, setSettings] = useState<UserGaugeSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId || !supabaseConfigured || !supabase) {
      setSettings([]);
      return;
    }
    const client = supabase; // non-null nach Guard (für async-Closures)
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await client
      .from('user_gauge_settings')
      .select('*')
      .eq('user_id', userId);
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setSettings(data ?? []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const getGaugeSetting = useCallback(
    (gaugeId: string): UserGaugeSetting | null =>
      settings.find((s) => s.gauge_id === gaugeId) ?? null,
    [settings],
  );

  const updateGaugeSetting = useCallback(
    async (
      gaugeId: string,
      update: UserGaugeSettingUpdate,
    ): Promise<{ error: string | null }> => {
      if (!userId) return { error: 'Kein Nutzer angemeldet' };
      if (!supabaseConfigured || !supabase) {
        return { error: 'Supabase nicht konfiguriert' };
      }
      const client = supabase;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        user_id: userId,
        gauge_id: gaugeId,
        ...update,
        updated_at: new Date().toISOString(),
      };

      const { data, error: upsertError } = await (client
        .from('user_gauge_settings')
        .upsert(payload, { onConflict: 'user_id,gauge_id' })
        .select()
        .single() as unknown as Promise<{
        data: UserGaugeSetting | null;
        error: { message: string } | null;
      }>);

      if (upsertError) {
        return { error: upsertError.message };
      }

      if (data) {
        setSettings((prev) => {
          const idx = prev.findIndex((s) => s.gauge_id === gaugeId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = data;
            return next;
          }
          return [...prev, data];
        });
      }

      return { error: null };
    },
    [userId],
  );

  return {
    settings,
    loading,
    error,
    getGaugeSetting,
    updateGaugeSetting,
    refetch: () => void fetchAll(),
  };
}
