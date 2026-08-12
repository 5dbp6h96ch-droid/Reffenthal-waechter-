import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import OriginalHomeScreen from '@/components/OriginalHomeScreen';
import { useAuth } from '@/hooks/useAuth';
import { useGauges } from '@/hooks/useGauges';
import { useUserSettings } from '@/hooks/useUserSettings';

// Explicit PEGELONLINE UUID -> verified HVZ station ID mapping.
// No pegels are inferred from names and no fallback to another gauge is used.
const FORECAST_BY_PEGEL_UUID: Record<string, string> = {
  'b6c6d5c8-e2d5-4469-8dd8-fa972ef7eaea': '09016', // Maxau
  '2cb8ae5b-c5c9-4fa8-bac0-bb724f2754f4': '09017', // Speyer
  '57090802-c51a-4d09-8340-b4453cd0e1f5': '09001', // Mannheim
  '844a620f-f3b8-4b6b-8e3c-783ae2aa232a': '09018', // Worms
};

const HVZ_GIF_BASE = 'https://www.hvz.baden-wuerttemberg.de/gifs/';

function ForecastDomBridge({ stationId }: { stationId: string | null }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const hvzId = stationId ? FORECAST_BY_PEGEL_UUID[stationId] : undefined;
    const gifUrl = hvzId ? `${HVZ_GIF_BASE}${hvzId}-2001.GIF` : null;

    const updateForecastImages = () => {
      const images = Array.from(
        document.querySelectorAll<HTMLImageElement>('img[data-rhein-hvz-forecast="true"]'),
      );
      for (const img of images) {
        if (gifUrl && img.src !== gifUrl) img.src = gifUrl;
      }
    };

    updateForecastImages();
    const timer = window.setInterval(updateForecastImages, 1000);

    return () => window.clearInterval(timer);
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
