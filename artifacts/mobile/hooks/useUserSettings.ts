/**
 * useUserSettings.ts – Lesen und Schreiben von user_settings in Supabase
 *
 * Im TEST-Build wird die Auswahl zusätzlich lokal gespiegelt. Dadurch bleibt
 * die Pegelauswahl nach einem Reload erhalten, auch wenn das Test-Supabase-
 * Schema user_settings noch nicht bereitstellt.
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';
import type { UserSettings, UserSettingsUpdate } from '@/app/types/database';

export interface UseUserSettingsResult {
  settings: UserSettings | null;
  loading: boolean;
  /** true, sobald der erste Ladeversuch abgeschlossen ist (Erfolg, Fehler oder kein User). */
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

  const readLocalSettings = useCallback(async (id: string) => {
    try {
      const selectedGaugeId = await AsyncStorage.getItem(LOCAL_SELECTED_GAUGE_KEY);
      if (!selectedGaugeId) return null;
      return {
        user_id: id,
        selected_gauge_id: selectedGaugeId,
        location_enabled: false,
        latitude: null,
        longitude: null,
        weather_enabled: false,
        push_enabled: false,
        created_at: new Date(0).toISOString(),
        updated_at: new Date().toISOString(),
      } satisfies UserSettings;
    } catch {
      return null;
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    // loaded zurücksetzen, damit Konsumenten den neuen Ladevorgang erkennen.
    setLoaded(false);

    if (!userId) {
      setSettings(null);
      setLoaded(true); // Kein User → sofort fertig; kein Gauge zu laden.
      return;
    }
    if (!supabaseConfigured || !supabase) {
      setSettings(await readLocalSettings(userId));
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
      setSettings(await readLocalSettings(userId));
    } else {
      setSettings(data ?? await readLocalSettings(userId));
    }
    setLoading(false);
    setLoaded(true);
  }, [userId, readLocalSettings]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (update: UserSettingsUpdate) => {
    if (!userId) return { error: 'Kein Nutzer angemeldet' };
    if (update.selected_gauge_id) {
      try {
        await AsyncStorage.setItem(LOCAL_SELECTED_GAUGE_KEY, update.selected_gauge_id);
      } catch {
        // Lokaler Fallback darf den eigentlichen Auswahlvorgang nicht blockieren.
      }
    }
    if (!supabaseConfigured || !supabase) return { error: null };

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
      const local = await readLocalSettings(userId);
      setSettings(local);
      return { error: upsertError.message };
    }
    setSettings(data);
    return { error: null };
  }, [userId, readLocalSettings]);

  return {
    settings,
    loading,
    loaded,
    error,
    updateSettings,
    refetch: () => void fetchSettings(),
  };
}
