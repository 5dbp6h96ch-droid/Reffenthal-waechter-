import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Icon liegt öffentlich auf GitHub – stabiler als der gehashte Asset-Pfad im Build
const ICON_URL =
  'https://raw.githubusercontent.com/5dbp6h96ch-droid/Reffenthal-waechter-/main/artifacts/mobile/assets/images/icon.png';

const APP_URL = 'https://5dbp6h96ch-droid.github.io/Reffenthal-waechter-/';

/**
 * HTML-Template für den Expo Web-Export.
 * Wird nur beim Web-Build verwendet, nicht in der nativen App.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        <title>Rhein Infos</title>
        <meta
          name="description"
          content="Pegelstand-Überwachung · Speyer / Rhein – Niedrigwasser-Alarm für Reffenthal und Altrhein"
        />
        <meta name="theme-color" content="#143D45" />

        {/* Open Graph – für WhatsApp, Telegram, iMessage etc. */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={APP_URL} />
        <meta property="og:title" content="Rhein Infos" />
        <meta
          property="og:description"
          content="Pegelstand-Überwachung · Speyer / Rhein – Niedrigwasser-Alarm für Reffenthal und Altrhein"
        />
        <meta property="og:image" content={ICON_URL} />
        <meta property="og:image:width" content="1024" />
        <meta property="og:image:height" content="1024" />
        <meta property="og:locale" content="de_DE" />

        {/* Twitter / X Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Rhein Infos" />
        <meta
          name="twitter:description"
          content="Pegelstand-Überwachung · Speyer / Rhein"
        />
        <meta name="twitter:image" content={ICON_URL} />

        {/* PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Rhein Infos" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
