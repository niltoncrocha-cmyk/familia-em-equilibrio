-- Histórico diário de saldo e cotas dos investimentos, para calcular rendimento (diário/mensal) sem depender de aportes e resgates.
create table if not exists public.investment_snapshots (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  external_id text not null,
  name text,
  ref_date date not null,
  balance numeric(16,2) not null,
  quantity numeric(20,6) not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (family_id, external_id, ref_date)
);
create index if not exists investment_snapshots_family_idx on public.investment_snapshots (family_id, ref_date);
create index if not exists investment_snapshots_created_by_idx on public.investment_snapshots (created_by);
alter table public.investment_snapshots enable row level security;
revoke all on public.investment_snapshots from anon;
create policy "members read investment snapshots" on public.investment_snapshots
  for select to authenticated using (public.is_family_member(family_id));
create policy "members create investment snapshots" on public.investment_snapshots
  for insert to authenticated
  with check (public.is_family_member(family_id) and created_by = (select auth.uid()));
