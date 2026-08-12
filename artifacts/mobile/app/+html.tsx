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

        <title>R(h)einschiffer</title>
        <meta
          name="description"
          content="Pegelstand-Überwachung · Speyer / Rhein – Niedrigwasser-Alarm für Reffenthal und Altrhein"
        />
        <meta name="theme-color" content="#143D45" />

        {/* Open Graph – für WhatsApp, Telegram, iMessage etc. */}
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

        {/* Twitter / X Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="R(h)einschiffer" />
        <meta
          name="twitter:description"
          content="Pegelstand-Überwachung · Speyer / Rhein"
        />
        <meta name="twitter:image" content={ICON_URL} />

        {/* Favicon (PNG) */}
        <link rel="icon" type="image/png" href={ICON_URL} />

        {/* PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="R(h)einschiffer" />
        {/* iOS Home Screen Icon */}
        <link rel="apple-touch-icon" href={ICON_URL} />

        {/* Web App Manifest */}
        <link rel="manifest" href="/manifest.webmanifest" />

        {/* Leaflet CSS */}
        <link rel="stylesheet" href="/leaflet.css" />

        <ScrollViewStyleReset />

        {/* Erstinstallation / Home-Bildschirm-Hinweis – nur Web/Smartphone */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  var installPrompt = null;
  var seenKey = 'rheinschiffer-install-v2';
  var ua = window.navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/i.test(ua) ||
    (window.navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));
  var isAndroid = /Android/i.test(ua);
  var isMobile = isIOS || isAndroid ||
    (window.navigator.maxTouchPoints > 1 && window.innerWidth < 900);
  var isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (!isMobile || isStandalone) return;

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    installPrompt = event;
  });

  function hasSeen() {
    try { return localStorage.getItem(seenKey) === '1'; } catch (_) { return false; }
  }

  function markSeen() {
    try { localStorage.setItem(seenKey, '1'); } catch (_) {}
  }

  function showInstructions() {
    var existing = document.getElementById('rheinschiffer-install-modal');
    if (existing) existing.remove();

    var backdrop = document.createElement('div');
    backdrop.id = 'rheinschiffer-install-modal';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.32);z-index:100001;display:flex;align-items:flex-end;justify-content:center;padding:18px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;';

    var card = document.createElement('div');
    card.style.cssText = 'width:min(100%,430px);background:#fff;border-radius:24px;padding:24px 20px 20px;box-shadow:0 12px 40px rgba(0,0,0,.24);box-sizing:border-box;';

    var title = document.createElement('div');
    title.textContent = 'Auf dem Home-Bildschirm installieren';
    title.style.cssText = 'font-size:21px;font-weight:700;color:#111;margin-bottom:12px;';

    var text = document.createElement('div');
    text.style.cssText = 'font-size:16px;line-height:1.55;color:#555;margin-bottom:20px;';
    if (isIOS) {
      text.innerHTML = '<b>iPhone / iPad</b><br><br>1. Tippe in Safari auf das <b>Teilen-Symbol</b>.<br>2. Wähle <b>„Zum Home-Bildschirm“</b>.<br>3. Tippe oben rechts auf <b>„Hinzufügen“</b>.';
    } else {
      text.innerHTML = '<b>Android</b><br><br>1. Öffne das Browser-Menü <b>⋮</b>.<br>2. Wähle <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b>.<br>3. Bestätige die Installation.';
    }

    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Verstanden';
    close.style.cssText = 'width:100%;border:0;background:#007AFF;color:#fff;border-radius:14px;padding:14px 16px;font-size:16px;font-weight:700;cursor:pointer;';
    close.addEventListener('click', function () {
      markSeen();
      backdrop.remove();
    });

    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(close);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
  }

  function showInstallButton() {
    if (hasSeen() || document.getElementById('rheinschiffer-install-button')) return;

    var button = document.createElement('button');
    button.id = 'rheinschiffer-install-button';
    button.type = 'button';
    button.textContent = 'Auf Smartphone installieren';
    button.style.cssText = 'position:fixed;left:18px;right:18px;bottom:96px;z-index:100000;width:calc(100% - 36px);border:0;border-radius:16px;background:#007AFF;color:#fff;padding:14px 18px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:16px;font-weight:700;box-shadow:0 6px 22px rgba(0,122,255,.30);cursor:pointer;';

    button.addEventListener('click', function () {
      if (installPrompt) {
        installPrompt.prompt();
        installPrompt.userChoice.then(function () {
          installPrompt = null;
          markSeen();
          button.remove();
        }).catch(function () {
          installPrompt = null;
          showInstructions();
        });
      } else {
        showInstructions();
      }
    });

    document.body.appendChild(button);
  }

  function init() {
    window.setTimeout(showInstallButton, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`,
          }}
        />

        {/* Service-Worker-Registrierung – nur im Browser (Web-Build) */}
        {/* eslint-disable-next-line @typescript-eslint/naming-convention */}
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
      .register('/sw.js', { scope: '/' })
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
    bar.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#007AFF;color:#fff;padding:12px 18px;border-radius:14px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:14px;font-weight:500;z-index:99999;display:flex;align-items:center;gap:12px;box-shadow:0 4px 24px rgba(0,0,0,0.28);white-space:nowrap;';
    var label = document.createElement('span');
    label.textContent = '\\uD83D\\uDD04\\u2009Neue Version verfügbar';
    var btn = document.createElement('button');
    btn.textContent = 'Aktualisieren';
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
