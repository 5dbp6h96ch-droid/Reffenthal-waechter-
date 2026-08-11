/**
 * useAuth.ts – Supabase-Auth-Hook für R(h)einschiffer
 *
 * Stellt bereit:
 *   - session:    aktuelle Auth-Session (null = nicht eingeloggt)
 *   - user:       aktueller Nutzer (aus session)
 *   - loading:    true während Session-Initialisierung
 *   - signIn:     E-Mail + Passwort Login
 *   - signUp:     E-Mail + Passwort Registrierung
 *   - signOut:    Abmelden
 *
 * Session wird persistent in AsyncStorage gespeichert und beim
 * App-Start automatisch wiederhergestellt.
 *
 * WICHTIG: Keine UI-Logik hier – nur technische Auth-Grundlage.
 */

import { useState, useEffect } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/app/utils/supabase';

export interface UseAuthResult {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
}

export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Bestehende Session beim Start wiederherstellen
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Auth-Zustandsänderungen beobachten (Login, Logout, Token-Refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Bestätigungs-Link leitet auf die GitHub-Pages-Test-URL zurück.
        // Supabase hängt den Token als Fragment (#access_token=...) an.
        emailRedirectTo: 'https://5dbp6h96ch-droid.github.io/Reffenthal-waechter-/test/',
      },
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    session,
    user: session?.user ?? null,
    loading,
    signIn,
    signUp,
    signOut,
  };
}
