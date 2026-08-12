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
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '../types/database';

// Trailing slash entfernen falls vorhanden.
// TEST-FIX: In der Cloudflare-Test-Umgebung wurde die Supabase-Domain einmal
// mit .supabase.cc statt .supabase.co hinterlegt. Supabase-Projekt-URLs
// verwenden .supabase.co; die Korrektur bleibt hier bewusst defensiv und
// betrifft ausschließlich eine fehlerhafte Endung der öffentlichen URL.
const rawSupabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseUrl = rawSupabaseUrl.replace(/\.supabase\.cc$/i, '.supabase.co');
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

/**
 * true wenn beide Supabase-Umgebungsvariablen beim Build vorhanden waren.
 * Alle Hooks prüfen diesen Wert, bevor sie den Client verwenden.
 */
export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!supabaseConfigured) {
  console.warn(
    '[Supabase] EXPO_PUBLIC_SUPABASE_URL oder EXPO_PUBLIC_SUPABASE_KEY fehlt – ' +
    'Auth-Funktionen sind deaktiviert (Gastmodus).',
  );
}

/**
 * Supabase-Client-Instanz oder null wenn nicht konfiguriert.
 * Hooks verwenden supabaseConfigured als Guard und casten sicher auf non-null.
 */
export const supabase = supabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        // AsyncStorage: funktioniert auf iOS, Android und Web (GitHub Pages PWA)
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // detectSessionInUrl: false ist erforderlich für React Native / Expo
        detectSessionInUrl: false,
      },
    })
  : null;
