/**
 * GaugeAlertRow.tsx – Zeile für persönliche Pegelschwelle
 *
 * Zeigt für einen Pegel:
 *   - Pegelname + Fluss
 *   - Schalter (Alarm ein/aus) – wird sofort gespeichert
 *   - Schwellenwert in cm – wird beim Verlassen des Feldes gespeichert
 *
 * Speichert optimistisch lokal und sendet das Update via onToggle / onSaveThreshold.
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, Switch, TextInput, ActivityIndicator, Keyboard,
  StyleSheet,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Gauge, UserGaugeSetting } from '@/app/types/database';

export interface GaugeAlertRowProps {
  gauge: Gauge;
  setting: UserGaugeSetting | null;
  onToggle: (enabled: boolean) => Promise<{ error: string | null }>;
  onSaveThreshold: (cm: number) => Promise<{ error: string | null }>;
}

export function GaugeAlertRow({
  gauge, setting, onToggle, onSaveThreshold,
}: GaugeAlertRowProps) {
  const colors = useColors();

  const [inputValue, setInputValue] = useState(
    setting?.alert_threshold_cm != null ? String(setting.alert_threshold_cm) : '',
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Wenn sich die gespeicherte Schwelle ändert, Input synchronisieren
  useEffect(() => {
    if (setting?.alert_threshold_cm != null) {
      setInputValue(String(setting.alert_threshold_cm));
    }
  }, [setting?.alert_threshold_cm]);

  const handleToggle = async (enabled: boolean) => {
    setSaving(true);
    setSaveError(null);
    const { error } = await onToggle(enabled);
    if (error) setSaveError(error);
    setSaving(false);
  };

  const handleThresholdSave = async () => {
    const cm = parseInt(inputValue, 10);
    if (isNaN(cm) || cm <= 0) {
      // Zurücksetzen auf letzten gültigen Wert
      setInputValue(
        setting?.alert_threshold_cm != null ? String(setting.alert_threshold_cm) : '',
      );
      Keyboard.dismiss();
      return;
    }
    if (cm === setting?.alert_threshold_cm) {
      Keyboard.dismiss();
      return; // Keine Änderung
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
      {/* Kopfzeile: Name + Toggle */}
      <View style={styles.header}>
        <View style={styles.nameBlock}>
          <Text style={[styles.gaugeName, { color: colors.foreground }]} numberOfLines={1}>
            {gauge.name}
          </Text>
          {gauge.river != null && (
            <Text style={[styles.gaugeSub, { color: colors.mutedForeground }]} numberOfLines={1}>
              {[gauge.river, gauge.river_km != null ? `km ${gauge.river_km}` : null]
                .filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>

        {saving ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Switch
            value={setting?.alert_enabled ?? false}
            onValueChange={(v) => { void handleToggle(v); }}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={setting?.alert_enabled ? colors.primary : colors.mutedForeground}
          />
        )}
      </View>

      {/* Schwellenfeld */}
      <View style={styles.thresholdRow}>
        <Text style={[styles.thresholdLabel, { color: colors.mutedForeground }]}>
          Schwelle:
        </Text>
        <TextInput
          value={inputValue}
          onChangeText={(v) => { setInputValue(v.replace(/[^0-9]/g, '')); }}
          onBlur={() => { void handleThresholdSave(); }}
          onSubmitEditing={() => { void handleThresholdSave(); }}
          keyboardType="number-pad"
          returnKeyType="done"
          placeholder="—"
          placeholderTextColor={colors.mutedForeground}
          maxLength={5}
          style={[
            styles.thresholdInput,
            {
              color: colors.foreground,
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        />
        <Text style={[styles.thresholdUnit, { color: colors.mutedForeground }]}>cm</Text>
      </View>

      {/* Fehlermeldung */}
      {saveError != null && (
        <Text style={[styles.errorText, { color: colors.destructive ?? '#e53e3e' }]}>
          {saveError}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameBlock: {
    flex: 1,
    marginRight: 12,
    gap: 1,
  },
  gaugeName: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_600SemiBold',
  },
  gaugeSub: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_400Regular',
  },
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thresholdLabel: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_400Regular',
  },
  thresholdInput: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_500Medium',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    minWidth: 70,
    textAlign: 'center',
  },
  thresholdUnit: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_400Regular',
  },
  errorText: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_400Regular',
  },
});
