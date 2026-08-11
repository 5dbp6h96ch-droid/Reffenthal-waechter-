/**
 * test.tsx – Testumgebung (/test/)
 *
 * Rendert 1:1 dieselbe Produktions-App wie index.tsx (HomeScreen).
 * Expo Router routet /test/ auf diese Datei; durch den Re-Export
 * bekommt der Nutzer das aktuelle UI inkl. Bottom-Navigation.
 *
 * Das sw-diag.js-Overlay (nur in test/index.html eingebettet)
 * liefert weiterhin die SW-Diagnose oben auf dem Bildschirm.
 */
export { default } from './index';
