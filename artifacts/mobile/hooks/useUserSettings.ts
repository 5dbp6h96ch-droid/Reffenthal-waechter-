/**
 * useUserSettings.ts – Lesen und Schreiben von user_settings in Supabase
 *
 * Die zuletzt gewählte Pegel-ID wird lokal gespiegelt. Supabase bleibt jedoch
 * die Quelle für alle übrigen Felder (insbesondere push_enabled).
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';
import type { UserSettings, UserSettingsUpdate } from '@/app/types/database';

export interface UseUserSettingsResult {
  settings: UserSettings | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  updateSettings: (update: UserSettingsUpdate) => Promise<{ error: string | null }>;
  refetch: () => void;
}

const LOCAL_SELECTED_GAUGE_KEY = 'test_selected_gauge_id';

export function useUserSettings(userId: string | null | undefined): UseUserSettingsResult {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readLocalSelectedGauge = useCallback(async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(LOCAL_SELECTED_GAUGE_KEY);
    } catch {
      return null;
    }
  }, []);

  const writeLocalSelectedGauge = useCallback(async (gaugeId: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(LOCAL_SELECTED_GAUGE_KEY, gaugeId);
    } catch {
      // Der Server-Write bleibt maßgeblich; lokaler Cache ist nur Komfort.
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoaded(false);

    if (!userId) {
      setSettings(null);
      setLoaded(true);
      return;
    }

    if (!supabaseConfigured || !supabase) {
      setSettings(null);
      setError('Supabase nicht konfiguriert');
      setLoaded(true);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      setError(fetchError.message);
      setSettings(null);
      setLoading(false);
      setLoaded(true);
      return;
    }

    let resolved = data ?? null;
    const localGaugeId = await readLocalSelectedGauge();

    // Reparatur für ältere Test-Builds: Sie konnten die Auswahl nur lokal
    // speichern. Wenn lokale und serverseitige Auswahl auseinanderlaufen,
    // synchronisieren wir ausschließlich selected_gauge_id zum Server.
    // Andere Serverfelder wie push_enabled werden dabei niemals überschrieben.
    if (localGaugeId && localGaugeId !== data?.selected_gauge_id) {
      const payload = {
        user_id: userId,
        selected_gauge_id: localGaugeId,
        updated_at: new Date().toISOString(),
      };
      const { data: repaired, error: repairError } = await (supabase
        .from('user_settings')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single() as unknown as Promise<{ data: UserSettings | null; error: { message: string } | null }>);

      if (repairError) {
        setError(repairError.message);
      } else if (repaired) {
        resolved = repaired;
      }
    } else if (data?.selected_gauge_id) {
      await writeLocalSelectedGauge(data.selected_gauge_id);
    }

    setSettings(resolved);
    setLoading(false);
    setLoaded(true);
  }, [userId, readLocalSelectedGauge, writeLocalSelectedGauge]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (update: UserSettingsUpdate) => {
    if (!userId) return { error: 'Kein Nutzer angemeldet' };
    if (!supabaseConfigured || !supabase) return { error: 'Supabase nicht konfiguriert' };

    const payload = {
      ...update,
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    const { data, error: upsertError } = await (supabase
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single() as unknown as Promise<{ data: UserSettings | null; error: { message: string } | null }>);

    if (upsertError) {
      setError(upsertError.message);
      return { error: upsertError.message };
    }

    if (update.selected_gauge_id) {
      await writeLocalSelectedGauge(update.selected_gauge_id);
    }

    setSettings(data);
    setError(null);
    return { error: null };
  }, [userId, writeLocalSelectedGauge]);

  return {
    settings,
    loading,
    loaded,
    error,
    updateSettings,
    refetch: () => void fetchSettings(),
  };
}
