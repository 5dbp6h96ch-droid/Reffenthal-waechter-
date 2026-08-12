import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';
import { useColors } from '@/hooks/useColors';

function parseAuthParams(url: string): { access_token: string; refresh_token: string } | null {
  const hash = url.split('#')[1] ?? '';
  const query = hash || url.split('?')[1] || '';
  const params = new URLSearchParams(query);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export default function ResetPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!supabaseConfigured || !supabase) {
        if (!cancelled) {
          setMessage('Test-Supabase ist in diesem Build nicht konfiguriert.');
          setLoading(false);
        }
        return;
      }

      try {
        let url = '';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          url = window.location.href;
        } else {
          url = (await Linking.getInitialURL()) ?? '';
        }
        const tokens = parseAuthParams(url);
        if (tokens) {
          const { error } = await supabase.auth.setSession(tokens);
          if (error) throw error;
        }
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          setReady(!!data.session);
          if (!data.session) {
            setMessage('Der Reset-Link ist abgelaufen oder ungültig. Bitte fordere einen neuen Link an.');
          }
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Reset-Link konnte nicht verarbeitet werden.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void init();
    return () => { cancelled = true; };
  }, []);

  const savePassword = async () => {
    if (!supabase) return;
    if (password.length < 8) {
      setMessage('Das neue Passwort muss mindestens 8 Zeichen haben.');
      return;
    }
    if (password !== confirm) {
      setMessage('Die Passwörter stimmen nicht überein.');
      return;
    }
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setPassword('');
    setConfirm('');
    setMessage('Passwort erfolgreich geändert. Du kannst dich jetzt anmelden.');
    setReady(false);
    setTimeout(() => router.replace('/'), 900);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 20 }}>
      <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="lock" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 21, fontFamily: 'SpaceGrotesk_700Bold', color: colors.foreground }}>Passwort zurücksetzen</Text>
            <Text style={{ marginTop: 2, fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>R(h)einschiffer · TEST</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : ready ? (
          <>
            <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground, lineHeight: 19 }}>
              Vergib ein neues Passwort für dein Test-Konto.
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Neues Passwort"
              placeholderTextColor={colors.mutedForeground}
              style={{ fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular', color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12 }}
            />
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              placeholder="Passwort wiederholen"
              placeholderTextColor={colors.mutedForeground}
              style={{ fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular', color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12 }}
            />
            {message && <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular', color: colors.destructive }}>{message}</Text>}
            <TouchableOpacity disabled={saving} onPress={() => void savePassword()} style={{ backgroundColor: saving ? colors.muted : colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}>
              {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ fontSize: 15, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.primaryForeground }}>Neues Passwort speichern</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {message && <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.destructive, lineHeight: 19 }}>{message}</Text>}
            <TouchableOpacity onPress={() => router.replace('/')} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.primaryForeground }}>Zur Test-App</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.replace('/')} style={{ alignSelf: 'center', padding: 6 }}>
          <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium', color: colors.mutedForeground }}>Abbrechen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
