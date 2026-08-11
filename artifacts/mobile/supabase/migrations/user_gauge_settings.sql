-- ============================================================
-- Migration: public.user_gauge_settings
-- Zweck:     Persönliche Pegelschwellen pro Nutzer und Pegel
--
-- Ausführen in:
--   Supabase Dashboard → SQL Editor → "New Query" → ausführen
--
-- WICHTIG:
--   - Verändert KEINE bestehenden Tabellen (gauges, user_settings, …)
--   - RLS sichert, dass jeder Nutzer ausschließlich seine eigenen
--     Einträge lesen und schreiben kann.
--   - UNIQUE(user_id, gauge_id) verhindert Duplikate.
-- ============================================================

create table if not exists public.user_gauge_settings (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  gauge_id           text        not null references public.gauges(id) on delete cascade,
  alert_enabled      boolean     not null default false,
  alert_threshold_cm integer,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  constraint uq_user_gauge unique (user_id, gauge_id)
);

-- RLS aktivieren
alter table public.user_gauge_settings enable row level security;

-- Nutzer liest nur eigene Einträge
create policy "user_gauge_settings: eigene Einträge lesen"
  on public.user_gauge_settings
  for select
  using (auth.uid() = user_id);

-- Nutzer darf nur mit eigener user_id anlegen
create policy "user_gauge_settings: eigene Einträge anlegen"
  on public.user_gauge_settings
  for insert
  with check (auth.uid() = user_id);

-- Nutzer darf nur eigene Einträge aktualisieren
create policy "user_gauge_settings: eigene Einträge aktualisieren"
  on public.user_gauge_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Nutzer darf nur eigene Einträge löschen
create policy "user_gauge_settings: eigene Einträge löschen"
  on public.user_gauge_settings
  for delete
  using (auth.uid() = user_id);
