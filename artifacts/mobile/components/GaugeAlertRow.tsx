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

/**
 * Eine Zeile der Preferences-Liste.
 *
 * Jeder Rheinpegel kann unabhängig als persönliche Preference ausgewählt werden.
 * Die Auswahl wird in public.user_preferred_gauges gespeichert. Die Warnschwelle
 * bleibt davon getrennt und wird wie bisher in user_gauge_settings gespeichert.
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
  selectedHint: { fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular', paddingLeft: 34 },
  errorText: { fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular' },
});
