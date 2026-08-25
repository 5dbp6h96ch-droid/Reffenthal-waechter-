import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import OriginalHomeScreen from '@/components/OriginalHomeScreen';

const NEW_APP_URL = 'https://rheinschiffer-prod.5dbp6h96ch.workers.dev/';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          marginHorizontal: 16,
          marginTop: 12,
          marginBottom: 4,
          padding: 14,
          borderRadius: 12,
          backgroundColor: '#EAF5F4',
          borderWidth: 1,
          borderColor: '#B7D8D4',
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#143D45', marginBottom: 6 }}>
          R(h)einschiffer ist umgezogen
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: '#294B50', marginBottom: 10 }}>
          Die neue Version ist verfügbar. Bitte dort einmal neu registrieren und die App anschließend wieder zum Home-Bildschirm hinzufügen.
        </Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => Linking.openURL(NEW_APP_URL)}
          style={{
            alignSelf: 'flex-start',
            backgroundColor: '#143D45',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 9,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
            Neue R(h)einschiffer-App öffnen
          </Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>
        <OriginalHomeScreen />
      </View>
    </View>
  );
}
