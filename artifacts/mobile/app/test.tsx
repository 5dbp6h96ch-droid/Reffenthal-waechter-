/**
 * test.tsx – Weiterleitung zur aktuellen Produktions-App (index.tsx)
 *
 * /test/ soll dieselbe App wie / anzeigen, damit Supabase-Auth,
 * Pegelort-Auswahl und „Mein Konto" testbar sind.
 *
 * Expo Router routet /test/ hierher. Wir re-exportieren einfach die
 * Hauptkomponente aus index.tsx – keine Codeduplikation.
 */
export { default } from './index';
