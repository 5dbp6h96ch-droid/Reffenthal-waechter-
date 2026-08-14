-- ============================================================
-- Migration: Web-Push-Tabellen für PRODUCTION (Rheinschiffer)
-- Zweck:     web_push_subscriptions + web_push_vapid_config
--            inkl. RLS-Policies, Constraints und Indizes –
--            übernommen aus dem getesteten Test-Stand.
--
-- Ausführen in:
--   Supabase Dashboard (Projekt "Rheinschiffer", cazlpbdcwycpoftohvtq)
--   → SQL Editor → "New Query" → ausführen
--
-- WICHTIG:
--   - Verändert KEINE bestehenden Tabellen.
--   - Enthält KEINE Schlüssel/Secrets. Die VAPID-Konfiguration wird
--     NACH der Migration separat eingefügt (siehe Hinweis unten) –
--     mit einem NEU erzeugten Production-Schlüsselpaar, NIEMALS mit
--     dem privaten Test-Schlüssel.
--   - RLS: Nutzer verwalten ausschließlich ihre eigenen
--     Push-Subscriptions. Die VAPID-Konfiguration ist für Clients
--     komplett unzugänglich (keine Policies) – nur der Server-Key
--     (Edge Function send-event-push) liest sie.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Push-Subscriptions der Browser-Clients
--    (Upsert vom Client mit onConflict: 'endpoint')
-- ------------------------------------------------------------
create table if not exists public.web_push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  endpoint   text        not null,
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint uq_web_push_endpoint unique (endpoint)
);

-- Index für die Nutzer-Filterung (z.B. threshold_crossed-Zielauswahl)
create index if not exists idx_web_push_subscriptions_user_id
  on public.web_push_subscriptions (user_id);

alter table public.web_push_subscriptions enable row level security;

-- Nutzer liest nur eigene Subscriptions
create policy "web_push_subscriptions: eigene lesen"
  on public.web_push_subscriptions
  for select
  using (auth.uid() = user_id);

-- Nutzer legt nur Subscriptions mit eigener user_id an
create policy "web_push_subscriptions: eigene anlegen"
  on public.web_push_subscriptions
  for insert
  with check (auth.uid() = user_id);

-- Nutzer aktualisiert nur eigene Subscriptions (nötig für Upsert)
create policy "web_push_subscriptions: eigene aktualisieren"
  on public.web_push_subscriptions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Nutzer löscht nur eigene Subscriptions (Push deaktivieren)
create policy "web_push_subscriptions: eigene löschen"
  on public.web_push_subscriptions
  for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2) VAPID-Konfiguration (Single-Row-Tabelle, id = true)
--    Nur der Server (Service-Role/Secret-Key) darf sie lesen:
--    RLS aktiv, KEINE Policies für Clients.
-- ------------------------------------------------------------
create table if not exists public.web_push_vapid_config (
  id              boolean     primary key default true,
  public_key      text        not null,
  private_key_jwk jsonb       not null,
  created_at      timestamptz not null default now(),
  constraint web_push_vapid_config_single_row check (id = true)
);

alter table public.web_push_vapid_config enable row level security;
-- Absichtlich KEINE Policies: Clients haben keinerlei Zugriff.

-- ------------------------------------------------------------
-- HINWEIS: VAPID-Schlüssel für Production einfügen (SEPARAT!)
--
-- 1. NEUES Schlüsselpaar erzeugen (P-256, z.B. mit `npx web-push
--    generate-vapid-keys` oder WebCrypto ES256) – NICHT den
--    Test-Schlüssel kopieren.
-- 2. Danach im SQL Editor (Werte einsetzen, nicht committen!):
--
--    insert into public.web_push_vapid_config (id, public_key, private_key_jwk)
--    values (true, '<PUBLIC_KEY_BASE64URL>', '<PRIVATE_KEY_JWK_JSON>'::jsonb)
--    on conflict (id) do update
--      set public_key = excluded.public_key,
--          private_key_jwk = excluded.private_key_jwk;
--
-- 3. Den neuen PUBLIC Key zusätzlich im Client hinterlegen
--    (useWebPushPrompt.ts, applicationServerKey), da Subscriptions
--    an den Public Key gebunden sind.
-- ============================================================
