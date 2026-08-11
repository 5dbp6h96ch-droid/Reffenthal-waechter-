/**
 * supabase.ts – Zentraler Supabase-Client für R(h)einschiffer
 *
 * Verwendet @supabase/supabase-js v2 mit AsyncStorage-Session-Persistenz.
 * Konfiguration ausschließlich über EXPO_PUBLIC_*-Umgebungsvariablen –
 * niemals service_role oder Secret Keys hier verwenden.
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '../types/database';

// Trailing slash entfernen falls vorhanden
const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] EXPO_PUBLIC_SUPABASE_URL oder EXPO_PUBLIC_SUPABASE_KEY fehlt.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // AsyncStorage: funktioniert auf iOS, Android und Web (GitHub Pages PWA)
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // detectSessionInUrl: false ist erforderlich für React Native / Expo
    detectSessionInUrl: false,
  },
});
