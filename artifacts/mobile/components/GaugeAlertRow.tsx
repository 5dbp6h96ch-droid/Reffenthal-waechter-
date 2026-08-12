import React, { useEffect, useState } from 'react';
import {
  View, Text, Switch, TextInput, ActivityIndicator, Keyboard,
  StyleSheet, TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { supabase, supabaseConfigured } from '@/app/utils/supabase';
import type { Gauge, UserGaugeSetting } from '@/app/types/database';

export interface GaugeAlertRowProps {
  gauge: Gauge;
  setting: UserGaugeSetting | null;
  onToggle: (enabled: boolean) => Promise<{ error: string | null }>;
  onSaveThreshold: (cm: number) => Promise<{ error: string | null }>;
}

type ForecastInfo = {
  loading: boolean;
  available: boolean;
  value: number | null;
  timestamp: string | null;
};

const PEGELONLINE_BASE = 'https://pegelonline.wsv.de/webservices/rest-api/v2';

/**
 * Eine Zeile der Preferences-Liste.
 *
 * Jeder Rheinpegel kann unabhängig als persönliche Preference ausgewählt werden.
 * Die Auswahl wird in public.user_preferred_gauges gespeichert. Die Warnschwelle
 * bleibt davon getrennt und wird wie bisher in user_gauge_settings gespeichert.
 * Für jeden ausgewählten Pegel wird zusätzlich die PEGELONLINE-WV-Vorhersage
 * direkt an diesen Pegel gekoppelt, sofern eine WV-Zeitreihe vorhanden ist.
 */
export function GaugeAlertRow({ gauge, setting, onToggle, onSaveThreshold }: GaugeAlertRowProps) {
  const colors = useColors();
  const [selected, setSelected] = useState(false);
  const [selectionLoading, setSelectionLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inputValue, setInputValue] = useState(
    setting?.alert_threshold_cm != null ? String(setting.alert_threshold_cm) : '',
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastInfo>({
    loading: false, available: false, value: null, timestamp: null,
  });

  useEffect(() => {
    if (setting?.alert_threshold_cm != null) setInputValue(String(setting.alert_threshold_cm));
  }, [setting?.alert_threshold_cm]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSelectionLoading(true);
      if (!supabaseConfigured || !supabase) {
        if (!cancelled) { setSelected(false); setSelectionLoading(false); }
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        if (!cancelled) { setSelected(false); setSelectionLoading(false); }
        return;
      }
      const { data } = await supabase
        .from('user_preferred_gauges')
        .select('gauge_id')
        .eq('user_id', userId)
        .eq('gauge_id', gauge.id)
        .maybeSingle();
      if (!cancelled) {
        setSelected(Boolean(data));
        setSelectionLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [gauge.id]);

  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setForecast({ loading: false, available: false, value: null, timestamp: null });
      return;
    }
    setForecast({ loading: true, available: false, value: null, timestamp: null });
    void (async () => {
      try {
        const stationRes = await fetch(
          `${PEGELONLINE_BASE}/stations/${encodeURIComponent(gauge.pegel_uuid)}.json?includeForecastTimeseries=true`,
        );
        if (!stationRes.ok) throw new Error(`HTTP ${stationRes.status}`);
        const station = await stationRes.json() as {
          timeseries?: Array<{ shortname?: string }>;
        };
        const hasWv = (station.timeseries ?? []).some((t) => t.shortname === 'WV');
        if (!hasWv) {
          if (!cancelled) setForecast({ loading: false, available: false, value: null, timestamp: null });
          return;
        }

        const forecastRes = await fetch(
          `${PEGELONLINE_BASE}/stations/${encodeURIComponent(gauge.pegel_uuid)}/WV/measurements.json`,
        );
        if (!forecastRes.ok) throw new Error(`HTTP ${forecastRes.status}`);
        const rows = await forecastRes.json() as Array<{ value?: number; timestamp?: string }>;
        const now = Date.now();
        const next = rows
          .filter((r) => r.timestamp && new Date(r.timestamp).getTime() >= now)
          .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime())[0];

        if (!cancelled) {
          setForecast({
            loading: false,
            available: true,
            value: next?.value != null ? Math.round(next.value) : null,
            timestamp: next?.timestamp ?? null,
          });
        }
      } catch {
        if (!cancelled) setForecast({ loading: false, available: false, value: null, timestamp: null });
      }
    })();
    return () => { cancelled = true; };
  }, [gauge.pegel_uuid, selected]);

  const toggleSelected = async () => {
    if (!supabaseConfigured || !supabase) {
      setSaveError('Supabase nicht konfiguriert');
      return;
    }
    setSelectionLoading(true);
    setSaveError(null);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setSelectionLoading(false);
      setSaveError('Bitte zuerst anmelden');
      return;
    }

    if (selected) {
      const { error } = await supabase
        .from('user_preferred_gauges')
        .delete()
        .eq('user_id', userId)
        .eq('gauge_id', gauge.id);
      if (error) setSaveError(error.message);
      else setSelected(false);
    } else {
      const { error } = await supabase
        .from('user_preferred_gauges')
        .upsert({ user_id: userId, gauge_id: gauge.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id,gauge_id' });
      if (error) setSaveError(error.message);
      else setSelected(true);
    }
    setSelectionLoading(false);
  };

  const handleThresholdSave = async () => {
    const cm = parseInt(inputValue, 10);
    if (isNaN(cm) || cm <= 0) {
      setInputValue(setting?.alert_threshold_cm != null ? String(setting.alert_threshold_cm) : '');
      Keyboard.dismiss();
      return;
    }
    if (cm === setting?.alert_threshold_cm) {
      Keyboard.dismiss();
      return;
    }
    setSaving(true);
    setSaveError(null);
    const { error } = await onSaveThreshold(cm);
    if (error) setSaveError(error);
    setSaving(false);
    Keyboard.dismiss();
  };

  return (
    <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.muted }]}>
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => void toggleSelected()}
        disabled={selectionLoading}
        style={styles.header}
      >
        <View style={styles.selectorBlock}>
          <View style={[
            styles.checkbox,
            {
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primary : colors.card,
            },
          ]}>
            {selectionLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : selected ? (
              <Feather name="check" size={14} color={colors.primaryForeground} />
            ) : null}
          </View>
          <View style={styles.nameBlock}>
            <Text style={[styles.gaugeName, { color: selected ? colors.primary : colors.foreground }]} numberOfLines={1}>
              {gauge.name}
            </Text>
            {gauge.river != null && (
              <Text style={[styles.gaugeSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                {[gauge.river, gauge.river_km != null ? `km ${gauge.river_km}` : null].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        </View>
        <Feather name={selected ? 'check-circle' : 'circle'} size={19} color={selected ? colors.primary : colors.mutedForeground} />
      </TouchableOpacity>

      {selected && (
        <>
          <View style={styles.thresholdRow}>
            <Text style={[styles.thresholdLabel, { color: colors.mutedForeground }]}>Warnschwelle:</Text>
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <TextInput
                value={inputValue}
                onChangeText={(v) => setInputValue(v.replace(/[^0-9]/g, ''))}
                onBlur={() => void handleThresholdSave()}
                onSubmitEditing={() => void handleThresholdSave()}
                keyboardType="number-pad"
                returnKeyType="done"
                placeholder="225"
                placeholderTextColor={colors.mutedForeground}
                maxLength={5}
                style={[styles.thresholdInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
              />
            )}
            <Text style={[styles.thresholdUnit, { color: colors.mutedForeground }]}>cm</Text>
            <Switch
              value={setting?.alert_enabled ?? false}
              onValueChange={(v) => { void onToggle(v); }}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={setting?.alert_enabled ? colors.primary : colors.mutedForeground}
            />
          </View>
          <View style={styles.forecastRow}>
            <Feather name="trending-up" size={13} color={forecast.available ? colors.safe : colors.mutedForeground} />
            {forecast.loading ? (
              <Text style={[styles.forecastText, { color: colors.mutedForeground }]}>Vorhersage wird geprüft …</Text>
            ) : forecast.available ? (
              <Text style={[styles.forecastText, { color: colors.safe }]}>
                {forecast.value != null
                  ? `Vorhersage: ${forecast.value} cm${forecast.timestamp ? ` · ${new Date(forecast.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}`
                  : 'Vorhersage verfügbar'}
              </Text>
            ) : (
              <Text style={[styles.forecastText, { color: colors.mutedForeground }]}>Keine Vorhersage verfügbar</Text>
            )}
          </View>
          <Text style={[styles.selectedHint, { color: colors.mutedForeground }]}>Pegel ausgewählt · Warnung {setting?.alert_enabled ? 'AN' : 'AUS'}</Text>
        </>
      )}

      {saveError != null && <Text style={[styles.errorText, { color: colors.destructive ?? '#e53e3e' }]}>{saveError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectorBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  nameBlock: { flex: 1, gap: 1 },
  gaugeName: { fontSize: 14, fontFamily: 'SpaceGrotesk_600SemiBold' },
  gaugeSub: { fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular' },
  thresholdRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 34 },
  thresholdLabel: { fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular', flex: 1 },
  thresholdInput: { fontSize: 14, fontFamily: 'SpaceGrotesk_500Medium', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, borderWidth: 1, minWidth: 70, textAlign: 'center' },
  thresholdUnit: { fontSize: 12, fontFamily: 'SpaceGrotesk_400Regular' },
  forecastRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 34 },
  forecastText: { fontSize: 10, fontFamily: 'SpaceGrotesk_500Medium', flex: 1 },
  selectedHint: { fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular', paddingLeft: 34 },
  errorText: { fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular' },
});
