-- Novo tipo de movimento: aplicação/resgate de investimento (ex.: BB Rende Fácil). Não conta como receita nem despesa.
alter table public.transactions drop constraint if exists transactions_movement_kind_check;
alter table public.transactions
  add constraint transactions_movement_kind_check
  check (movement_kind in ('normal','transfer','card_bill','donation','investment'));
