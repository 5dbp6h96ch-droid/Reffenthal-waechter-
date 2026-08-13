/**
 * supabase.ts – Zentraler Supabase-Client für R(h)einschiffer
 *
 * Verwendet @supabase/supabase-js v2 mit AsyncStorage-Session-Persistenz.
 * Konfiguration ausschließlich über EXPO_PUBLIC_*-Umgebungsvariablen –
 * niemals service_role oder Secret Keys hier verwenden.
 *
 * Defensiv: Fehlt EXPO_PUBLIC_SUPABASE_URL oder EXPO_PUBLIC_SUPABASE_KEY,
 * wird createClient NICHT aufgerufen. Die App lädt weiterhin; Auth-Funktionen
 * sind dann im Gastmodus deaktiviert. Kein App-Absturz bei fehlendem Secret.
 */

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '../types/database';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Der Supabase-Webclient kann einen Recovery-Link bereits während der
// Initialisierung verarbeiten und die URL danach bereinigen. Dieser Marker
// wird synchron gesetzt, damit useAuth den Recovery-Einstieg nicht verpasst.
export const PASSWORD_RECOVERY_STORAGE_KEY = 'rheinschiffer_password_recovery_pending';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    const url = `${window.location.hash}${window.location.search}`;
    if (
      url.includes('type=recovery') ||
      new URLSearchParams(window.location.search).has('code')
    ) {
      window.sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, '1');
    }
  } catch {
    // URL/sessionStorage können in speziellen WebView-Umgebungen fehlen.
  }
}

if (!supabaseConfigured) {
  console.warn(
    '[Supabase] EXPO_PUBLIC_SUPABASE_URL oder EXPO_PUBLIC_SUPABASE_KEY fehlt – ' +
    'Auth-Funktionen sind deaktiviert (Gastmodus).',
  );
}

export const supabase = supabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // Auf Web muss der Supabase-Client die Tokens aus der URL lesen,
        // damit Passwort-Reset-Links (PASSWORD_RECOVERY) funktionieren.
        // Auf nativen Plattformen bleibt das Verhalten unverändert (false).
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;
