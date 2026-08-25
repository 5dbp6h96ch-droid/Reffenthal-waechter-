import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';

const NEW_APP_URL = 'https://rheinschiffer-prod.5dbp6h96ch.workers.dev/';

export default function HomeScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#101415',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingVertical: 32,
      }}
    >
      <View style={{ width: '100%', maxWidth: 520, alignItems: 'center' }}>
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 28,
            fontWeight: '800',
            textAlign: 'center',
            marginBottom: 18,
          }}
        >
          R(h)einschiffer ist umgezogen
        </Text>

        <Text
          style={{
            color: '#E4E7E7',
            fontSize: 17,
            lineHeight: 25,
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          Diese alte Version wird nicht mehr verwendet. Bitte öffne die neue R(h)einschiffer-App und registriere dich dort einmal neu.
        </Text>

        <Text
          style={{
            color: '#BFC6C7',
            fontSize: 15,
            lineHeight: 22,
            textAlign: 'center',
            marginBottom: 26,
          }}
        >
          Füge anschließend die neue App zu deinem Home-Bildschirm hinzu und lösche diese alte App vom Home-Bildschirm.
        </Text>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => Linking.openURL(NEW_APP_URL)}
          style={{
            width: '100%',
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 18,
            paddingVertical: 15,
            borderRadius: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#101415', fontSize: 16, fontWeight: '800', textAlign: 'center' }}>
            Neue R(h)einschiffer-App öffnen
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
