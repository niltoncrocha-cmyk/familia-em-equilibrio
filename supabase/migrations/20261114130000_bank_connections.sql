-- Conexão bancária (Pluggy / MeuPluggy). Migração aditiva: não altera nem apaga dados existentes.

-- 1) Identificador da conta no provedor, para não duplicar contas a cada sincronização.
alter table public.financial_accounts
  add column if not exists external_id text;

create unique index if not exists financial_accounts_family_external_idx
  on public.financial_accounts (family_id, external_id)
  where external_id is not null;

-- 2) Conexões bancárias da família (guarda só o Item ID da Pluggy; nenhuma credencial).
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  provider text not null default 'pluggy',
  item_id text not null,
  institution text,
  last_synced_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (family_id, provider, item_id)
);

create index if not exists bank_connections_family_idx on public.bank_connections (family_id);
create index if not exists bank_connections_created_by_idx on public.bank_connections (created_by);

alter table public.bank_connections enable row level security;
revoke all on public.bank_connections from anon;

create policy "members read bank connections" on public.bank_connections
  for select to authenticated
  using (public.is_family_member(family_id));

create policy "admins create bank connections" on public.bank_connections
  for insert to authenticated
  with check (public.is_family_admin(family_id) and created_by = (select auth.uid()));

create policy "members update bank connections" on public.bank_connections
  for update to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy "admins delete bank connections" on public.bank_connections
  for delete to authenticated
  using (public.is_family_admin(family_id));
