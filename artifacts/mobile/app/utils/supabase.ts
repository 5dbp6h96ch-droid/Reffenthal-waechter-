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

// TEST-ONLY fallback: Der Cloudflare-Test-Build darf ausschließlich das
// bekannte TEST-Supabase-Projekt verwenden. Damit bleibt der Test-Build
// funktionsfähig, selbst wenn in Cloudflare eine alte/falsch eingetragene
// Test-URL oder ein alter öffentlicher Key hinterlegt ist.
const TEST_SUPABASE_URL = 'https://azssnqabyefqplnoehty.supabase.co';
const TEST_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Dvhyq-ZL_5lPpkiPXN_fuQ_37eLGSv6';

const isTestProjectUrl =
  /azssnqabyefq(?:pinoeht|plnoehty)\.supabase\.co$/i.test(supabaseUrl) ||
  /azssnqabyefq(?:pinoeht|plnoehty)\.supabase\.cc$/i.test(rawSupabaseUrl);

// Bei einem erkennbaren TEST-Projekt immer die kanonischen TEST-Werte nutzen.
// Das verhindert insbesondere "Load failed" durch einen alten/abgeschnittenen
// Publishable Key in den Cloudflare-Variablen.
if (isTestProjectUrl) {
  supabaseUrl = TEST_SUPABASE_URL;
}

const supabaseAnonKey = isTestProjectUrl
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
