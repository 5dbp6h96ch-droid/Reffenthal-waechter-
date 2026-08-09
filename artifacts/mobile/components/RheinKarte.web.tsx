/**
 * RheinKarte.web.tsx – Interaktive Rhein-Karte (nur Web/PWA).
 *
 * Bibliothek:  Leaflet 1.9 + react-leaflet 5 (kein API-Key nötig)
 * Kacheln:     OpenStreetMap (freie Lizenz)
 * Marker:      DivIcon (Emoji-Kreise) – keine externen Bild-Assets
 * Koordinaten: Statische Lookup-Tabelle für Clubs/Pegel/MCK;
 *              Rhein-km → lat/lon Interpolation für NfB-Meldungen.
 * Daten:       Ausschließlich über Props – keine eigenen API-Aufrufe.
 *
 * CSS-Strategie: Leaflet-CSS wird per useEffect in <head> injiziert,
 * da Expo Static Export +html.tsx-Head-Elemente NICHT in die statische
 * index.html rendert. Der useEffect läuft sicher erst im Browser.
 *
 * SSG-Guard: Alles DOM-/window-abhängige (L.divIcon, MapContainer) erst
 * nach dem Mount ausführen. Beim Expo-Static-Export gibt es kein DOM →
 * Komponente gibt null zurück.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView as RNScrollView } from 'react-native';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// ── Typen ────────────────────────────────────────────────────────────────────
type FilterKey = 'all' | 'pegel' | 'mck' | 'clubs' | 'nfb';

// ── Props (identisch mit RheinKarte.tsx-Stub) ─────────────────────────────────
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

// ── Rhein-km → [lat, lon] Interpolation ──────────────────────────────────────
// Stützpunkte: amtlich verortete Pegelstationen / Kilometermarken
const KM_REFS: [number, number, number][] = [
  [149, 48.583,  7.752],  // Strasbourg-Süd
  [163, 48.700,  7.863],  // Gambsheim
  [200, 48.907,  8.082],  // Maxau / Karlsruhe
  [280, 49.104,  8.282],  // Germersheim
  [355, 49.230,  8.360],  // nördlich Germersheim
  [400, 49.316,  8.440],  // Speyer
  [419, 49.468,  8.464],  // Mannheim
  [443, 49.632,  8.374],  // Worms
  [496, 49.950,  8.270],  // Mainz
  [531, 50.033,  8.118],  // Wiesbaden
  [555, 49.982,  7.933],  // Rüdesheim / Bingen
  [590, 50.356,  7.595],  // Koblenz
  [640, 50.728,  7.098],  // Andernach / Bonn
  [659, 50.928,  6.958],  // Köln
  [688, 51.221,  6.777],  // Düsseldorf
  [780, 51.764,  6.389],  // Rees
  [815, 51.870,  6.120],  // Grenze NL-DE
  [900, 52.000,  5.700],  // Niederrhein NL
];

function rheinKmToLatLon(km: number): [number, number] {
  if (km <= KM_REFS[0][0]) return [KM_REFS[0][1], KM_REFS[0][2]];
  const last = KM_REFS[KM_REFS.length - 1];
  if (km >= last[0]) return [last[1], last[2]];
  for (let i = 0; i < KM_REFS.length - 1; i++) {
    const [k0, lat0, lon0] = KM_REFS[i];
    const [k1, lat1, lon1] = KM_REFS[i + 1];
    if (km >= k0 && km <= k1) {
      const t = (km - k0) / (k1 - k0);
      return [lat0 + t * (lat1 - lat0), lon0 + t * (lon1 - lon0)];
    }
  }
  return [KM_REFS[0][1], KM_REFS[0][2]];
}

// ── Statische Koordinaten ──────────────────────────────────────────────────
// Quellen: amtliche Pegelkarten, Yachthafenregister, OpenStreetMap-verifiziert
const CLUB_COORDS: Record<string, [number, number]> = {
  '1. MBC Speyer':                       [49.3180, 8.4450],
  'Yachthafen Speyer':                   [49.3138, 8.4427],
  'YC Otterstadt (Angelhofer Altrhein)': [49.3368, 8.3942],
  'MYCL Kiefweiher':                     [49.4720, 8.5132],
  'WCC Kiefweiher':                      [49.4728, 8.5138],
  'MCK Kurpfalz Mannheim':               [49.4660, 8.5010],
};

const PEGEL_SPEYER: [number, number] = [49.3163, 8.4350];
const MCK_FUEL:    [number, number] = [49.4660, 8.5010];

// ── DivIcon-Fabrik (NUR nach Mount aufrufbar – braucht DOM) ───────────────────
function makeIcon(emoji: string, bg: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:34px;height:34px;background:${bg};border:2.5px solid rgba(255,255,255,0.9);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:pointer;">${emoji}</div>`,
    iconSize:    [34, 34],
    iconAnchor:  [17, 17],
    popupAnchor: [0, -20],
    className:   '',
  });
}

// ── Popup-Inline-Styles (React CSSProperties – NICHT CSS-Strings) ────────────
const PS: Record<string, React.CSSProperties> = {
  wrap:  { fontFamily: 'system-ui,-apple-system,sans-serif', fontSize: '13px', lineHeight: 1.55, minWidth: '170px', maxWidth: '240px' },
  title: { fontSize: '14px', fontWeight: 700, marginBottom: '5px', display: 'block' },
  row:   { margin: '2px 0' },
  muted: { color: '#666', fontSize: '11px' },
  link:  { color: '#1565C0', fontSize: '12px', textDecoration: 'none' },
};

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function fmtPrice(v: number | null | undefined, unit: string): string {
  if (v == null) return '–';
  return `${v.toFixed(3).replace('.', ',')} ${unit}`;
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function RheinKarte({
  pegelCm, pegelTime, mckData, knownClubs, nfbMeldungen, isOffline, colors,
}: RheinKarteProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

  // SSG-Guard: kein DOM beim Expo-Static-Export → erst nach Browser-Mount rendern
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Leaflet CSS per JS in <head> injizieren – Expo Static Export rendert
    // +html.tsx-Head-Elemente NICHT in die statische index.html.
    const CSS_HREF = '/Reffenthal-waechter-/leaflet.css';
    if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
      const link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = CSS_HREF;
      link.id   = 'leaflet-css-runtime';
      document.head.appendChild(link);
    }
    setMounted(true);
  }, []);

  // Icons erst nach Mount erstellen (L.divIcon braucht DOM)
  const icons = useMemo(() => {
    if (!mounted) return null;
    return {
      pegel: makeIcon('🌊', '#1565C0'),
      mck:   makeIcon('⛽', '#BF360C'),
      club:  makeIcon('⚓', '#1B5E20'),
      nfb:   makeIcon('🚧', '#E65100'),
    };
  }, [mounted]);

  // NfB: nur Meldungen mit gültigen km-Angaben, nicht abgelaufen
  const nfbMarkers = useMemo(() =>
    nfbMeldungen
      .filter(m => !m.expired && m.km_von !== null && m.km_bis !== null)
      .map(m => {
        const mid = ((m.km_von ?? 0) + (m.km_bis ?? 0)) / 2;
        const [lat, lon] = rheinKmToLatLon(mid);
        return { ...m, lat, lon };
      }),
  [nfbMeldungen]);

  // Clubs: nur mit bekannten Koordinaten
  const clubMarkers = useMemo(() =>
    knownClubs.filter(c => c.name in CLUB_COORDS).map(c => ({
      ...c,
      pos: CLUB_COORDS[c.name] as [number, number],
    })),
  [knownClubs]);

  if (!mounted || !icons) return null;

  const show = (k: FilterKey) => filter === 'all' || filter === k;

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',   label: 'Alle' },
    { key: 'pegel', label: '🌊 Pegel' },
    { key: 'mck',   label: '⛽ Tankstelle' },
    { key: 'clubs', label: '⚓ Clubs' },
    { key: 'nfb',   label: `🚧 Meldungen${nfbMarkers.length > 0 ? ` (${nfbMarkers.length})` : ''}` },
  ];

  return (
    <View style={{ gap: 10, marginTop: 2 }}>

      {/* Offline-Banner */}
      {isOffline && (
        <View style={{
          backgroundColor: '#FF9500',
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}>
          <Text style={{ fontSize: 12, color: '#FFF', fontFamily: 'SpaceGrotesk_500Medium' }}>
            Offline – Daten vom letzten Abruf
          </Text>
        </View>
      )}

      {/* Filterleiste */}
      <RNScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 2 }}>
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.75}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 99,
                  backgroundColor: active ? colors.primary as string : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? colors.primary as string : colors.border as string,
                }}
              >
                <Text style={{
                  fontSize: 12,
                  fontFamily: 'SpaceGrotesk_500Medium',
                  color: active ? '#FFFFFF' : colors.mutedForeground as string,
                }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </RNScrollView>

      {/* Karte – feste Höhe 400px (Pflicht für Leaflet) */}
      <View style={{
        height: 400,
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border as string,
      }}>
        <MapContainer
          center={[49.4, 8.4]}
          zoom={9}
          // @ts-ignore – style ist ein gültiges Leaflet-MapContainer-Prop
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* 🌊 Pegel Speyer */}
          {show('pegel') && pegelCm !== null && (
            <Marker position={PEGEL_SPEYER} icon={icons.pegel}>
              <Popup>
                <div style={PS.wrap}>
                  <span style={PS.title}>🌊 Pegel Speyer</span>
                  <div style={PS.row}>
                    <span style={{ fontSize: '22px', fontWeight: 700, color: '#1565C0' }}>
                      {(pegelCm / 100).toFixed(2)} m
                    </span>
                    <span style={{ color: '#666', fontSize: '11px', marginLeft: '6px' }}>
                      ({pegelCm} cm)
                    </span>
                  </div>
                  <div style={PS.muted}>
                    Aktualisiert: {fmtTime(pegelTime)}
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {/* ⛽ MCK Tankstelle */}
          {show('mck') && mckData && (
            <Marker position={MCK_FUEL} icon={icons.mck}>
              <Popup>
                <div style={PS.wrap}>
                  <span style={PS.title}>⛽ {mckData.source}</span>
                  {mckData.petrol !== null && (
                    <div style={PS.row}>
                      Benzin: <strong>{fmtPrice(mckData.petrol, mckData.unit)}</strong>
                    </div>
                  )}
                  {mckData.diesel !== null && (
                    <div style={PS.row}>
                      Diesel: <strong>{fmtPrice(mckData.diesel, mckData.unit)}</strong>
                    </div>
                  )}
                  {mckData.sourceDate && (
                    <div style={PS.muted}>Stand: {mckData.sourceDate}</div>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* ⚓ Clubs */}
          {show('clubs') && clubMarkers.map(c => (
            <Marker key={c.name} position={c.pos} icon={icons.club}>
              <Popup>
                <div style={PS.wrap}>
                  <span style={PS.title}>{c.icon} {c.name}</span>
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      style={PS.link}
                    >
                      {c.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* 🚧 NfB-Meldungen */}
          {show('nfb') && nfbMarkers.map(m => (
            <Marker key={m.nfb_id} position={[m.lat, m.lon]} icon={icons.nfb}>
              <Popup>
                <div style={PS.wrap}>
                  <span style={{ ...PS.title, fontSize: '13px' }}>
                    🚧 {m.titel}
                  </span>
                  <div style={PS.row}>
                    km {m.km_von} – {m.km_bis}
                  </div>
                  {(m.gueltig_ab || m.gueltig_bis) && (
                    <div style={PS.muted}>
                      Gültig: {m.gueltig_ab ?? '?'} – {m.gueltig_bis ?? '?'}
                    </div>
                  )}
                  {m.url ? (
                    <div style={{ marginTop: '5px' }}>
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        style={PS.link}
                      >
                        Details auf WSV →
                      </a>
                    </div>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          ))}

        </MapContainer>
      </View>

      {/* Quellenhinweis */}
      <Text style={{ fontSize: 10, color: colors.mutedForeground as string, textAlign: 'right' }}>
        Kartendaten © OpenStreetMap-Mitwirkende · Koordinaten: Pegelkarten / Rhein-km-Interpolation
      </Text>
    </View>
  );
}
