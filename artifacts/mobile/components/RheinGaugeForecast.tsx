import React from 'react';
import { Linking, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export interface RheinGaugeForecastProps {
  stationId: string | null;
  stationName: string | null;
}

function slugifyStationName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Official forecast source per selected Rhein gauge.
 *
 * We deliberately do not maintain a fixed Maxau/Speyer/Mannheim/Worms map.
 * The selected PEGELONLINE station name is converted to the corresponding
 * official Hochwasser-RLP station URL. This prevents one station's graphic
 * from being reused for another station.
 */
function getOfficialForecastUrl(stationName: string): string {
  const slug = slugifyStationName(stationName);
  // Maxau is the one RLP page that currently exposes the additional /1000
  // route segment; keep this explicit because the official URL is different.
  if (slug === 'maxau') {
    return 'https://www.hochwasser.rlp.de/flussgebiet/oberrhein/maxau/1000';
  }
  return `https://www.hochwasser.rlp.de/flussgebiet/oberrhein/${slug}`;
}

export default function RheinGaugeForecast({ stationId, stationName }: RheinGaugeForecastProps) {
  const colors = useColors();

  if (!stationId || !stationName) {
    return <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Kein Pegel ausgewählt.</Text>;
  }

  const forecastUrl = getOfficialForecastUrl(stationName);
  const openForecast = () => void Linking.openURL(forecastUrl);

  // On web, show the official RLP station page inline. That page contains the
  // current official forecast graphic/table for the selected station.
  if (Platform.OS === 'web') {
    return (
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'SpaceGrotesk_500Medium', letterSpacing: 1, textTransform: 'uppercase' }}>
            Vorhersage · {stationName}
          </Text>
          <TouchableOpacity onPress={openForecast} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>HOCHWASSER RLP</Text>
            <Feather name="external-link" size={10} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        {React.createElement('iframe' as any, {
          key: forecastUrl,
          src: forecastUrl,
          title: `Offizielle Vorhersage ${stationName}`,
          style: {
            width: '100%',
            height: 520,
            border: '0',
            borderRadius: 8,
            backgroundColor: colors.muted,
          },
        })}
        <Text style={{ color: colors.mutedForeground, fontSize: 9, opacity: 0.8 }}>
          Quelle: Hochwasservorhersagezentrale Rheinland-Pfalz · offizieller Pegel {stationName}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: 'SpaceGrotesk_500Medium', letterSpacing: 1, textTransform: 'uppercase' }}>
        Vorhersage · {stationName}
      </Text>
      <TouchableOpacity
        onPress={openForecast}
        activeOpacity={0.8}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 8, backgroundColor: colors.muted }}
      >
        <Text style={{ color: colors.foreground, fontSize: 12 }}>Offizielle Vorhersage öffnen</Text>
        <Feather name="external-link" size={13} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={{ color: colors.mutedForeground, fontSize: 9, opacity: 0.8 }}>
        Quelle: Hochwasservorhersagezentrale Rheinland-Pfalz · offizieller Pegel {stationName}
      </Text>
    </View>
  );
}
