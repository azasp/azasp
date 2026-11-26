-- iPhone first-run pairing and per-device API credential.
alter table public.family_devices
  add column if not exists device_secret_hash text,
  add column if not exists device_secret_created_at timestamptz,
  add column if not exists device_secret_last_used_at timestamptz;

create unique index if not exists family_devices_device_secret_hash_uidx
  on public.family_devices(device_secret_hash)
  where device_secret_hash is not null;

create table if not exists public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  family_member_id uuid not null,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint device_pairing_codes_member_family_fk
    foreign key (family_member_id, family_id)
    references public.family_members(id, family_id) on delete cascade
);

create index if not exists device_pairing_codes_family_created_idx
  on public.device_pairing_codes(family_id, created_at desc);

alter table public.device_pairing_codes enable row level security;
revoke all on public.device_pairing_codes from anon;
grant select, insert, update on public.device_pairing_codes to authenticated;

drop policy if exists device_pairing_codes_owner_select on public.device_pairing_codes;
create policy device_pairing_codes_owner_select on public.device_pairing_codes
for select to authenticated
using (exists (
  select 1 from public.families f
  where f.id = device_pairing_codes.family_id
    and f.owner_user_id = (select auth.uid())
));

drop policy if exists device_pairing_codes_owner_insert on public.device_pairing_codes;
create policy device_pairing_codes_owner_insert on public.device_pairing_codes
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.families f
    where f.id = device_pairing_codes.family_id
      and f.owner_user_id = (select auth.uid())
  )
);

drop policy if exists device_pairing_codes_owner_update on public.device_pairing_codes;
create policy device_pairing_codes_owner_update on public.device_pairing_codes
for update to authenticated
using (exists (
  select 1 from public.families f
  where f.id = device_pairing_codes.family_id
    and f.owner_user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.families f
  where f.id = device_pairing_codes.family_id
    and f.owner_user_id = (select auth.uid())
));
