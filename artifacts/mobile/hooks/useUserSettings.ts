/**
 * useUserSettings.ts – Lesen und Schreiben von user_settings in Supabase
 *
 * Die zuletzt gewählte Pegel-ID wird lokal gespiegelt und beim Laden
 * vorrangig verwendet. Dadurch bleibt die Auswahl auch nach einem
 * Reload/App-Neustart erhalten und wird mit dem Test-Backend synchronisiert.
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

  const readLocalSelectedGauge = useCallback(async () => {
    try {
      return await AsyncStorage.getItem(LOCAL_SELECTED_GAUGE_KEY);
    } catch {
      return null;
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoaded(false);

    if (!userId) {
      setSettings(null);
      setLoaded(true);
      return;
    }

    const localSelectedGaugeId = await readLocalSelectedGauge();

    if (!supabaseConfigured || !supabase) {
      setSettings(localSelectedGaugeId ? {
        user_id: userId,
        selected_gauge_id: localSelectedGaugeId,
        location_enabled: false,
        latitude: null,
        longitude: null,
        weather_enabled: false,
        push_enabled: false,
        created_at: new Date(0).toISOString(),
        updated_at: new Date().toISOString(),
      } : null);
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
    } else {
      const effectiveSelectedGaugeId = localSelectedGaugeId ?? data?.selected_gauge_id ?? null;
      const merged: UserSettings = data ? {
        ...data,
        selected_gauge_id: effectiveSelectedGaugeId,
      } : {
        user_id: userId,
        selected_gauge_id: effectiveSelectedGaugeId,
        location_enabled: false,
        latitude: null,
        longitude: null,
        weather_enabled: false,
        push_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setSettings(merged);

      // Eine ältere lokal gespeicherte Pegelauswahl wird einmalig auf den
      // Server gespiegelt. Damit kann die Push-Edge-Function exakt nach dem
      // aktuell gewählten Pegel filtern.
      if (localSelectedGaugeId && data?.selected_gauge_id !== localSelectedGaugeId) {
        const { error: syncError } = await supabase.from('user_settings').upsert({
          user_id: userId,
          selected_gauge_id: localSelectedGaugeId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (syncError) setError(syncError.message);
      }
    }
    setLoading(false);
    setLoaded(true);
  }, [userId, readLocalSelectedGauge]);

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

    if (!supabaseConfigured || !supabase) {
      setSettings(prev => prev ? { ...prev, ...update, updated_at: new Date().toISOString() } : prev);
      return { error: null };
    }

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
      return { error: upsertError.message };
    }

    const localSelectedGaugeId = await readLocalSelectedGauge();
    setSettings(data ? {
      ...data,
      selected_gauge_id: localSelectedGaugeId ?? data.selected_gauge_id,
    } : data);
    return { error: null };
  }, [userId, readLocalSelectedGauge]);

  return {
    settings,
    loading,
    loaded,
    error,
    updateSettings,
    refetch: () => void fetchSettings(),
  };
}
