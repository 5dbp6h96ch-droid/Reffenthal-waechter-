import React from 'react';
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';

export interface RheinGaugeForecastProps {
  stationId: string | null;
  stationName: string | null;
}

type ForecastPoint = {
  timestamp: string;
  value: number;
  type?: 'forecast' | 'estimate' | string;
  initialized?: string;
};

const BASE = 'https://pegelonline.wsv.de/webservices/rest-api/v2/stations';

function formatForecastTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} · ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function RheinGaugeForecast({ stationId, stationName }: RheinGaugeForecastProps) {
  const colors = useColors();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['rheingauge-forecast', stationId],
    enabled: stationId != null,
    queryFn: async () => {
      const res = await fetch(`${BASE}/${stationId}/WV/measurements.json`);
      if (!res.ok) throw new Error(`PEGELONLINE WV HTTP ${res.status}`);
      const raw = await res.json() as ForecastPoint[];
      return raw
        .filter(p => p && typeof p.timestamp === 'string' && typeof p.value === 'number')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .filter(p => new Date(p.timestamp).getTime() >= Date.now() - 60 * 60 * 1000)
        .slice(0, 10);
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: 1,
  });

  const openPegelOnline = () => {
    if (!stationId) return;
    void Linking.openURL(`${BASE}/${stationId}.json?includeForecastTimeseries=true`);
  };

  if (!stationId) {
    return <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Kein Pegel ausgewählt.</Text>;
  }

  if (isLoading) {
    return <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />;
  }

  if (isError) {
    return (
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 18 }}>
        <Feather name="info" size={18} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center' }}>
          Für {stationName ?? 'diesen Pegel'} ist derzeit keine PEGELONLINE-Wasserstandvorhersage verfügbar.
        </Text>
        <TouchableOpacity onPress={openPegelOnline} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium' }}>PEGELONLINE öffnen</Text>
          <Feather name="external-link" size={12} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void refetch()} activeOpacity={0.7} style={{ marginTop: 2 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Erneut prüfen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data?.length) {
    return (
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 18 }}>
        <Feather name="clock" size={18} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: 'center' }}>
          Vorhersage für {stationName ?? 'diesen Pegel'} vorhanden, aber aktuell ohne zukünftige Werte.
        </Text>
        <TouchableOpacity onPress={openPegelOnline} activeOpacity={0.7}>
          <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium' }}>PEGELONLINE öffnen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'SpaceGrotesk_500Medium', letterSpacing: 1, textTransform: 'uppercase' }}>
          Wasserstandvorhersage · {stationName ?? 'Rhein'}
        </Text>
        <TouchableOpacity onPress={openPegelOnline} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>PEGELONLINE</Text>
          <Feather name="external-link" size={10} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
      <View style={{ gap: 6 }}>
        {data.map((p, i) => (
          <View key={`${p.timestamp}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Feather name={p.type === 'estimate' ? 'help-circle' : 'trending-up'} size={13} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: 'SpaceGrotesk_500Medium' }}>{formatForecastTime(p.timestamp)}</Text>
            </View>
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: 'SpaceGrotesk_600SemiBold' }}>{Math.round(p.value)} cm</Text>
          </View>
        ))}
      </View>
      <Text style={{ color: colors.mutedForeground, fontSize: 9, opacity: 0.8 }}>
        Quelle: PEGELONLINE · WV (Wasserstandvorhersage)
      </Text>
      {/* test trigger */}
    </View>
  );
}
