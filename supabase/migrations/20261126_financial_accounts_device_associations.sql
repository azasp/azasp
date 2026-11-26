alter table public.financial_accounts
  add column if not exists family_id uuid,
  add column if not exists family_member_id uuid;

alter table public.financial_accounts
  add constraint fk_financial_accounts_family_member
  foreign key (family_member_id,family_id)
  references public.family_members(id,family_id) on delete restrict;

create unique index if not exists uq_financial_accounts_id_family
  on public.financial_accounts(id,family_id);

create table if not exists public.financial_account_devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  financial_account_id uuid not null,
  device_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  discovery_source text not null default 'sms'
    check (discovery_source in ('sms','manual','statement_import')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint fk_fad_account foreign key (financial_account_id,family_id)
    references public.financial_accounts(id,family_id) on delete cascade,
  constraint fk_fad_device foreign key (device_id,family_id)
    references public.family_devices(id,family_id) on delete cascade,
  constraint uq_fad_account_device unique(financial_account_id,device_id)
);
create index if not exists ix_fad_device on public.financial_account_devices(family_id,device_id,is_active);
create index if not exists ix_fad_account on public.financial_account_devices(family_id,financial_account_id,is_active);

alter table public.financial_account_devices enable row level security;

drop policy if exists financial_account_devices_select_family on public.financial_account_devices;
create policy financial_account_devices_select_family on public.financial_account_devices
for select to authenticated using (
  exists (select 1 from public.families f where f.id=financial_account_devices.family_id and f.owner_user_id=(select auth.uid()))
  or exists (
    select 1 from public.family_members fm
    where fm.family_id=financial_account_devices.family_id
      and fm.auth_user_id=(select auth.uid()) and fm.status='active'
  )
);
drop policy if exists financial_account_devices_insert_approved_device on public.financial_account_devices;
create policy financial_account_devices_insert_approved_device on public.financial_account_devices
for insert to authenticated with check (
  exists (select 1 from public.families f where f.id=financial_account_devices.family_id and f.owner_user_id=(select auth.uid()))
  and exists (select 1 from public.family_devices d where d.id=financial_account_devices.device_id
    and d.family_id=financial_account_devices.family_id and d.status='approved')
);
drop policy if exists financial_account_devices_update_owner on public.financial_account_devices;
create policy financial_account_devices_update_owner on public.financial_account_devices
for update to authenticated using (
  exists (select 1 from public.families f where f.id=financial_account_devices.family_id and f.owner_user_id=(select auth.uid()))
) with check (
  exists (select 1 from public.families f where f.id=financial_account_devices.family_id and f.owner_user_id=(select auth.uid()))
);
grant select,insert,update on public.financial_account_devices to authenticated;
revoke all on public.financial_account_devices from anon;

drop policy if exists financial_accounts_select_family on public.financial_accounts;
create policy financial_accounts_select_family on public.financial_accounts
for select to authenticated using (
  user_id=(select auth.uid())
  or exists (select 1 from public.families f where f.id=financial_accounts.family_id and f.owner_user_id=(select auth.uid()))
  or exists (select 1 from public.family_members fm where fm.id=financial_accounts.family_member_id
    and fm.family_id=financial_accounts.family_id and fm.auth_user_id=(select auth.uid()) and fm.status='active')
);
