import React from 'react';
import { Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export interface RheinGaugeForecastProps {
  stationId: string | null;
  stationName: string | null;
}

const PEGELONLINE_CHART = 'https://pegelonline.wsv.de/charts/OnlineVisualisierungGanglinie';

export default function RheinGaugeForecast({ stationId, stationName }: RheinGaugeForecastProps) {
  const colors = useColors();

  if (!stationId) {
    return <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Kein Pegel ausgewählt.</Text>;
  }

  // PEGELONLINE verwendet die UUID als eindeutige und unveränderliche Pegel-ID.
  // Die Grafik wird deshalb direkt aus dieser UUID erzeugt – kein Name-Mapping,
  // keine feste Liste und kein eigener Forecast-Chart.
  const chartUrl = `${PEGELONLINE_CHART}?pegeluuid=${encodeURIComponent(stationId)}&dauer=48;48&imgLinien=2&imgBreite=900&imgHoehe=420&anzeigeVorhersagen=true&anzeigeUeberschrift=false&anzeigeDatenquelle=true&anzeigeKilometer=true`;
  const openChart = () => void Linking.openURL(chartUrl);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'SpaceGrotesk_500Medium', letterSpacing: 1, textTransform: 'uppercase' }}>
          Vorhersage · {stationName ?? 'Rheinpegel'}
        </Text>
        <TouchableOpacity onPress={openChart} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>PEGELONLINE</Text>
          <Feather name="external-link" size={10} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={openChart} activeOpacity={0.9} style={{ borderRadius: 8, overflow: 'hidden', backgroundColor: colors.muted }}>
        <Image
          source={{ uri: chartUrl }}
          style={{ width: '100%', height: 260 }}
          resizeMode="contain"
        />
      </TouchableOpacity>

      <Text style={{ color: colors.mutedForeground, fontSize: 9, opacity: 0.8 }}>
        Quelle: PEGELONLINE · Grafik über die eindeutige Stations-UUID
      </Text>
    </View>
  );
}
