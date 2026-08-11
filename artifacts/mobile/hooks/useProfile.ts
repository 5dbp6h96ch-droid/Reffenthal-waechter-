/**
 * useProfile.ts – Persönliches Profil aus public.profiles
 *
 * Liest den Eintrag des angemeldeten Nutzers aus public.profiles.
 * Falls noch kein Eintrag existiert (z. B. direkt nach E-Mail-Bestätigung),
 * wird aus user_metadata (beim signUp mitgegeben) ein Profil angelegt.
 *
 * displayName  = full_name aus profiles || user_metadata.first_name
 * displayUsername = username aus profiles || user_metadata.username
 *
 * Kein Absturz im Gastmodus oder ohne Supabase-Konfiguration.
 */

import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';
import type { Profile } from '@/app/types/database';

export interface UseProfileResult {
  profile: Profile | null;
  loading: boolean;
  /** Vorname / Anzeigename – aus profiles oder user_metadata */
  displayName: string | null;
  /** Nutzername – aus profiles oder user_metadata */
  displayUsername: string | null;
}

export function useProfile(user: User | null): UseProfileResult {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  const syncProfile = useCallback(async () => {
    if (!user || !supabaseConfigured || !supabase) {
      setProfile(null);
      return;
    }
    const client = supabase;
    setLoading(true);

    // Vorhandenes Profil laden
    const { data: existing } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (existing) {
      setProfile(existing as Profile);
      setLoading(false);
      return;
    }

    // Noch kein Profil: aus user_metadata anlegen (läuft nach E-Mail-Bestätigung)
    const meta = (user.user_metadata ?? {}) as Record<string, string>;
    const { data: upserted } = await client
      .from('profiles')
      .upsert(
        {
          id: user.id,
          full_name: meta['first_name'] ?? null,
          username: meta['username'] ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .select()
      .maybeSingle();

    setProfile((upserted as Profile | null) ?? null);
    setLoading(false);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void syncProfile();
  }, [syncProfile]);

  // Fallback auf user_metadata wenn profiles noch leer (unbestätigte Registrierung)
  const meta = (user?.user_metadata ?? {}) as Record<string, string>;
  const displayName = profile?.full_name ?? meta['first_name'] ?? null;
  const displayUsername = profile?.username ?? meta['username'] ?? null;

  return { profile, loading, displayName, displayUsername };
}
