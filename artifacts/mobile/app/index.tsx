import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import OriginalHomeScreen from '@/components/OriginalHomeScreen';
import { useAuth } from '@/hooks/useAuth';
import { useGauges } from '@/hooks/useGauges';
import { useUserSettings } from '@/hooks/useUserSettings';

const HVZ_BY_PEGEL_UUID: Record<string, string> = {
  'b6c6d5c8-e2d5-4469-8dd8-fa972ef7eaea': '09016',
  '2cb8ae5b-c5c9-4fa8-bac0-bb724f2754f4': '09017',
  '57090802-c51a-4d09-8340-b4453cd0e1f5': '09001',
  '844a620f-f3b8-4b6b-8e3c-783ae2aa232a': '09018',
};

const HVZ_GIF_BASE = 'https://www.hvz.baden-wuerttemberg.de/gifs/';

function ForecastDomBridge({ stationId }: { stationId: string | null }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !stationId || typeof document === 'undefined') return;
    const hvzId = HVZ_BY_PEGEL_UUID[stationId];
    if (!hvzId) return;
    const gifUrl = `${HVZ_GIF_BASE}${hvzId}-2001.GIF?t=${Date.now()}`;

    const createImage = () => {
      const img = document.createElement('img');
      img.setAttribute('data-rhein-hvz-forecast', 'true');
      img.src = gifUrl;
      img.alt = 'Wasserstand Vorhersage';
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.maxHeight = '520px';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
      return img;
    };

    const replaceForecast = () => {
      const existing = document.querySelectorAll<HTMLImageElement>('img[data-rhein-hvz-forecast="true"]');
      existing.forEach((img) => img.setAttribute('src', gifUrl));

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets: HTMLElement[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (node.data.includes('nicht im HVZ-BW-Gebiet verfügbar.')) {
          const el = node.parentElement;
          if (el && !el.closest('[data-rhein-forecast-area="true"]')) targets.push(el);
        }
      }
      targets.forEach((target) => {
        const parent = target.parentElement;
        if (!parent) return;
        parent.setAttribute('data-rhein-forecast-area', 'true');
        parent.replaceChildren(createImage());
      });
    };

    let running = false;
    const observer = new MutationObserver(() => {
      if (running) return;
      running = true;
      try { replaceForecast(); } finally { running = false; }
    });
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
