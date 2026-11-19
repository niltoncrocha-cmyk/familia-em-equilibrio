-- Saldo informado pelo banco (via Pluggy). Migração aditiva.
alter table public.financial_accounts
  add column if not exists balance numeric(14,2),
  add column if not exists balance_updated_at timestamptz;
