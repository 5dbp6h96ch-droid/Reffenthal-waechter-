/**
 * supabase.ts – Zentraler Supabase-Client für R(h)einschiffer
 *
 * Verwendet @supabase/supabase-js v2 mit AsyncStorage-Session-Persistenz.
 * Es werden ausschließlich öffentliche Publishable/anon Keys verwendet.
 */

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '../types/database';

const rawSupabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
let supabaseUrl = rawSupabaseUrl.replace(/\.supabase\.cc$/i, '.supabase.co');

const configuredKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  '';

// TEST-ONLY: Der Cloudflare-Test-Build verwendet immer das kanonische
// TEST-Supabase-Projekt. Dadurch sind Tippfehler/alte Werte in Cloudflare
// Pages-Variablen ausgeschlossen. Diese Datei wird ausschließlich im
// Branch "test" geändert; Production/main bleibt unverändert.
const TEST_SUPABASE_URL = 'https://azssnqabyefqplnoehty.supabase.co';
const TEST_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dvhyq-ZL_5lPpkiPXN_fuQ_37eLGSv6';

// Im TEST-Build ausschließlich die kanonischen TEST-Werte verwenden.
// Die EXPO_PUBLIC_* Variablen bleiben als Dokumentation/Fallback für andere
// Builds vorhanden, dürfen den TEST-Build aber nicht auf ein anderes Projekt
// lenken.
supabaseUrl = TEST_SUPABASE_URL;
const supabaseAnonKey = TEST_SUPABASE_PUBLISHABLE_KEY || configuredKey;

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Der Supabase-Webclient verarbeitet einen Recovery-Link während seiner
// Initialisierung und kann dabei Query/Hash aus der Browser-URL entfernen,
// bevor useAuth seinen Effect ausführt. Deshalb markieren wir den Recovery-
// Einstieg synchron beim Laden der Client-Datei. So geht der Hinweis nicht
// verloren, auch wenn PASSWORD_RECOVERY vor der Listener-Registrierung feuert.
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
    '[Supabase] EXPO_PUBLIC_SUPABASE_URL oder öffentlicher Supabase-Key fehlt – ' +
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
