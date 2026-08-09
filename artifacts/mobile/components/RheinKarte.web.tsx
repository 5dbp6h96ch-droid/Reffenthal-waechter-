/**
 * RheinKarte.web.tsx – Interaktive Rhein-Karte (nur Web/PWA).
 *
 * Bibliothek:  Leaflet 1.9 + react-leaflet (kostenlos, kein API-Key)
 * Kacheln:     OpenStreetMap (freie Lizenz)
 * Marker:      DivIcon (Emoji-Kreise) – vermeidet Leaflet-Image-Probleme
 * Koordinaten: Statische Lookup-Tabelle für Clubs/Pegel/MCK;
 *              Rhein-km → lat/lon Interpolation für NfB-Meldungen.
 * Daten:       Ausschließlich über Props – keine eigenen API-Aufrufe.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView as RNScrollView, Linking } from 'react-native';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// ── Typen ────────────────────────────────────────────────────────────────────
type FilterKey = 'all' | 'pegel' | 'mck' | 'clubs' | 'nfb';

interface NfbRow {
  nfb_id: string;
  titel: string;
  km_von: number | null;
  km_bis: number | null;
  gueltig_ab: string | null;
  gueltig_bis: string | null;
  url: string | null;
  expired?: boolean;
}

interface KnownClub {
  name: string;
  icon: string;
  url: string;
}

interface MckSnapshot {
  source: string;
  petrol: number | null;
  diesel: number | null;
  unit: string;
  sourceDate?: string | null;
}

interface ColorTokens {
  card: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  primary: string;
  background: string;
  radius: number;
}

export interface RheinKarteProps {
  pegelCm: number | null;
  pegelTime: string | null;
  mckData?: MckSnapshot;
  knownClubs: KnownClub[];
  nfbMeldungen: NfbRow[];
  isOffline?: boolean;
  colors: ColorTokens;
}

// ── Rhein-km → [lat, lon] Interpolation ──────────────────────────────────────
// Stützpunkte: exakt verortete Pegelstationen / Kilometermarken des Rheins
const KM_REFS: [number, number, number][] = [
  [149,  48.583,  7.752],  // Strasbourg-Süd
  [163,  48.700,  7.863],  // Gambsheim
  [200,  48.907,  8.082],  // Maxau / Karlsruhe
  [280,  49.104,  8.282],  // Germersheim
  [355,  49.230,  8.360],  // nördlich Germersheim
  [400,  49.316,  8.440],  // Speyer
  [419,  49.468,  8.464],  // Mannheim
  [443,  49.632,  8.374],  // Worms
  [496,  49.950,  8.270],  // Mainz
  [531,  50.033,  8.118],  // Wiesbaden
  [555,  49.982,  7.933],  // Rüdesheim / Bingen
  [590,  50.356,  7.595],  // Koblenz
  [640,  50.728,  7.098],  // Andernach / Bonn
  [659,  50.928,  6.958],  // Köln
  [688,  51.221,  6.777],  // Düsseldorf
  [780,  51.764,  6.389],  // Rees
  [815,  51.870,  6.120],  // Grenze NL-DE
  [900,  52.000,  5.700],  // Niederrhein NL
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

// ── Statische Koordinaten ─────────────────────────────────────────────────────
// Quellen: amtliche Pegelkarten, Yachthafenregister, OpenStreetMap-verified
const CLUB_COORDS: Record<string, [number, number]> = {
  '1. MBC Speyer':                       [49.3180,  8.4450],
  'Yachthafen Speyer':                   [49.3138,  8.4427],
  'YC Otterstadt (Angelhofer Altrhein)': [49.3368,  8.3942],
  'MYCL Kiefweiher':                     [49.4720,  8.5132],
  'WCC Kiefweiher':                      [49.4728,  8.5138],
  'MCK Kurpfalz Mannheim':               [49.4660,  8.5010],
};

const PEGEL_SPEYER: [number, number] = [49.3163, 8.4350]; // Amtliche Pegellage Speyer
const MCK_FUEL:    [number, number] = [49.4660, 8.5010];  // MCK Kurpfalz Altrhein

// ── DivIcon-Marker (keine Bild-Assets benötigt) ───────────────────────────────
function makeIcon(emoji: string, bg: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:32px;height:32px;background:${bg};border:2.5px solid rgba(255,255,255,0.85);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;">${emoji}</div>`,
    iconSize:     [32, 32],
    iconAnchor:   [16, 16],
    popupAnchor:  [0, -18],
    className:    '',
  });
}

const ICONS = {
  pegel: makeIcon('🌊', '#1565C0'),
  mck:   makeIcon('⛽', '#BF360C'),
  club:  makeIcon('⚓', '#1B5E20'),
  nfb:   makeIcon('🚧', '#E65100'),
};

// ── Hilfsfunktion ─────────────────────────────────────────────────────────────
function fmtTime(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// ── Popup-Styles (inline HTML für Leaflet) ────────────────────────────────────
const PS = {
  wrap:  'font-family:system-ui,sans-serif;font-size:13px;line-height:1.5;min-width:160px;max-width:230px;',
  title: 'font-size:14px;font-weight:700;margin-bottom:4px;display:block;',
  muted: 'color:#666;font-size:11px;',
  link:  'color:#1565C0;font-size:12px;text-decoration:none;',
};

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function RheinKarte({
  pegelCm, pegelTime, mckData, knownClubs, nfbMeldungen, isOffline, colors,
}: RheinKarteProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const show = (k: FilterKey) => filter === 'all' || filter === k;

  // NfB: nur Meldungen mit gültigen km-Angaben und nicht abgelaufen
  const nfbMarkers = useMemo(() =>
    nfbMeldungen
      .filter(m => !m.expired && m.km_von !== null && m.km_bis !== null)
      .map(m => {
        const mid = ((m.km_von ?? 0) + (m.km_bis ?? 0)) / 2;
        const [lat, lon] = rheinKmToLatLon(mid);
        return { ...m, lat, lon, mid };
      }),
  [nfbMeldungen]);

  // Clubs: nur mit bekannten Koordinaten
  const clubMarkers = useMemo(() =>
    knownClubs.filter(c => c.name in CLUB_COORDS).map(c => ({ ...c, pos: CLUB_COORDS[c.name] })),
  [knownClubs]);

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
                  backgroundColor: active ? colors.primary : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={{
                  fontSize: 12,
                  fontFamily: 'SpaceGrotesk_500Medium',
                  color: active ? '#FFFFFF' : colors.mutedForeground,
                }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </RNScrollView>

      {/* Karte */}
      <View style={{
        height: 400,
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        position: 'relative',
      }}>
        <MapContainer
          center={[49.9, 8.1]}
          zoom={9}
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore – style prop is valid for MapContainer
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* 🌊 Pegel Speyer */}
          {show('pegel') && pegelCm !== null && (
            <Marker position={PEGEL_SPEYER} icon={ICONS.pegel}>
              <Popup>
                <div style={PS.wrap as React.CSSProperties}>
                  <span style={PS.title as React.CSSProperties}>Pegel Speyer</span>
                  <span style={{ fontSize: '22px', fontWeight: 700, color: '#1565C0' }}>
                    {(pegelCm / 100).toFixed(2)} m
                  </span>
                  <br />
                  <span style={PS.muted as React.CSSProperties}>
                    ({pegelCm} cm) · Aktualisiert: {fmtTime(pegelTime)}
                  </span>
                </div>
              </Popup>
            </Marker>
          )}

          {/* ⛽ MCK Tankstelle */}
          {show('mck') && mckData && (
            <Marker position={MCK_FUEL} icon={ICONS.mck}>
              <Popup>
                <div style={PS.wrap as React.CSSProperties}>
                  <span style={PS.title as React.CSSProperties}>{mckData.source}</span>
                  {mckData.petrol !== null && (
                    <div>⛽ Benzin: <strong>{mckData.petrol.toFixed(2)} {mckData.unit}</strong></div>
                  )}
                  {mckData.diesel !== null && (
                    <div>⛽ Diesel: <strong>{mckData.diesel.toFixed(2)} {mckData.unit}</strong></div>
                  )}
                  {mckData.sourceDate && (
                    <div style={PS.muted as React.CSSProperties}>Stand: {mckData.sourceDate}</div>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* ⚓ Clubs */}
          {show('clubs') && clubMarkers.map(c => (
            <Marker key={c.name} position={c.pos} icon={ICONS.club}>
              <Popup>
                <div style={PS.wrap as React.CSSProperties}>
                  <span style={PS.title as React.CSSProperties}>{c.icon} {c.name}</span>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    style={PS.link as React.CSSProperties}
                  >
                    {c.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* 🚧 NfB-Meldungen */}
          {show('nfb') && nfbMarkers.map(m => (
            <Marker key={m.nfb_id} position={[m.lat, m.lon]} icon={ICONS.nfb}>
              <Popup>
                <div style={PS.wrap as React.CSSProperties}>
                  <span style={{ ...PS.title as React.CSSProperties, fontSize: '13px' }}>
                    {m.titel}
                  </span>
                  <span style={PS.muted as React.CSSProperties}>
                    km {m.km_von} – {m.km_bis}
                    {(m.gueltig_ab || m.gueltig_bis) && (
                      <> · {m.gueltig_ab ?? '?'} – {m.gueltig_bis ?? '?'}</>
                    )}
                  </span>
                  {m.url && (
                    <div style={{ marginTop: '5px' }}>
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        style={PS.link as React.CSSProperties}
                      >
                        Details auf WSV →
                      </a>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

        </MapContainer>
      </View>

      {/* Quellenhinweis */}
      <Text style={{ fontSize: 10, color: colors.mutedForeground, textAlign: 'right' }}>
        Kartendaten © OpenStreetMap-Mitwirkende · Koordinaten: statisch / Rhein-km-Interpolation
      </Text>
    </View>
  );
}
