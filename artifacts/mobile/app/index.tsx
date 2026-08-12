import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import OriginalHomeScreen from '@/components/OriginalHomeScreen';
import { useAuth } from '@/hooks/useAuth';
import { useGauges } from '@/hooks/useGauges';
import { useUserSettings } from '@/hooks/useUserSettings';

// PEGELONLINE UUID -> official HVZ-BW station ID.
// Only these four stations have a verified direct HVZ GIF mapping in TEST.
const HVZ_GIF_BY_PEGEL_UUID: Record<string, string> = {
  'b6c6d5c8-e2d5-4469-8dd8-fa972ef7eaea': '09016', // Maxau / Rhein
  '2cb8ae5b-c5c9-4fa8-bac0-bb724f2754f4': '09017', // Speyer / Rhein
  '57090802-c51a-4d09-8340-b4453cd0e1f5': '09001', // Mannheim / Rhein
  '844a620f-f3b8-4b6b-8e3c-783ae2aa232a': '09018', // Worms / Rhein
};

const HVZ_GIF_BASE = 'https://www.hvz.baden-wuerttemberg.de/gifs/';

function ForecastDomBridge({ stationId }: { stationId: string | null }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const hvzId = stationId ? HVZ_GIF_BY_PEGEL_UUID[stationId] : undefined;
    const gifUrl = hvzId
      ? `${HVZ_GIF_BASE}${hvzId}-2001.GIF?t=${Date.now()}`
      : null;

    const createForecastImage = () => {
      if (!gifUrl) return null;
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

    const createUnavailableMessage = () => {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-rhein-hvz-unavailable', 'true');
      wrapper.style.padding = '28px 16px';
      wrapper.style.textAlign = 'center';
      wrapper.style.color = '#999';
      wrapper.style.fontSize = '16px';
      wrapper.textContent = 'Für diesen Pegel ist derzeit keine direkte HVZ-Vorhersage hinterlegt.';
      return wrapper;
    };

    const replaceForecastAreas = () => {
      const areas = Array.from(
        document.querySelectorAll<HTMLElement>('[data-rhein-forecast-area="true"]'),
      );
      for (const area of areas) {
        const image = createForecastImage();
        area.replaceChildren(image ?? createUnavailableMessage());
      }

      // Remove every previously injected forecast image when the selected UUID
      // has no verified mapping. Never let Maxau (or any other station) survive.
      const images = Array.from(
        document.querySelectorAll<HTMLImageElement>('img[data-rhein-hvz-forecast="true"]'),
      );
      if (!gifUrl) {
        for (const img of images) img.replaceWith(createUnavailableMessage());
      } else {
        for (const img of images) img.src = gifUrl;
      }
    };

    const markAndReplaceExistingForecastMessage = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets: HTMLElement[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (
          node.data.includes('nicht im HVZ-BW-Gebiet verfügbar.') ||
          node.data.includes('keine HVZ-Vorhersage')
        ) {
          const el = node.parentElement;
          if (el && !el.closest('[data-rhein-forecast-area="true"]')) targets.push(el);
        }
      }
      for (const target of targets) {
        const parent = target.parentElement;
        if (!parent) continue;
        parent.setAttribute('data-rhein-forecast-area', 'true');
        const image = createForecastImage();
        parent.replaceChildren(image ?? createUnavailableMessage());
      }
    };

    // IMPORTANT: do not scan or replace arbitrary images. On station changes,
    // first clear our own forecast nodes so a previous station can never remain.
    replaceForecastAreas();
    markAndReplaceExistingForecastMessage();

    const observer = new MutationObserver(() => {
      replaceForecastAreas();
      markAndReplaceExistingForecastMessage();
    });
    observer.observe(document.body, { childList: true, subtree: true });
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
