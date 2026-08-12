import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';
import { useColors } from '@/hooks/useColors';

const TEST_ORIGIN = 'https://rheinschiffer-test.pages.dev';
const PUSH_TOKEN_TABLE = 'push_tokens';

async function registerPushToken(userId: string): Promise<string | null> {
  if (Platform.OS === 'web' || !supabaseConfigured || !supabase) return null;

  const permission = await Notifications.getPermissionsAsync();
  let granted = permission.granted;
  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }
  if (!granted) return null;

  const projectId =
    process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return null;

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoPushToken = tokenResponse.data;
  if (!expoPushToken) return null;

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { error } = await supabase.from(PUSH_TOKEN_TABLE).upsert(
    {
      user_id: userId,
      expo_push_token: expoPushToken,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,expo_push_token' },
  );
  if (error) throw error;
  return expoPushToken;
}

export default function TestAuthPanel() {
  const colors = useColors();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? null);
      if (data.session?.user?.id) {
        void registerPushToken(data.session.user.id).catch(() => {});
      }
    }).catch(() => {});

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
      if (session?.user?.id) {
        void registerPushToken(session.user.id).catch(() => {});
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const login = async () => {
    if (!supabaseConfigured || !supabase) {
      setMessage('Test-Supabase ist in diesem Build nicht konfiguriert.');
      return;
    }
    if (!email.trim() || !password) {
      setMessage('Bitte E-Mail und Passwort eingeben.');
      return;
    }
    setLoading(true);
    setMessage(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setUserEmail(data.user?.email ?? email.trim());
    setPassword('');
    setOpen(false);
    if (data.user?.id) {
      void registerPushToken(data.user.id).catch(() => {});
    }
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setUserEmail(null);
  };

  const sendReset = () => {
    setOpen(false);
    router.push('/reset-password');
  };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: Platform.OS === 'web' ? 14 : 50,
          right: 14,
          zIndex: 1000,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => { setMessage(null); setOpen(true); }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Feather name={userEmail ? 'user-check' : 'user'} size={14} color={colors.primary} />
          <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.foreground }}>
            {userEmail ? 'Konto' : 'Anmelden'}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 21, fontFamily: 'SpaceGrotesk_700Bold', color: colors.foreground }}>
                  Test-Konto
                </Text>
                <Text style={{ marginTop: 2, fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                  Nur Test-Supabase · Cloudflare Test
                </Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {userEmail ? (
              <>
                <Text style={{ fontSize: 14, fontFamily: 'SpaceGrotesk_500Medium', color: colors.foreground }}>
                  Angemeldet als {userEmail}
                </Text>
                <TouchableOpacity onPress={logout} style={{ backgroundColor: colors.muted, borderRadius: 10, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.foreground }}>Abmelden</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium', color: colors.mutedForeground }}>E-Mail</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="name@beispiel.de"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular', color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11 }}
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium', color: colors.mutedForeground }}>Passwort</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="••••••••"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ fontSize: 15, fontFamily: 'SpaceGrotesk_400Regular', color: colors.foreground, backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11 }}
                  />
                </View>

                <TouchableOpacity onPress={sendReset} activeOpacity={0.7} style={{ alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.primary }}>
                    Passwort vergessen?
                  </Text>
                </TouchableOpacity>

                {message && (
                  <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular', color: colors.destructive }}>
                    {message}
                  </Text>
                )}

                <TouchableOpacity disabled={loading} onPress={() => void login()} style={{ backgroundColor: loading ? colors.muted : colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}>
                  {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ fontSize: 15, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.primaryForeground }}>Anmelden</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
