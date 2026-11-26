create table if not exists public.device_pairing_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count >= 0),
  updated_at timestamptz not null default now()
);
alter table public.device_pairing_rate_limits enable row level security;
revoke all on public.device_pairing_rate_limits from public,anon,authenticated;
grant all on public.device_pairing_rate_limits to service_role;

create or replace function public.consume_device_pairing_attempt(p_key_hash text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare current_row public.device_pairing_rate_limits%rowtype;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  insert into public.device_pairing_rate_limits(key_hash,window_started_at,attempt_count)
  values(p_key_hash,now(),1)
  on conflict(key_hash) do nothing;
  select * into current_row from public.device_pairing_rate_limits where key_hash=p_key_hash for update;
  if current_row.window_started_at < now()-interval '15 minutes' then
    update public.device_pairing_rate_limits set window_started_at=now(),attempt_count=1,updated_at=now() where key_hash=p_key_hash;
    return true;
  end if;
  if current_row.attempt_count >= 8 then return false; end if;
  update public.device_pairing_rate_limits set attempt_count=attempt_count+1,updated_at=now() where key_hash=p_key_hash;
  return true;
end; $$;
revoke all on function public.consume_device_pairing_attempt(text) from public,anon,authenticated;
grant execute on function public.consume_device_pairing_attempt(text) to service_role;
