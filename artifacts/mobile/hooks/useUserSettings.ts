/**
 * useUserSettings.ts – Lesen und Schreiben von user_settings in Supabase
 *
 * RLS-Policies sind serverseitig eingerichtet – der Nutzer sieht
 * ausschließlich seine eigenen Einstellungen.
 *
 * Standortdaten (latitude/longitude) werden NICHT automatisch gespeichert.
 * location_enabled ist standardmäßig false.
 *
 * Verwendung:
 *   const { settings, loading, error, updateSettings } = useUserSettings(userId);
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/app/utils/supabase';
import type { Database, UserSettings, UserSettingsUpdate } from '@/app/types/database';

export interface UseUserSettingsResult {
  settings: UserSettings | null;
  loading: boolean;
  error: string | null;
  updateSettings: (update: UserSettingsUpdate) => Promise<{ error: string | null }>;
  refetch: () => void;
}

export function useUserSettings(userId: string | null | undefined): UseUserSettingsResult {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!userId) {
      setSettings(null);
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
    } else {
      setSettings(data);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (update: UserSettingsUpdate) => {
    if (!userId) return { error: 'Kein Nutzer angemeldet' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
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
    setSettings(data);
    return { error: null };
  }, [userId]);

  return {
    settings,
    loading,
    error,
    updateSettings,
    refetch: () => void fetchSettings(),
  };
}
