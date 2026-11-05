-- n8n nabız izleme (2026-11-05)
-- n8n her çalışmada n8n_heartbeat('stokv2') çağırır; pg_cron 30 dakikada bir n8n-watchdog
-- edge function'ını tetikler, o da nabız 150 dakikadan eskiyse tek bir uyarı e-postası atar.
-- Sebep: 31 Eki–5 Kas n8n 5 gün sessizce durdu, kimse fark etmedi.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.n8n_heartbeat (
  workflow      text primary key,
  last_seen     timestamptz not null default now(),
  alert_sent_at timestamptz
);
alter table public.n8n_heartbeat enable row level security;
revoke all on public.n8n_heartbeat from anon, authenticated;

create or replace function public.n8n_heartbeat(p_workflow text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.n8n_heartbeat (workflow, last_seen)
  values (left(p_workflow, 64), now())
  on conflict (workflow) do update set last_seen = excluded.last_seen;
$$;
revoke execute on function public.n8n_heartbeat(text) from public, anon, authenticated;
grant execute on function public.n8n_heartbeat(text) to service_role;

-- Hafta içi 08:00–18:30 TR (= 05:00–15:30 UTC), 30 dakikada bir.
select cron.schedule(
  'n8n-watchdog',
  '*/30 5-15 * * 1-5',
  $$select net.http_post(
      url := 'https://hnrzfofzzbavhvttiszp.supabase.co/functions/v1/n8n-watchdog',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );$$
);
