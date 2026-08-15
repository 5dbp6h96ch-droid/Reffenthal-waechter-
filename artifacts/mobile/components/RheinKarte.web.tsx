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
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView as RNScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
// Quellen:
//   WSV  = amtliche WSV PEGELONLINE REST-API (exakt, Stand 2026-08-09)
//          https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/<NAME>.json
//   OSM  = OpenStreetMap / Overpass API (verifiziert, Stand 2026-08-09)
//   EST  = Schätzung anhand Satellitenbild (nur für Bereiche ohne WSV-Station)
//
// Stützpunkte sind aufsteigend nach Rhein-km geordnet (Basel → Nordsee).
const KM_REFS: [number, number, number][] = [
  // --- Oberrhein / Elsass (EST – kein WSV-Pegel abgefragt) ---
  [166.0,  47.558,  7.588],  // Basel                 (EST – Dreiländerbrücke)
  [228.0,  48.022,  7.563],  // Breisach              (EST)
  [291.0,  48.587,  7.768],  // Kehl / Strasbourg     (EST)
  // --- Mittelrhein / Oberrhein DE (WSV PEGELONLINE, exakt) ---
  [362.327, 49.038977, 8.305564],  // MAXAU (Karlsruhe)  WSV
  [400.610, 49.323807, 8.448705],  // SPEYER             WSV
  [424.733, 49.483940, 8.455165],  // MANNHEIM           WSV
  [443.370, 49.631837, 8.377519],  // WORMS              WSV
  [498.270, 50.003995, 8.275319],  // MAINZ              WSV
  [528.360, 49.970342, 7.899668],  // BINGEN             WSV
  [546.230, 50.085438, 7.764962],  // KAUB               WSV
  [591.490, 50.358640, 7.604741],  // KOBLENZ            WSV
  [654.800, 50.736398, 7.108045],  // BONN               WSV
  // --- Niederrhein (EST zwischen WSV-Punkten) ---
  [688.0,   50.960,   6.790],     // Köln               (EST)
  [814.000, 51.646143, 6.606820], // WESEL              WSV
  [862.000, 51.849827, 6.112447], // LOBITH (NL-Grenze) WSV
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
// Quellen und Genauigkeit:
//
//   PEGEL_SPEYER  WSV PEGELONLINE REST-API, Station "SPEYER", exakt
//                 https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/SPEYER.json
//                 Rhein-km 400.61
//
//   MCK_FUEL      OpenStreetMap Node 2126207931 "MCK Motoryacht-Club Kurpfalz Mannheim"
//                 (email: info@mck-mannheim.com · website: mck-mannheim.com)
//                 Die Kraftstoffabgabe erfolgt am Steg der MCK-Marina (Altrhein Mannheim-Süd).
//
// Club-Koordinaten – alle via OSM/Nominatim verifiziert (Stand 2026-08-09):
//
//   '1. MBC Speyer'       OSM Way 111093673 "1. MBC Speyer" (leisure=marina)
//                         Birkenweg / Tannenweg, Speyer-Rheinauen
//
//   'Yachthafen Speyer'   OSM Way 75605471 "Yachthafen Speyer" (leisure=marina)
//                         Hafenstraße, Kernstadt-Süd, Speyer
//                         Nominatim: https://nominatim.openstreetmap.org/search?q=Yachthafen+Speyer
//
//   'YC Otterstadt (Angelhofer Altrhein)'
//                         OSM Way 712400725 "YCOA Yacht-Club Otterstadt im Angelwald" (leisure=marina)
//                         Lärchenweg, Otterstadt, Rheinauen – Kurzname YCOA = ycoa.de
//                         Nominatim: https://nominatim.openstreetmap.org/search?q=Otterstadt+marina+Rhein
//
//   'MYCL Kiefweiher'     OSM Way 47040265 "Motor-Yacht-Club Ludwigshafen"
//                         Website: www.mycl.de – Kiefweiher-Anlage, Ludwigshafen
//
//   'WCC Kiefweiher'      OSM Way 47042848 "Wasser- und Campingclub Mannheim Ludwigshafen"
//                         Kiefweiher, Ludwigshafen-Rheingönheim
//                         Overpass: way/47042848 (tourism=camp_site + sport)
//
//   'MCK Kurpfalz Mannheim' OSM Node 2126207931 (identisch mit MCK_FUEL)
const CLUB_COORDS: Record<string, [number, number]> = {
  '1. MBC Speyer':                       [49.3658717, 8.4740140],  // OSM Way 111093673
  'Yachthafen Speyer':                   [49.3195801, 8.4468747],  // OSM Way 75605471
  'YC Otterstadt (Angelhofer Altrhein)': [49.3598200, 8.4756122],  // OSM Way 712400725
  'MYCL Kiefweiher':                     [49.4403332, 8.4517300],  // OSM Way 47040265
  'WCC Kiefweiher':                      [49.4419289, 8.4593312],  // OSM Way 47042848
  'MCK Kurpfalz Mannheim':               [49.4164899, 8.5014938],  // OSM Node 2126207931
};

// Pegel Speyer – WSV PEGELONLINE, Station "SPEYER", Rhein-km 400.61
const PEGEL_SPEYER: [number, number] = [49.323807, 8.448705];
// MCK Motoryacht-Club Kurpfalz Mannheim – OSM Node 2126207931
const MCK_FUEL:    [number, number] = [49.4164899, 8.5014938];

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
  const [filter,       setFilter]       = useState<FilterKey>('all');
  /** true = mindestens eine Seamark-Kachel konnte nicht geladen werden */
  const [seamarkError, setSeamarkError] = useState(false);

  // ── Vollbild-Modus ─────────────────────────────────────────────────────────
  // DIESELBE Karteninstanz wird per CSS auf Vollbild geschaltet – dadurch
  // bleiben aktuelle Position und Zoom automatisch erhalten (keine zweite
  // Instanz). Leaflet braucht danach nur ein invalidateSize().
  const [fullscreen, setFullscreen] = useState(false);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<L.Map | null>(null);
  // DOM-Knoten des äußeren Containers (react-native-web liefert das Element).
  const outerRef = useRef<HTMLElement | null>(null);
  // Platzhalter, der die ursprüngliche Position im DOM markiert, solange der
  // Container für den Vollbildmodus nach document.body verschoben ist.
  const slotRef = useRef<Comment | null>(null);

  useEffect(() => {
    // iOS-Fix: position:fixed ist NICHT viewport-relativ, wenn irgendein
    // Vorfahre eine CSS-Transform hat (auf dem iPhone lag das Overlay dadurch
    // außerhalb des sichtbaren Bereichs, X unerreichbar). Deshalb wird der
    // Container – MIT der bestehenden, unveränderten Karteninstanz darin –
    // für die Dauer des Vollbildmodus direkt nach document.body verschoben
    // und beim Schließen an die ursprüngliche Stelle zurückgesetzt.
    // Leaflet übersteht das DOM-Verschieben; es braucht nur invalidateSize().
    const el = outerRef.current;
    if (typeof document !== 'undefined' && el) {
      // Ziel ist das React-Root-Element (#root), NICHT document.body:
      // React delegiert alle Events am Root-Container – außerhalb davon
      // würden onPress-Handler (z. B. das X) nicht mehr feuern.
      const host = document.getElementById('root') ?? document.body;
      if (fullscreen && el.parentNode && el.parentNode !== host) {
        const slot = document.createComment('rheinkarte-slot');
        slotRef.current = slot;
        el.parentNode.insertBefore(slot, el);
        host.appendChild(el);
        // Wirklich viewportfüllend: 100vw × 100dvh (Fallback 100vh).
        el.style.position = 'fixed';
        el.style.top = '0'; el.style.left = '0';
        el.style.width = '100vw';
        el.style.height =
          (typeof CSS !== 'undefined' && CSS.supports?.('height', '100dvh'))
            ? '100dvh' : '100vh';
        el.style.zIndex = '100000';
      } else if (!fullscreen && slotRef.current) {
        const slot = slotRef.current;
        slotRef.current = null;
        slot.parentNode?.insertBefore(el, slot);
        slot.remove();
        // Inline-Styles des Vollbildmodus wieder entfernen.
        el.style.position = ''; el.style.top = ''; el.style.left = '';
        el.style.width = ''; el.style.height = ''; el.style.zIndex = '';
      }
    }
    // Nach dem Umschalten Kartengröße neu berechnen …
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    // … und Hintergrund-Scroll sperren, solange das Overlay offen ist.
    if (typeof document !== 'undefined') {
      if (fullscreen) {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { clearTimeout(t); document.body.style.overflow = prev; };
      }
    }
    return () => clearTimeout(t);
  }, [fullscreen]);

  // Sicherheitsnetz: Wird die Komponente im Vollbildmodus unmounted, den
  // nach body verschobenen Knoten und den Platzhalter aufräumen.
  useEffect(() => () => {
    const el = outerRef.current;
    const slot = slotRef.current;
    if (el && slot?.parentNode) {
      slot.parentNode.insertBefore(el, slot);
    }
    slot?.remove();
  }, []);

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
    <View
      // Vollbild: DERSELBE Baum (inkl. Karteninstanz) wird per CSS-Position
      // auf den ganzen Viewport gelegt – Position/Zoom bleiben erhalten.
      // Der DOM-Knoten wird dabei nach document.body verschoben (iOS-Fix,
      // siehe Effekt oben).
      // @ts-expect-error – auf Web liefert der ref das DOM-Element
      ref={outerRef}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style={fullscreen ? ({
        // @ts-expect-error 'fixed' ist auf react-native-web gültig
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 100000,
        backgroundColor: 'rgba(0,0,0,0.88)',
        paddingTop: Math.max(insets.top, 10) + 6,
        paddingBottom: Math.max(insets.bottom, 10),
        paddingLeft: Math.max(insets.left, 10),
        paddingRight: Math.max(insets.right, 10),
        gap: 10,
      } as any) : { gap: 10, marginTop: 2 }}
    >

      {/* Vollbild: Kopfzeile mit X (auch bei Notch/Dynamic Island erreichbar) */}
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
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 20, color: '#FFFFFF', lineHeight: 22 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

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

      {/* Seamark-Fehlerhinweis (nur wenn OpenSeaMap-Kacheln nicht erreichbar) */}
      {seamarkError && (
        <View style={{
          backgroundColor: '#FF9500',
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 5,
        }}>
          <Text style={{ fontSize: 12, color: '#FFF', fontFamily: 'SpaceGrotesk_500Medium' }}>
            ⚓ Nautische Karte momentan nicht verfügbar.
          </Text>
        </View>
      )}

      {/* Karte – inline feste Höhe 400px (Pflicht für Leaflet), Vollbild: flex:1 */}
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
          // @ts-ignore – ref liefert die Leaflet-Map-Instanz
          ref={mapRef}
          // @ts-ignore – style ist ein gültiges Leaflet-MapContainer-Prop
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          {/* Basis: OpenStreetMap */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Nautik-Layer: OpenSeaMap Seamarks – immer aktiv
              URL-Quelle: https://www.openseamap.org (offizielle Kartenseite, verifiziert 2026-08-09)
              Lizenz: CC BY-SA 2.0 */}
          <TileLayer
            url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openseamap.org" target="_blank" rel="noreferrer">OpenSeaMap</a> contributors (CC BY-SA 2.0)'
            opacity={1}
            eventHandlers={{
              tileerror: () => setSeamarkError(true),
              tileload:  () => setSeamarkError(false),
            }}
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

        {/* Inline-Ansicht: Tipp-Fläche zum Öffnen des Vollbilds.
            Die volle Karteninteraktion (Zoom/Pan) findet im Vollbild statt. */}
        {!fullscreen && (
          <TouchableOpacity
            onPress={() => setFullscreen(true)}
            activeOpacity={0.85}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              zIndex: 1000,
              backgroundColor: 'transparent',
            } as any}
          >
            <View style={{
              position: 'absolute', top: 8, right: 8,
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 6,
              flexDirection: 'row', alignItems: 'center', gap: 5,
            }}>
              <Text style={{ fontSize: 12, color: '#FFFFFF', fontFamily: 'SpaceGrotesk_500Medium' }}>
                ⤢ Vergrößern
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Quellenhinweis */}
      <Text style={{ fontSize: 10, color: colors.mutedForeground as string, textAlign: 'right' }}>
        © OpenStreetMap-Mitwirkende · © OpenSeaMap contributors (CC BY-SA 2.0)
      </Text>
    </View>
  );
}
