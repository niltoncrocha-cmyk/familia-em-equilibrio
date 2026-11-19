-- Investimentos das contas conectadas (via Pluggy). Migração aditiva.
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  item_id text not null,
  external_id text not null,
  name text not null,
  type text,
  subtype text,
  institution text,
  issuer text,
  balance numeric(16,2) not null default 0,
  amount_invested numeric(16,2),
  profit numeric(16,2),
  annual_rate numeric(10,4),
  quantity numeric(20,6),
  currency text not null default 'BRL',
  due_date date,
  reference_date date,
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  unique (family_id, external_id)
);
create index if not exists investments_family_idx on public.investments (family_id);
create index if not exists investments_created_by_idx on public.investments (created_by);

alter table public.investments enable row level security;
revoke all on public.investments from anon;

create policy "members read investments" on public.investments
  for select to authenticated using (public.is_family_member(family_id));
create policy "members create investments" on public.investments
  for insert to authenticated
  with check (public.is_family_member(family_id) and created_by = (select auth.uid()));
create policy "members update investments" on public.investments
  for update to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy "members delete investments" on public.investments
  for delete to authenticated using (public.is_family_member(family_id));
