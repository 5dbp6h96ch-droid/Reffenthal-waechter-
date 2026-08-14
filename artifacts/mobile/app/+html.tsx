import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Icon liegt öffentlich auf GitHub – stabiler als der gehashte Asset-Pfad im Build
const ICON_URL =
  'https://raw.githubusercontent.com/5dbp6h96ch-droid/Reffenthal-waechter-/main/artifacts/mobile/assets/images/icon.png';

const APP_URL = 'https://5dbp6h96ch-droid.github.io/Reffenthal-waechter-/';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        <title>R(h)einschiffer</title>
        <meta
          name="description"
          content="Pegelstand-Überwachung · Speyer / Rhein – Niedrigwasser-Alarm für Reffenthal und Altrhein"
        />
        <meta name="theme-color" content="#143D45" />

        <meta property="og:type" content="website" />
        <meta property="og:url" content={APP_URL} />
        <meta property="og:title" content="R(h)einschiffer" />
        <meta
          property="og:description"
          content="Pegelstand-Überwachung · Speyer / Rhein – Niedrigwasser-Alarm für Reffenthal und Altrhein"
        />
        <meta property="og:image" content={ICON_URL} />
        <meta property="og:image:width" content="1024" />
        <meta property="og:image:height" content="1024" />
        <meta property="og:locale" content="de_DE" />

        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="R(h)einschiffer" />
        <meta
          name="twitter:description"
          content="Pegelstand-Überwachung · Speyer / Rhein"
        />
        <meta name="twitter:image" content={ICON_URL} />

        <link rel="icon" type="image/png" href={ICON_URL} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="R(h)einschiffer" />
        <link rel="apple-touch-icon" href={ICON_URL} />
        <link rel="manifest" href="/Reffenthal-waechter-/manifest.webmanifest" />
        <link rel="stylesheet" href="/Reffenthal-waechter-/leaflet.css" />

        <ScrollViewStyleReset />

        {/* iPhone/PWA: verhindert eine breitere Layout-Fläche und hält den
            React-Native-Web-Baum an die tatsächliche Viewport-Höhe gebunden. */}
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, #root {
            width: 100%;
            min-width: 0;
            max-width: 100%;
            margin: 0;
            padding: 0;
            height: 100%;
          }
          /* Moderne Browser: dynamische Viewport-Höhe (mobile Adressleiste
             ein-/ausblendbar) statt statischem Fenster-Anker. */
          @supports (height: 100dvh) {
            html, body, #root {
              height: 100dvh;
            }
          }
          html {
            overflow-x: hidden;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
          }
          body {
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            /* iOS Safari ignoriert user-scalable=no – Pinch-Zoom zusätzlich
               über touch-action unterbinden (Pan/Scroll bleibt erlaubt). */
            touch-action: pan-x pan-y;
          }
          /* Querformat mit Notch: Inhalt nicht unter die seitlichen
             Safe-Areas laufen lassen (oben/unten regelt die App selbst). */
          #root {
            padding-left: env(safe-area-inset-left);
            padding-right: env(safe-area-inset-right);
          }
          *, *::before, *::after {
            box-sizing: border-box;
          }
        ` }} />

        {/* Service-Worker-Registrierung – nur im Browser (Web-Build) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  if (!('serviceWorker' in navigator)) return;

  var reloadKey = 'sw-ctrl-reloaded';
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1');
      window.location.reload();
    }
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/Reffenthal-waechter-/sw.js', { scope: '/Reffenthal-waechter-/' })
      .then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', function () {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(worker);
            }
          });
        });
        setInterval(function () { reg.update(); }, 5 * 60 * 1000);
      })
      .catch(function (err) {
        console.warn('[SW] Registrierung fehlgeschlagen:', err);
      });
  });

  function showUpdateBanner(worker) {
    if (document.getElementById('sw-update-bar')) return;
    var bar = document.createElement('div');
    bar.id  = 'sw-update-bar';
    bar.style.cssText = 'position:fixed;bottom:calc(24px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:#007AFF;color:#fff;padding:12px 18px;border-radius:14px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:14px;font-weight:500;z-index:99999;display:flex;align-items:center;gap:12px;box-shadow:0 4px 24px rgba(0,0,0,0.28);white-space:nowrap;';
    var label = document.createElement('span');
    label.textContent = '\\uD83D\\uDD04\\u2009Neue Version verfügbar';
    var btn = document.createElement('button');
    btn.textContent   = 'Aktualisieren';
    btn.style.cssText = 'background:rgba(255,255,255,0.22);border:none;color:#fff;padding:6px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;';
    btn.addEventListener('click', function () {
      bar.remove();
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
    bar.appendChild(label);
    bar.appendChild(btn);
    document.body.appendChild(bar);
    setTimeout(function () { if (bar.parentNode) bar.remove(); }, 30000);
  }
})();
`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
