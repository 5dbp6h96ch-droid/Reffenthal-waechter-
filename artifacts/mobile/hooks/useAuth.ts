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
 * Wenn Supabase nicht konfiguriert ist (fehlende ENVs), läuft der Hook
 * im Gastmodus: loading=false, session=null, alle Auth-Aktionen geben
 * einen kontrollierten Fehler zurück – kein Absturz.
 *
 * WICHTIG: Keine UI-Logik hier – nur technische Auth-Grundlage.
 */

import { useState, useEffect } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';

export interface UseAuthResult {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string,
    meta?: { firstName?: string; username?: string },
  ) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
}

/** Hilfsfunktion: Erstellt einen AuthError-ähnlichen Dummy für den Gastmodus. */
function notConfiguredError(): { error: AuthError } {
  return {
    error: {
      name: 'AuthApiError',
      message: 'Supabase nicht konfiguriert – bitte App neu bauen.',
      status: 0,
      code: 'supabase_not_configured',
    } as unknown as AuthError,
  };
}

export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured); // false wenn kein Supabase

  useEffect(() => {
    // Ohne Supabase-Konfiguration: Gastmodus, kein Netzwerkaufruf
    if (!supabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

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
    if (!supabaseConfigured || !supabase) return notConfiguredError();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (
    email: string,
    password: string,
    meta?: { firstName?: string; username?: string },
  ) => {
    if (!supabaseConfigured || !supabase) return notConfiguredError();
    const client = supabase;
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        // Bestätigungs-Link leitet auf die Cloudflare-Test-URL zurück.
        emailRedirectTo: 'https://rheinschiffer-test.pages.dev/',
        // Vorname + Nutzername in user_metadata – werden von useProfile
        // beim ersten Login in public.profiles übertragen.
        data: {
          first_name: meta?.firstName ?? '',
          username: (meta?.username ?? '').trim(),
        },
      },
    });
    // Falls der Nutzer sofort eine Session hat (E-Mail-Bestätigung deaktiviert),
    // direkt in profiles schreiben. Andernfalls übernimmt useProfile beim Login.
    if (!error && data.user && data.session) {
      await client.from('profiles').upsert(
        {
          id: data.user.id,
          full_name: meta?.firstName ?? null,
          username: (meta?.username ?? '').trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
    }
    return { error };
  };

  const resetPassword = async (email: string) => {
    if (!supabaseConfigured || !supabase) return notConfiguredError();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Reset-Link leitet auf die Cloudflare-Test-URL zurück (wie signUp).
      redirectTo: 'https://rheinschiffer-test.pages.dev/',
    });
    return { error };
  };

  const signOut = async () => {
    if (!supabaseConfigured || !supabase) return notConfiguredError();
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
    resetPassword,
  };
}
