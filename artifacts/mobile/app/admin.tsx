import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useColors } from '@/hooks/useColors';

type AdminUser = {
  id: string;
  email: string;
  name: string;
  pushCount: number;
  lastPushAt: string | null;
};

type SendResult = {
  user_id: string;
  email: string;
  ok: boolean;
  status?: number;
  reason?: string;
};

function formatLastPush(value: string | null): string {
  if (!value) return 'unbekannt';
  try {
    return new Date(value).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'unbekannt';
  }
}

export default function AdminPushScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('/');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [results, setResults] = useState<SendResult[]>([]);

  const isAdmin = user?.app_metadata?.role === 'admin';

  const loadUsers = useCallback(async () => {
    if (!supabaseConfigured || !supabase || !isAdmin) return;
    setLoading(true);
    setStatus(null);
    const { data, error } = await supabase.functions.invoke('admin-push', { body: { action: 'list' } });
    setLoading(false);
    if (error) {
      setStatus(error.message || 'Nutzer konnten nicht geladen werden.');
      return;
    }
    setUsers(Array.isArray(data?.users) ? data.users : []);
  }, [isAdmin]);

  useEffect(() => {
    if (!authLoading && isAdmin) void loadUsers();
  }, [authLoading, isAdmin, loadUsers]);

  const allSelected = users.length > 0 && selected.length === users.length;
  const selectedUsers = useMemo(() => new Set(selected), [selected]);

  const toggleUser = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAll = () => {
    setSelected(allSelected ? [] : users.map((item) => item.id));
  };

  const send = async () => {
    if (!supabase || !selected.length || !title.trim() || !message.trim()) return;
    setSending(true);
    setStatus(null);
    setResults([]);
    const { data, error } = await supabase.functions.invoke('admin-push', {
      body: {
        action: 'send',
        target_user_ids: selected,
        title: title.trim(),
        message: message.trim(),
        url: url.trim() || '/',
      },
    });
    setSending(false);
    if (error) {
      setStatus(error.message || 'Push-Versand fehlgeschlagen.');
      return;
    }
    const sent = Number(data?.sent ?? 0);
    const failed = Number(data?.failed ?? 0);
    const withoutPush = Array.isArray(data?.users_without_push) ? data.users_without_push.length : 0;
    setResults(Array.isArray(data?.results) ? data.results : []);
    setStatus(`Versand abgeschlossen: ${sent} erfolgreich${failed ? `, ${failed} fehlgeschlagen` : ''}${withoutPush ? `, ${withoutPush} ohne Push-Abo` : ''}.`);
  };

  if (authLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (!supabaseConfigured || !supabase) {
    return <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: colors.background }}><Text style={{ fontSize: 20, fontWeight: '700', color: colors.foreground }}>Admin-Push</Text><Text style={{ marginTop: 10, color: colors.mutedForeground }}>TEST-Supabase ist nicht konfiguriert.</Text></View>;
  }

  if (!user) {
    return <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: colors.background }}><Text style={{ fontSize: 22, fontWeight: '700', color: colors.foreground }}>Admin-Push</Text><Text style={{ marginTop: 10, color: colors.mutedForeground }}>Bitte zuerst mit einem TEST-Konto anmelden.</Text><TouchableOpacity onPress={() => router.replace('/')} style={{ marginTop: 20, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}><Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Zur App</Text></TouchableOpacity></View>;
  }

  if (!isAdmin) {
    return <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: colors.background }}><Text style={{ fontSize: 22, fontWeight: '700', color: colors.foreground }}>Kein Zugriff</Text><Text style={{ marginTop: 10, color: colors.mutedForeground }}>Diese Seite ist ausschließlich für Nutzer mit der Supabase-Rolle „admin“ freigegeben.</Text><TouchableOpacity onPress={() => router.replace('/')} style={{ marginTop: 20, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}><Text style={{ color: colors.primaryForeground, fontWeight: '700' }}>Zur App</Text></TouchableOpacity></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 0 : 12 }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 50, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.foreground }}>Admin · Push senden</Text>
            <Text style={{ marginTop: 3, fontSize: 12, color: colors.mutedForeground }}>TEST-System · nur ausgewählte Push-Abos</Text>
          </View>
          <TouchableOpacity onPress={() => router.replace('/')} style={{ padding: 8 }}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
        </View>

        <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>Empfänger</Text>
            <TouchableOpacity onPress={toggleAll}><Text style={{ color: colors.primary, fontWeight: '700' }}>{allSelected ? 'Keine' : 'Alle auswählen'}</Text></TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color={colors.primary} /> : users.length === 0 ? <Text style={{ color: colors.mutedForeground }}>Keine registrierten Nutzer mit Web-Push-Abo gefunden.</Text> : users.map((item) => {
            const checked = selectedUsers.has(item.id);
            return <TouchableOpacity key={item.id} onPress={() => toggleUser(item.id)} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{checked && <Feather name="check" size={15} color={colors.primaryForeground} />}</View>
              <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontWeight: '600' }}>{item.name || item.email || item.id}</Text><Text style={{ marginTop: 2, fontSize: 11, color: colors.mutedForeground }}>{item.email} · {item.pushCount} Push-Abo · zuletzt {formatLastPush(item.lastPushAt)}</Text></View>
            </TouchableOpacity>;
          })}
        </View>

        <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>Nachricht</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Titel" placeholderTextColor={colors.mutedForeground} style={{ color: colors.foreground, backgroundColor: colors.muted, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11 }} />
          <TextInput value={message} onChangeText={setMessage} placeholder="Nachricht" placeholderTextColor={colors.mutedForeground} multiline numberOfLines={5} textAlignVertical="top" style={{ minHeight: 110, color: colors.foreground, backgroundColor: colors.muted, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11 }} />
          <TextInput value={url} onChangeText={setUrl} placeholder="Ziel-URL (optional)" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={{ color: colors.foreground, backgroundColor: colors.muted, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11 }} />
          <TouchableOpacity disabled={sending || !selected.length || !title.trim() || !message.trim()} onPress={() => void send()} style={{ backgroundColor: sending || !selected.length || !title.trim() || !message.trim() ? colors.muted : colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}>
            {sending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: selected.length && title.trim() && message.trim() ? colors.primaryForeground : colors.mutedForeground, fontWeight: '700' }}>Push an {selected.length} ausgewählte Nutzer senden</Text>}
          </TouchableOpacity>
          {status && <Text style={{ color: status.includes('abgeschlossen') ? colors.safe : colors.destructive, fontSize: 13 }}>{status}</Text>}
        </View>

        {results.length > 0 && <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.foreground }}>Ergebnis je Empfänger</Text>
          {results.map((result, index) => <View key={`${result.user_id}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Feather name={result.ok ? 'check-circle' : 'x-circle'} size={16} color={result.ok ? colors.safe : colors.destructive} /><Text style={{ flex: 1, fontSize: 12, color: colors.foreground }}>{result.email || result.user_id}{result.ok ? ' · gesendet' : ` · Fehler${result.reason ? `: ${result.reason}` : ''}`}</Text></View>)}
        </View>}
      </ScrollView>
    </View>
  );
}
