create table if not exists public.app_state (
  key text primary key,
  data jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

-- Fase 1: políticas abertas para viabilizar a migração do app atual sem backend.
-- Depois da migração, substitua por autenticação real e políticas por usuário/perfil.
alter table public.app_state enable row level security;

drop policy if exists "app_state_select" on public.app_state;
create policy "app_state_select" on public.app_state for select using (true);

drop policy if exists "app_state_insert" on public.app_state;
create policy "app_state_insert" on public.app_state for insert with check (true);

drop policy if exists "app_state_update" on public.app_state;
create policy "app_state_update" on public.app_state for update using (true) with check (true);

drop policy if exists "app_state_delete" on public.app_state;
create policy "app_state_delete" on public.app_state for delete using (true);
