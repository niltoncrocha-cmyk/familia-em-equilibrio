-- Sincronização diária às 05:00 (Manaus = 09:00 UTC). O segredo fica só no banco (app_secrets, sem acesso pelo app).
create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (name, value) values ('cron_secret', encode(extensions.gen_random_bytes(24),'hex')) on conflict (name) do nothing;
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('pluggy-sync-diario','0 9 * * *', $job$select net.http_post(url:='https://tyorbdvljblcctofbmoz.supabase.co/functions/v1/pluggy-sync', headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.app_secrets where name='cron_secret')), body:='{}'::jsonb, timeout_milliseconds:=120000)$job$);
