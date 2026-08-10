/**
 * test.tsx – Testumgebung R(h)einschiffer
 *
 * Dies ist eine 1:1-Kopie der Produktionsversion (index.tsx), ergänzt
 * um ein klar sichtbares TEST-Banner im Header.
 *
 * Technische Umsetzung:
 *   HomeScreen wird direkt aus index.tsx importiert – keine Code-Duplizierung.
 *   Änderungen an index.tsx (Produktion) wirken sich automatisch auch auf
 *   die Testumgebung aus.
 *
 * WICHTIG:
 *   - Diese Datei lebt ausschließlich auf dem `test`-Branch.
 *   - Kein Merge nach main ohne ausdrückliche Freigabe.
 *   - Neue Features werden hier getestet, dann nach Freigabe in index.tsx übernommen.
 *   - index.tsx (Produktion) darf niemals direkt für Test-Features verändert werden.
 *
 * Route:   /test/
 * URL:     https://5dbp6h96ch-droid.github.io/Reffenthal-waechter-/test/
 */

import React from 'react';
import { View, Text } from 'react-native';
import HomeScreen from './index';

export default function TestEnvironment() {
  return (
    <View style={{ flex: 1 }}>

      {/* ── TEST-Kennzeichnung ─────────────────────────────────────────────
          Dauerhaft sichtbares rotes Banner – macht klar: dies ist NICHT die
          Produktion. Wird nach Freigabe neuer Features in index.tsx übernommen.
          ───────────────────────────────────────────────────────────────── */}
      <View style={{
        backgroundColor: '#CC0000',
        paddingVertical: 5,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        zIndex: 9999,
      }}>
        <Text style={{
          fontSize: 11,
          color: '#FFFFFF',
          fontFamily: 'SpaceGrotesk_700Bold',
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}>
          ⚠ TESTUMGEBUNG – nicht produktiv
        </Text>
      </View>

      {/* ── 1:1-Produktionsversion ─────────────────────────────────────── */}
      <HomeScreen />

    </View>
  );
}
