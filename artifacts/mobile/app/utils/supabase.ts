/**
 * supabase.ts – Zentraler Supabase-Client für R(h)einschiffer
 *
 * Verwendet @supabase/supabase-js v2 mit AsyncStorage-Session-Persistenz.
 * Es werden ausschließlich öffentliche Publishable/anon Keys verwendet.
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '../types/database';

const rawSupabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
let supabaseUrl = rawSupabaseUrl.replace(/\.supabase\.cc$/i, '.supabase.co');

const configuredKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  '';

// TEST-ONLY fallback: Die Cloudflare-Testvariablen enthalten aktuell eine
// falsche Projekt-URL bzw. einen unvollständigen Publishable Key. Der echte
// Test-Projekt-Ref lautet azssnqabyefqplnoehty. Diese Werte sind öffentlich
// und ersetzen niemals einen service_role/Secret Key.
const TEST_SUPABASE_URL = 'https://azssnqabyefqplnoehty.supabase.co';
const TEST_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dvhyq-ZL_5lPpkiPXN_fuQ_37eLGSv6';

const looksLikeBrokenTestUrl =
  /azssnqabyefq(?:pinoeht|plnoehty)\.supabase\.co$/i.test(supabaseUrl) ||
  /azssnqabyefq(?:pinoeht|plnoehty)\.supabase\.cc$/i.test(rawSupabaseUrl);

if (looksLikeBrokenTestUrl) {
  supabaseUrl = TEST_SUPABASE_URL;
}

const supabaseAnonKey = looksLikeBrokenTestUrl
  ? TEST_SUPABASE_PUBLISHABLE_KEY
  : configuredKey;

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

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
        detectSessionInUrl: false,
      },
    })
  : null;
