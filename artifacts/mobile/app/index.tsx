import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import OriginalHomeScreen from '@/components/OriginalHomeScreen';
import { useAuth } from '@/hooks/useAuth';
import { useGauges } from '@/hooks/useGauges';
import { useUserSettings } from '@/hooks/useUserSettings';

const PEGELONLINE_FORECAST_URL = 'https://pegelonline.wsv.de/webservices/zeitreihe/visualisierung';

function ForecastDomBridge({ stationId }: { stationId: string | null }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !stationId || typeof document === 'undefined') return;

    const chartUrl = `${PEGELONLINE_FORECAST_URL}?pegeluuid=${encodeURIComponent(stationId)}&eingebettet=ja&anzeigeVorhersagen=ja&anzeigeEinzelwerte=nein`;

    const replaceForecast = () => {
      const images = Array.from(document.images).filter((img) =>
        img.src.includes('hvz.baden-wuerttemberg.de/gifs/'),
      );

      for (const img of images) {
        const parent = img.parentElement;
        if (!parent || parent.querySelector('[data-rhein-pegelonline-forecast="true"]')) continue;

        const iframe = document.createElement('iframe');
        iframe.setAttribute('data-rhein-pegelonline-forecast', 'true');
        iframe.src = chartUrl;
        iframe.title = 'PEGELONLINE Vorhersage';
        iframe.style.width = '100%';
        iframe.style.height = '360px';
        iframe.style.border = '0';
        iframe.style.display = 'block';
        iframe.style.background = '#fff';
        iframe.loading = 'lazy';
        parent.replaceChildren(iframe);
      }

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const targets: HTMLElement[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (node.data.includes('nicht im HVZ-BW-Gebiet verfügbar.')) {
          const el = node.parentElement;
          if (el && !el.querySelector('[data-rhein-pegelonline-forecast="true"]')) targets.push(el);
        }
      }

      for (const target of targets) {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('data-rhein-pegelonline-forecast', 'true');
        iframe.src = chartUrl;
        iframe.title = 'PEGELONLINE Vorhersage';
        iframe.style.width = '100%';
        iframe.style.height = '360px';
        iframe.style.border = '0';
        iframe.style.display = 'block';
        iframe.style.background = '#fff';
        iframe.loading = 'lazy';
        target.replaceChildren(iframe);
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
