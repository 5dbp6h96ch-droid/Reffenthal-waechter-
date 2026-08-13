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
import {
  supabase,
  supabaseConfigured,
  PASSWORD_RECOVERY_STORAGE_KEY,
} from '@/app/utils/supabase';

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
  /** true, wenn der Nutzer über einen Passwort-Reset-Link gekommen ist. */
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
}

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

function getRecoveryMarker(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function clearRecoveryMarker(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
  } catch {
    // sessionStorage kann in speziellen WebView-Umgebungen fehlen.
  }
}

export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    if (getRecoveryMarker()) {
      setPasswordRecovery(true);
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecovery(true);
        }
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
        emailRedirectTo: 'https://5dbp6h96ch-droid.github.io/Reffenthal-waechter-/',
        data: {
          first_name: meta?.firstName ?? '',
          username: (meta?.username ?? '').trim(),
        },
      },
    });
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
      redirectTo: 'https://5dbp6h96ch-droid.github.io/Reffenthal-waechter-/',
    });
    return { error };
  };

  const updatePassword = async (password: string) => {
    if (!supabaseConfigured || !supabase) return notConfiguredError();
    const { error } = await supabase.auth.updateUser({ password });
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
    passwordRecovery,
    clearPasswordRecovery: () => {
      clearRecoveryMarker();
      setPasswordRecovery(false);
    },
    updatePassword,
  };
}
