-- Migration: pegel_nr und river_km für alle Gauges setzen
-- Werte aus PEGELONLINE REST-API (stations/{name}.json, verifiziert 2026-08-11)
--
-- SPEYER:   km=400.61, lat=49.323807, lon=8.448705  (agency: STANDORT MANNHEIM)
-- MANNHEIM: km=424.73, lat=49.48394,  lon=8.455165  (agency: STANDORT MANNHEIM)
-- WORMS:    km=443.37, lat=49.631837, lon=8.377519   (agency: STANDORT MANNHEIM)
--
-- Ausführen in: Supabase Dashboard → SQL Editor
-- Betrifft: public.gauges
-- Vorsicht: Keine IDs oder Namen verändern – nur fehlende/falsche Felder korrigieren.

UPDATE public.gauges
SET
  pegel_nr = 'SPEYER',
  river_km = 400.61
WHERE lower(name) LIKE '%speyer%';

UPDATE public.gauges
SET
  pegel_nr = 'MANNHEIM',
  river_km = 424.73
WHERE lower(name) LIKE '%mannheim%';

UPDATE public.gauges
SET
  pegel_nr = 'WORMS',
  river_km = 443.37
WHERE lower(name) LIKE '%worms%';

-- Ergebnis prüfen:
SELECT id, name, pegel_nr, river_km FROM public.gauges ORDER BY river_km ASC NULLS LAST;
