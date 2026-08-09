/**
 * RheinKarte.web.tsx – Minimaler Leaflet-Test (nur Web/PWA).
 *
 * MINIMAL: Nur MapContainer + TileLayer, keine Marker, keine Daten.
 * Ziel: Sicherstellen dass Leaflet grundsätzlich rendert.
 *
 * CSS-Strategie: Leaflet-CSS wird per useEffect in document.head injiziert,
 * weil Expo Static Export die +html.tsx-Head-Elemente NICHT in die statische
 * index.html rendert. Der useEffect läuft nach dem Mount im Browser.
 */
import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { MapContainer, TileLayer } from 'react-leaflet';

// ── Props (identisch mit RheinKarte.tsx-Stub – TypeScript-Kompatibilität) ─────
export interface RheinKarteProps {
  pegelCm: number | null;
  pegelTime: string | null;
  mckData?: {
    source: string;
    petrol: number | null;
    diesel: number | null;
    unit: string;
    sourceDate?: string | null;
  };
  knownClubs: { name: string; icon: string; url: string }[];
  nfbMeldungen: {
    nfb_id: string;
    titel: string;
    km_von: number | null;
    km_bis: number | null;
    gueltig_ab: string | null;
    gueltig_bis: string | null;
    url: string | null;
    expired?: boolean;
  }[];
  isOffline?: boolean;
  colors: {
    card: string;
    foreground: string;
    mutedForeground: string;
    border: string;
    primary: string;
    background: string;
    radius: number;
    [key: string]: unknown;
  };
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function RheinKarte({ colors }: RheinKarteProps) {
  // SSG-Guard: Leaflet braucht window + DOM.
  // Beim Expo-Static-Export kein Fenster → null zurückgeben.
  // Im Browser: nach dem Mount rendern.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Leaflet CSS per JavaScript in <head> injizieren.
    // Nötig weil Expo Static Export +html.tsx-Head-Elemente nicht in die
    // statische index.html rendert → CSS muss zur Laufzeit geladen werden.
    const CSS_HREF = '/Reffenthal-waechter-/leaflet.css';
    if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_HREF;
      link.id = 'leaflet-css-runtime';
      document.head.appendChild(link);
    }
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <View style={{ gap: 8, marginTop: 2 }}>
      {/* Kartenbehälter – feste Höhe 400px ist Pflicht für Leaflet */}
      <View
        style={{
          height: 400,
          borderRadius: 10,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <MapContainer
          center={[49.4, 8.4]}
          zoom={9}
          // @ts-ignore – style ist ein gültiges Leaflet-Prop
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </MapContainer>
      </View>

      <Text style={{ fontSize: 10, color: colors.mutedForeground, textAlign: 'right' }}>
        Kartendaten © OpenStreetMap-Mitwirkende
      </Text>
    </View>
  );
}
