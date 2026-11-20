-- Compras de cartão ainda não confirmadas pelo banco entram como 'pending' e são conciliadas quando o banco confirmar (sem duplicar).
alter table public.bank_import_review add column if not exists bank_status text not null default 'posted';
create index if not exists bank_import_review_pending_idx on public.bank_import_review (family_id, account_id) where bank_status = 'pending';
