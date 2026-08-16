import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '@/app/utils/supabase';

type AdminUser = { user_id: string; email: string; updated_at?: string | null };

type SendResult = { user_id: string; ok: boolean; status?: number; reason?: string };

export default function AdminPushScreen() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('R(h)einschiffer');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('admin-push', { method: 'GET' });
    if (fnError) setError(fnError.message || 'Zugriff verweigert.');
    else setUsers((data?.users ?? []) as AdminUser[]);
    setLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  async function send() {
    if (!selected.length || !body.trim()) return;
    setSending(true);
    setError(null);
    setResult(null);
    const { data, error: fnError } = await supabase.functions.invoke('admin-push', {
      method: 'POST',
      body: { user_ids: selected, title: title.trim() || 'R(h)einschiffer', body: body.trim() },
    });
    if (fnError) setError(fnError.message || 'Versand fehlgeschlagen.');
    else {
      const results = (data?.results ?? []) as SendResult[];
      const sent = results.filter((r) => r.ok).length;
      setResult(`${sent} Push-Nachricht${sent === 1 ? '' : 'en'} gesendet.`);
      setSelected([]);
      setBody('');
    }
    setSending(false);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Nutzer werden geladen …</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Push-Nachricht senden</Text>
      <Text style={styles.subtitle}>Nur Nutzer mit aktiver Web-Push-Subscription werden angezeigt.</Text>

      <Text style={styles.label}>Empfänger</Text>
      {users.length === 0 ? <Text style={styles.muted}>Keine aktiven Push-Abos gefunden.</Text> : users.map((user) => {
        const active = selected.includes(user.user_id);
        return (
          <Pressable key={user.user_id} onPress={() => toggle(user.user_id)} style={[styles.user, active && styles.userSelected]}>
            <View style={[styles.check, active && styles.checkSelected]}>{active ? <Text style={styles.checkText}>✓</Text> : null}</View>
            <Text style={styles.email}>{user.email || user.user_id}</Text>
          </Pressable>
        );
      })}

      <Text style={styles.label}>Titel</Text>
      <TextInput value={title} onChangeText={setTitle} style={styles.input} maxLength={80} />
      <Text style={styles.label}>Nachricht</Text>
      <TextInput value={body} onChangeText={setBody} style={[styles.input, styles.message]} multiline maxLength={500} placeholder="Nachricht eingeben …" />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {result ? <Text style={styles.success}>{result}</Text> : null}
      <Pressable disabled={sending || !selected.length || !body.trim()} onPress={send} style={[styles.button, (sending || !selected.length || !body.trim()) && styles.buttonDisabled]}>
        {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Push senden</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 10, maxWidth: 700, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 2 },
  subtitle: { color: '#666', marginBottom: 14 },
  label: { fontWeight: '700', marginTop: 10 },
  user: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderWidth: 1, borderColor: '#ddd', borderRadius: 10 },
  userSelected: { borderColor: '#111', backgroundColor: '#f4f4f4' },
  check: { width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: '#aaa', alignItems: 'center', justifyContent: 'center' },
  checkSelected: { backgroundColor: '#111', borderColor: '#111' },
  checkText: { color: '#fff', fontWeight: '700' },
  email: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#fff' },
  message: { minHeight: 120, textAlignVertical: 'top' },
  button: { marginTop: 12, backgroundColor: '#111', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontWeight: '700' },
  muted: { color: '#777' },
  error: { color: '#b00020', marginTop: 8 },
  success: { color: '#18733c', marginTop: 8 },
});
