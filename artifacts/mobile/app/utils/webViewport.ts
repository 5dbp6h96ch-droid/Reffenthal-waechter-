import { Platform } from 'react-native';

/**
 * Responsives Web-Layout: korrigiert das von Expo generierte Viewport-Meta
 * (KEIN Duplikat – das bestehende Tag wird aktualisiert) und ergänzt die
 * nötigen CSS-Regeln für dynamische Viewport-Höhe, Zoom-Sperre und
 * Safe-Area-Ränder. Läuft ausschließlich im Browser, keinerlei Wirkung
 * auf native Plattformen oder das Backend.
 */
export function setupWebViewport(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  // 1) Genau EIN korrektes Viewport-Meta: bestehendes Tag aktualisieren,
  //    überzählige entfernen, nur im Notfall neu anlegen.
  const metas = document.querySelectorAll('meta[name="viewport"]');
  const content =
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  if (metas.length === 0) {
    const m = document.createElement('meta');
    m.setAttribute('name', 'viewport');
    m.setAttribute('content', content);
    document.head.appendChild(m);
  } else {
    metas[0].setAttribute('content', content);
    for (let i = 1; i < metas.length; i++) metas[i].remove();
  }

  // 2) Layout-CSS (einmalig injizieren)
  if (document.getElementById('rheinschiffer-responsive-css')) return;
  const style = document.createElement('style');
  style.id = 'rheinschiffer-responsive-css';
  style.textContent = `
    html, body, #root {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      margin: 0;
      padding: 0;
      height: 100%;
    }
    /* Moderne Browser: dynamische Viewport-Höhe (mobile Adressleiste). */
    @supports (height: 100dvh) {
      html, body, #root { height: 100dvh; }
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
    /* Querformat mit Notch: seitliche Safe-Areas respektieren
       (oben/unten regelt die App über SafeAreaProvider). */
    #root {
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }
    *, *::before, *::after { box-sizing: border-box; }
  `;
  document.head.appendChild(style);

  // 3) iOS: Pinch-Gesten (gesturestart) blockieren – letzte Absicherung.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}
