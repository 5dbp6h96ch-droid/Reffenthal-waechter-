import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useGauges } from '@/hooks/useGauges';
import { supabase } from '@/app/utils/supabase';
import type { Gauge } from '@/app/types/database';

type ForecastInfo = { available: boolean; value: number | null; timestamp: string | null };
const API_BASE = 'https://pegelonline.wsv.de/webservices/rest-api/v2';

export default function RheinGaugePreferences({ userId }: { userId: string | null | undefined }) {
  const colors = useColors();
  const { gauges, loading } = useGauges();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingSelection, setLoadingSelection] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [forecasts, setForecasts] = useState<Record<string, ForecastInfo>>({});

  useEffect(() => {
    if (!userId || !supabase) { setSelectedIds([]); return; }
    let cancelled = false;
    setLoadingSelection(true);
    void (async () => {
      const { data, error } = await (supabase as any).from('user_preferred_gauges').select('gauge_id').eq('user_id', userId);
      if (!cancelled) { setSelectedIds(error ? [] : (data ?? []).map((row: { gauge_id: string }) => row.gauge_id)); setLoadingSelection(false); }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('de-DE');
    if (!q) return gauges;
    return gauges.filter((g) => `${g.name} ${g.pegel_nr ?? ''} ${g.river_km ?? ''}`.toLocaleLowerCase('de-DE').includes(q));
  }, [gauges, search]);

  const toggleGauge = async (gauge: Gauge) => {
    if (!userId || !supabase || saving) return;
    setMessage(null);
    const next = selectedIds.includes(gauge.id) ? selectedIds.filter((id) => id !== gauge.id) : [...selectedIds, gauge.id];
    setSelectedIds(next); setSaving(true);
    const { error: deleteError } = await (supabase as any).from('user_preferred_gauges').delete().eq('user_id', userId);
    if (deleteError) { setSaving(false); setSelectedIds(selectedIds); setMessage('Auswahl konnte nicht gespeichert werden.'); return; }
    if (next.length > 0) {
      const { error: insertError } = await (supabase as any).from('user_preferred_gauges').insert(next.map((gaugeId) => ({ user_id: userId, gauge_id: gaugeId })));
      if (insertError) { setSaving(false); setSelectedIds(selectedIds); setMessage('Auswahl konnte nicht gespeichert werden.'); return; }
    }
    setSaving(false); setMessage(`${next.length} Pegel ausgewählt.`);
  };

  useEffect(() => {
    let cancelled = false;
    const selected = gauges.filter((g) => selectedIds.includes(g.id));
    if (!selected.length) { setForecasts({}); return; }
    void (async () => {
      const entries = await Promise.all(selected.map(async (g) => {
        try {
          const stationRes = await fetch(`${API_BASE}/stations/${encodeURIComponent(g.pegel_uuid)}.json?includeForecastTimeseries=true`);
          if (!stationRes.ok) return [g.id, { available: false, value: null, timestamp: null } as ForecastInfo] as const;
          const station = await stationRes.json() as { timeseries?: Array<{ shortname?: string }> };
          const hasWv = (station.timeseries ?? []).some((t) => t.shortname === 'WV');
          if (!hasWv) return [g.id, { available: false, value: null, timestamp: null } as ForecastInfo] as const;
          const forecastRes = await fetch(`${API_BASE}/stations/${encodeURIComponent(g.pegel_uuid)}/WV/measurements.json`);
          if (!forecastRes.ok) return [g.id, { available: true, value: null, timestamp: null } as ForecastInfo] as const;
          const rows = await forecastRes.json() as Array<{ value?: number; timestamp?: string }>;
          const now = Date.now();
          const next = rows.filter((r) => r.timestamp && new Date(r.timestamp).getTime() >= now).sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime())[0];
          return [g.id, { available: true, value: next?.value != null ? Math.round(next.value) : null, timestamp: next?.timestamp ?? null } as ForecastInfo] as const;
        } catch { return [g.id, { available: false, value: null, timestamp: null } as ForecastInfo] as const; }
      }));
      if (!cancelled) setForecasts(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [gauges, selectedIds]);

  if (!userId) return (
    <View style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Feather name="lock" size={16} color={colors.primary} /><Text style={{ fontSize: 14, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.foreground }}>Anmeldung erforderlich</Text></View>
      <Text style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>Melde dich an, um deine persönlichen Rheinpegel zu speichern.</Text>
    </View>
  );

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.mutedForeground, letterSpacing: 2, textTransform: 'uppercase' }}>Meine Rheinpegel</Text><Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_500Medium', color: colors.primary }}>{selectedIds.length} ausgewählt</Text></View>
      <TextInput value={search} onChangeText={setSearch} placeholder="Rheinpegel suchen …" placeholderTextColor={colors.mutedForeground} style={{ fontSize: 14, fontFamily: 'SpaceGrotesk_400Regular', color: colors.foreground, backgroundColor: colors.muted, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border }} />
      {loading || loadingSelection ? <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} /> : (
        <View style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          {filtered.map((g, idx) => {
            const selected = selectedIds.includes(g.id); const forecast = forecasts[g.id];
            return <TouchableOpacity key={g.id} disabled={saving} onPress={() => void toggleGauge(g)} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: idx === filtered.length - 1 ? 0 : 1, borderBottomColor: colors.border, backgroundColor: selected ? colors.primary + '08' : 'transparent' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}><View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: selected ? colors.primary + '20' : colors.muted, alignItems: 'center', justifyContent: 'center' }}><Feather name={selected ? 'check' : 'anchor'} size={14} color={selected ? colors.primary : colors.mutedForeground} /></View><View style={{ flex: 1, gap: 2 }}><Text style={{ fontSize: 14, fontFamily: selected ? 'SpaceGrotesk_700Bold' : 'SpaceGrotesk_500Medium', color: selected ? colors.primary : colors.foreground }}>{g.name}</Text><Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>{`Rhein · km ${(g.river_km ?? 0).toFixed(2).replace('.', ',')}`}</Text>{selected && forecast && <Text style={{ fontSize: 10, fontFamily: 'SpaceGrotesk_500Medium', color: forecast.available ? colors.safe : colors.mutedForeground }}>{forecast.available ? (forecast.value != null ? `Vorhersage: ${forecast.value} cm${forecast.timestamp ? ` · ${new Date(forecast.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Vorhersage verfügbar') : 'Keine Vorhersage verfügbar'}</Text>}</View></View>
              {selected && <Feather name="check-circle" size={19} color={colors.primary} />}
            </TouchableOpacity>;
          })}
          {!filtered.length && <Text style={{ padding: 16, fontSize: 13, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>Kein Rheinpegel gefunden.</Text>}
        </View>
      )}
      {saving && <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>Speichere …</Text>}
      {message && <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_500Medium', color: colors.safe }}>{message}</Text>}
      <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground, lineHeight: 16 }}>Nur Pegel des Gewässers Rhein werden angezeigt. Die Vorhersage wird je ausgewähltem Pegel direkt über PEGELONLINE/WV geprüft.</Text>
    </View>
  );
}
