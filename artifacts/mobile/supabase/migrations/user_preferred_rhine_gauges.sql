-- TEST only: persönliche Auswahl der Rheinpegel pro Nutzer
create table if not exists public.user_preferred_gauges (
  user_id uuid not null references auth.users(id) on delete cascade,
  gauge_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, gauge_id)
);

alter table public.user_preferred_gauges enable row level security;

drop policy if exists "Users can read own preferred gauges" on public.user_preferred_gauges;
drop policy if exists "Users can insert own preferred gauges" on public.user_preferred_gauges;
drop policy if exists "Users can update own preferred gauges" on public.user_preferred_gauges;
drop policy if exists "Users can delete own preferred gauges" on public.user_preferred_gauges;

create policy "Users can read own preferred gauges" on public.user_preferred_gauges
  for select using (auth.uid() = user_id);
create policy "Users can insert own preferred gauges" on public.user_preferred_gauges
  for insert with check (auth.uid() = user_id);
create policy "Users can update own preferred gauges" on public.user_preferred_gauges
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own preferred gauges" on public.user_preferred_gauges
  for delete using (auth.uid() = user_id);

create index if not exists user_preferred_gauges_user_sort_idx
  on public.user_preferred_gauges(user_id, sort_order);
