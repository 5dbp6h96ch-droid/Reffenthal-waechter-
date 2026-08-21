/**
 * RheinKarte.web.tsx – Interaktive Rhein-Karte (nur Web/PWA).
 *
 * Bibliothek: Leaflet 1.9 + react-leaflet 5 (kein API-Key nötig)
 * Basis: OpenStreetMap + OpenSeaMap-Seamarks
 * Marker: Pegel, Tankstelle, Clubs, Marinas und geografisch eindeutige NfB.
 *
 * Marina-Daten werden zentral aus data/marinas.ts gelesen. Dadurch gibt es
 * keinen parallelen Laufzeit-Abruf und die Koordinaten bleiben nachvollziehbar.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView as RNScrollView,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { MARINAS } from '@/data/marinas';

// ── Typen ────────────────────────────────────────────────────────────────────
type FilterKey = 'all' | 'pegel' | 'mck' | 'clubs' | 'marinas' | 'nfb';

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

// ── Rhein-km → [lat, lon] Interpolation für NfB ─────────────────────────────
const KM_REFS: [number, number, number][] = [
  [166.0, 47.558, 7.588],
  [228.0, 48.022, 7.563],
  [291.0, 48.587, 7.768],
  [362.327, 49.038977, 8.305564],
  [400.610, 49.323807, 8.448705],
  [424.733, 49.483940, 8.455165],
  [443.370, 49.631837, 8.377519],
  [498.270, 50.003995, 8.275319],
  [528.360, 49.970342, 7.899668],
  [546.230, 50.085438, 7.764962],
  [591.490, 50.358640, 7.604741],
  [654.800, 50.736398, 7.108045],
  [688.0, 50.960, 6.790],
  [814.000, 51.646143, 6.606820],
  [862.000, 51.849827, 6.112447],
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

// ── Bestehende statische Marker ─────────────────────────────────────────────
const CLUB_COORDS: Record<string, [number, number]> = {
  '1. MBC Speyer': [49.3658717, 8.4740140],
  'Yachthafen Speyer': [49.3195801, 8.4468747],
  'YC Otterstadt (Angelhofer Altrhein)': [49.3598200, 8.4756122],
  'MYCL Kiefweiher': [49.4403332, 8.4517300],
  'WCC Kiefweiher': [49.4419289, 8.4593312],
  'MCK Kurpfalz Mannheim': [49.4164899, 8.5014938],
};

const PEGEL_SPEYER: [number, number] = [49.323807, 8.448705];
const MCK_FUEL: [number, number] = [49.4164899, 8.5014938];

function makeIcon(emoji: string, bg: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:34px;height:34px;background:${bg};border:2.5px solid rgba(255,255,255,0.9);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:pointer;">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
    className: '',
  });
}

const PS: Record<string, React.CSSProperties> = {
  wrap: {
    fontFamily: 'system-ui,-apple-system,sans-serif',
    fontSize: '13px',
    lineHeight: 1.55,
    minWidth: '180px',
    maxWidth: '260px',
  },
  title: { fontSize: '14px', fontWeight: 700, marginBottom: '5px', display: 'block' },
  row: { margin: '2px 0' },
  muted: { color: '#666', fontSize: '11px' },
  link: { color: '#1565C0', fontSize: '12px', textDecoration: 'none' },
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function fmtPrice(v: number | null | undefined, unit: string): string {
  if (v == null) return '–';
  return `${v.toFixed(3).replace('.', ',')} ${unit}`;
}

export default function RheinKarte({
  pegelCm,
  pegelTime,
  mckData,
  knownClubs,
  nfbMeldungen,
  isOffline,
  colors,
}: RheinKarteProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [seamarkError, setSeamarkError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [marinaListOpen, setMarinaListOpen] = useState(false);
  const [expandedMarinaId, setExpandedMarinaId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const insets = useSafeAreaInsets();
  const mapRef = useRef<L.Map | null>(null);
  const outerRef = useRef<HTMLElement | null>(null);
  const slotRef = useRef<Comment | null>(null);

  useEffect(() => {
    const el = outerRef.current;
    if (typeof document !== 'undefined' && el) {
      const host = document.getElementById('root') ?? document.body;
      if (fullscreen && el.parentNode && el.parentNode !== host) {
        const slot = document.createComment('rheinkarte-slot');
        slotRef.current = slot;
        el.parentNode.insertBefore(slot, el);
        host.appendChild(el);
        el.style.position = 'fixed';
        el.style.top = '0';
        el.style.left = '0';
        el.style.width = '100vw';
        el.style.height =
          (typeof CSS !== 'undefined' && CSS.supports?.('height', '100dvh'))
            ? '100dvh'
            : '100vh';
        el.style.zIndex = '100000';
      } else if (!fullscreen && slotRef.current) {
        const slot = slotRef.current;
        slotRef.current = null;
        slot.parentNode?.insertBefore(el, slot);
        slot.remove();
        el.style.position = '';
        el.style.top = '';
        el.style.left = '';
        el.style.width = '';
        el.style.height = '';
        el.style.zIndex = '';
      }
    }

    const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    if (typeof document !== 'undefined' && fullscreen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        clearTimeout(t);
        document.body.style.overflow = prev;
      };
    }
    return () => clearTimeout(t);
  }, [fullscreen]);

  useEffect(() => () => {
    const el = outerRef.current;
    const slot = slotRef.current;
    if (el && slot?.parentNode) slot.parentNode.insertBefore(el, slot);
    slot?.remove();
  }, []);

  useEffect(() => {
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

  const icons = useMemo(() => {
    if (!mounted) return null;
    return {
      pegel: makeIcon('🌊', '#1565C0'),
      mck: makeIcon('⛽', '#BF360C'),
      club: makeIcon('👥', '#1B5E20'),
      marina: makeIcon('⚓', '#00695C'),
      nfb: makeIcon('🚧', '#E65100'),
    };
  }, [mounted]);

  const nfbMarkers = useMemo(() =>
    nfbMeldungen
      .filter((m) => !m.expired && m.km_von !== null && m.km_bis !== null)
      .map((m) => {
        const mid = ((m.km_von ?? 0) + (m.km_bis ?? 0)) / 2;
        const [lat, lon] = rheinKmToLatLon(mid);
        return { ...m, lat, lon };
      }),
  [nfbMeldungen]);

  const clubMarkers = useMemo(() =>
    knownClubs
      .filter((c) => c.name in CLUB_COORDS)
      .map((c) => ({ ...c, pos: CLUB_COORDS[c.name] as [number, number] })),
  [knownClubs]);

  // Beim Marina-Filter den gesamten statischen Marina-Bestand sichtbar machen.
  useEffect(() => {
    if (!mounted || filter !== 'marinas' || !mapRef.current || MARINAS.length === 0) return;
    const bounds = L.latLngBounds(MARINAS.map((m) => [m.lat, m.lon] as [number, number]));
    mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 9 });
  }, [filter, mounted]);

  if (!mounted || !icons) return null;

  const show = (k: FilterKey) => filter === 'all' || filter === k;
  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'Alle' },
    { key: 'pegel', label: '🌊 Pegel' },
    { key: 'mck', label: '⛽ Tankstelle' },
    { key: 'clubs', label: '👥 Clubs' },
    { key: 'marinas', label: `⚓ Marinas (${MARINAS.length})` },
    { key: 'nfb', label: `🚧 Meldungen${nfbMarkers.length > 0 ? ` (${nfbMarkers.length})` : ''}` },
  ];

  return (
    <View
      // @ts-expect-error – react-native-web liefert hier das DOM-Element
      ref={outerRef}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style={fullscreen ? ({
        // @ts-expect-error 'fixed' ist auf react-native-web gültig
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100000,
        backgroundColor: 'rgba(0,0,0,0.88)',
        paddingTop: Math.max(insets.top, 10) + 6,
        paddingBottom: Math.max(insets.bottom, 10),
        paddingLeft: Math.max(insets.left, 10),
        paddingRight: Math.max(insets.right, 10),
        gap: 10,
      } as any) : { gap: 10, marginTop: 2 }}
    >
      {fullscreen && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 15, color: '#FFFFFF', fontFamily: 'SpaceGrotesk_600SemiBold' }}>
            Rhein-Karte
          </Text>
          <TouchableOpacity
            onPress={() => setFullscreen(false)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 20, color: '#FFFFFF', lineHeight: 22 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {isOffline && (
        <View style={{ backgroundColor: '#FF9500', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ fontSize: 12, color: '#FFF', fontFamily: 'SpaceGrotesk_500Medium' }}>
            Offline – Daten vom letzten Abruf
          </Text>
        </View>
      )}

      <RNScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 2 }}>
          {FILTERS.map((f) => {
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

      {seamarkError && (
        <View style={{ backgroundColor: '#FF9500', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 }}>
          <Text style={{ fontSize: 12, color: '#FFF', fontFamily: 'SpaceGrotesk_500Medium' }}>
            ⚓ Nautische Karte momentan nicht verfügbar.
          </Text>
        </View>
      )}

      <View style={{
        ...(fullscreen ? { flex: 1 } : { height: 400 }),
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: fullscreen ? 'rgba(255,255,255,0.25)' : (colors.border as string),
      }}>
        <MapContainer
          center={[49.4, 8.4]}
          zoom={9}
          // @ts-ignore react-leaflet ref
          ref={mapRef}
          // @ts-ignore Leaflet style prop
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <TileLayer
            url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openseamap.org" target="_blank" rel="noreferrer">OpenSeaMap</a> contributors (CC BY-SA 2.0)'
            opacity={1}
            eventHandlers={{
              tileerror: () => setSeamarkError(true),
              tileload: () => setSeamarkError(false),
            }}
          />

          {show('pegel') && pegelCm !== null && (
            <Marker position={PEGEL_SPEYER} icon={icons.pegel}>
              <Popup>
                <div style={PS.wrap}>
                  <span style={PS.title}>🌊 Pegel Speyer</span>
                  <div style={PS.row}>
                    <span style={{ fontSize: '22px', fontWeight: 700, color: '#1565C0' }}>
                      {(pegelCm / 100).toFixed(2)} m
                    </span>
                    <span style={{ color: '#666', fontSize: '11px', marginLeft: '6px' }}>({pegelCm} cm)</span>
                  </div>
                  <div style={PS.muted}>Aktualisiert: {fmtTime(pegelTime)}</div>
                </div>
              </Popup>
            </Marker>
          )}

          {show('mck') && mckData && (
            <Marker position={MCK_FUEL} icon={icons.mck}>
              <Popup>
                <div style={PS.wrap}>
                  <span style={PS.title}>⛽ {mckData.source}</span>
                  {mckData.petrol !== null && <div style={PS.row}>Benzin: <strong>{fmtPrice(mckData.petrol, mckData.unit)}</strong></div>}
                  {mckData.diesel !== null && <div style={PS.row}>Diesel: <strong>{fmtPrice(mckData.diesel, mckData.unit)}</strong></div>}
                  {mckData.sourceDate && <div style={PS.muted}>Stand: {mckData.sourceDate}</div>}
                </div>
              </Popup>
            </Marker>
          )}

          {show('clubs') && clubMarkers.map((c) => (
            <Marker key={c.name} position={c.pos} icon={icons.club}>
              <Popup>
                <div style={PS.wrap}>
                  <span style={PS.title}>{c.icon} {c.name}</span>
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer" style={PS.link}>
                      {c.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          ))}

          {show('marinas') && MARINAS.map((m) => (
            <Marker key={m.id} position={[m.lat, m.lon]} icon={icons.marina}>
              <Popup>
                <div style={PS.wrap}>
                  <span style={PS.title}>⚓ {m.name}</span>
                  <div style={PS.row}>{m.ort}</div>
                  {m.details ? <div style={{ ...PS.muted, marginTop: '4px' }}>{m.details}</div> : null}
                  {m.website ? (
                    <div style={{ marginTop: '6px' }}>
                      <a href={m.website} target="_blank" rel="noreferrer" style={PS.link}>
                        Website öffnen →
                      </a>
                    </div>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          ))}

          {show('nfb') && nfbMarkers.map((m) => (
            <Marker key={m.nfb_id} position={[m.lat, m.lon]} icon={icons.nfb}>
              <Popup>
                <div style={PS.wrap}>
                  <span style={{ ...PS.title, fontSize: '13px' }}>🚧 {m.titel}</span>
                  <div style={PS.row}>km {m.km_von} – {m.km_bis}</div>
                  {(m.gueltig_ab || m.gueltig_bis) && (
                    <div style={PS.muted}>Gültig: {m.gueltig_ab ?? '?'} – {m.gueltig_bis ?? '?'}</div>
                  )}
                  {m.url ? (
                    <div style={{ marginTop: '5px' }}>
                      <a href={m.url} target="_blank" rel="noreferrer" style={PS.link}>Details auf WSV →</a>
                    </div>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {!fullscreen && (
          <TouchableOpacity
            onPress={() => setFullscreen(true)}
            activeOpacity={0.85}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000,
              backgroundColor: 'transparent',
            } as any}
          >
            <View style={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}>
              <Text style={{ fontSize: 12, color: '#FFFFFF', fontFamily: 'SpaceGrotesk_500Medium' }}>
                ⤢ Vergrößern
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Kompakt im App-Stil: Hauptinfo zuerst, Details erst nach Tipp. */}
      {!fullscreen && (filter === 'all' || filter === 'marinas') && (
        <View style={{
          borderWidth: 1,
          borderColor: colors.border as string,
          borderRadius: Math.max(8, (colors.radius as number) - 2),
          overflow: 'hidden',
          backgroundColor: colors.card as string,
        }}>
          <TouchableOpacity
            onPress={() => setMarinaListOpen((v) => !v)}
            activeOpacity={0.7}
            style={{
              minHeight: 46,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16 }}>⚓</Text>
              <View>
                <Text style={{ fontSize: 13, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.foreground as string }}>
                  Marinas am Rhein
                </Text>
                <Text style={{ fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground as string }}>
                  {MARINAS.length} verortete Einträge
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 16, color: colors.mutedForeground as string }}>{marinaListOpen ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {marinaListOpen && (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.border as string }}>
              {MARINAS.map((m, index) => {
                const expanded = expandedMarinaId === m.id;
                return (
                  <View
                    key={m.id}
                    style={{
                      borderBottomWidth: index === MARINAS.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border as string,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => setExpandedMarinaId(expanded ? null : m.id)}
                      activeOpacity={0.7}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 12, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.foreground as string }}
                        >
                          {m.name}
                        </Text>
                        <Text style={{ fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground as string, marginTop: 1 }}>
                          {m.ort}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, color: colors.mutedForeground as string }}>{expanded ? '⌃' : '⌄'}</Text>
                    </TouchableOpacity>

                    {expanded && (
                      <View style={{
                        paddingHorizontal: 12,
                        paddingBottom: 11,
                        gap: 6,
                        backgroundColor: colors.background as string,
                      }}>
                        {m.details ? (
                          <Text style={{ fontSize: 11, lineHeight: 16, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground as string }}>
                            {m.details}
                          </Text>
                        ) : null}
                        <Text style={{ fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground as string }}>
                          Koordinaten: {m.lat.toFixed(5)}, {m.lon.toFixed(5)}
                        </Text>
                        {m.website ? (
                          <TouchableOpacity
                            onPress={() => void Linking.openURL(m.website!)}
                            activeOpacity={0.65}
                            style={{ alignSelf: 'flex-start' }}
                          >
                            <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_600SemiBold', color: colors.primary as string }}>
                              Website öffnen ↗
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      <Text style={{ fontSize: 10, color: colors.mutedForeground as string, textAlign: 'right' }}>
        © OpenStreetMap-Mitwirkende · © OpenSeaMap contributors (CC BY-SA 2.0)
      </Text>
    </View>
  );
}
