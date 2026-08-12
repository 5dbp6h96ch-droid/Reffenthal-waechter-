import React, { useEffect } from 'react';
import { Image as RNImage, Platform } from 'react-native';
import OriginalHomeScreen from '@/components/OriginalHomeScreen';
import { useAuth } from '@/hooks/useAuth';
import { useGauges } from '@/hooks/useGauges';
import { useUserSettings } from '@/hooks/useUserSettings';

// PEGELONLINE UUID -> eindeutige HVZ-BW-Pegel-ID.
// Die Zuordnung erfolgt bewusst NICHT über den Pegelnamen.
const HVZ_GIF_BY_PEGEL_UUID: Record<string, string> = {
  'b6c6d5c8-e2d5-4469-8dd8-fa972ef7eaea': '09016', // Maxau
  '2cb8ae5b-c5c9-4fa8-bac0-bb724f2754f4': '09017', // Speyer
  '57090802-c51a-4d09-8340-b4453cd0e1f5': '09001', // Mannheim
  '844a620f-f3b8-4b6b-8e3c-783ae2aa232a': '09018', // Worms
};

const HVZ_GIF_BASE = 'https://www.hvz.baden-wuerttemberg.de/gifs/';

function ForecastDomBridge({ stationId }: { stationId: string | null }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !stationId || typeof document === 'undefined') return;

    const hvzId = HVZ_GIF_BY_PEGEL_UUID[stationId];
    if (!hvzId) return;

    const gifUrl = `${HVZ_GIF_BASE}${hvzId}-2001.GIF?t=${Date.now()}`;

    const createForecastImage = () => {
      const img = document.createElement('img');
      img.setAttribute('data-rhein-hvz-forecast', 'true');
      img.src = gifUrl;
      img.alt = 'Wasserstand Vorhersage';
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.maxHeight = '520px';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
      img.style.background = '#fff';
      return img;
    };

    const replaceForecast = () => {
      // Bereits vorhandenes HVZ-GIF immer auf den zum UUID gehörenden Pegel setzen.
      const images = Array.from(document.images).filter((img) =>
        img.src.includes('hvz.baden-wuerttemberg.de/gifs/') ||
        img.getAttribute('data-rhein-hvz-forecast') === 'true',
      );

      for (const img of images) {
        img.src = gifUrl;
        img.setAttribute('data-rhein-hvz-forecast', 'true');
      }

      // Bei Pegeln, die im bisherigen Code als "nicht verfügbar" erscheinen,
      // das korrekte HVZ-GIF einsetzen. Damit bekommt z.B. Maxau nicht mehr
      // versehentlich die Grafik eines anderen Pegels.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets: HTMLElement[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (node.data.includes('nicht im HVZ-BW-Gebiet verfügbar.')) {
          const el = node.parentElement;
          if (el && !el.querySelector('[data-rhein-hvz-forecast="true"]')) targets.push(el);
        }
      }

      for (const target of targets) {
        const parent = target.parentElement;
        if (!parent) continue;
        parent.replaceChildren(createForecastImage());
      }
    };

    const observer = new MutationObserver(replaceForecast);
    observer.observe(document.body, { childList: true, subtree: true });
    replaceForecast();

    return () => observer.disconnect();
  }, [stationId]);

  return null;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { settings } = useUserSettings(user?.id);
  const { gauges } = useGauges();
  const selectedGauge = gauges.find((g) => g.id === settings?.selected_gauge_id) ?? gauges[0] ?? null;

  return (
    <>
      <OriginalHomeScreen />
      <ForecastDomBridge stationId={selectedGauge?.pegel_uuid ?? null} />
    </>
  );
}
