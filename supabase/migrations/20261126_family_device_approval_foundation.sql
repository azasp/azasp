-- MyTracker family and approved-device foundation.
-- Existing personal records remain untouched; family sharing is enabled in a later migration.
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_families_id_owner unique (id, owner_user_id)
);
create unique index uq_families_one_owner_workspace
  on public.families(owner_user_id);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  role text not null default 'member' check (role in ('admin','member','viewer')),
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_family_members_id_family unique (id,family_id)
);
create unique index uq_family_member_login_per_family
  on public.family_members(family_id,auth_user_id) where auth_user_id is not null;
create index ix_family_members_auth_user on public.family_members(auth_user_id,family_id);

create table public.family_devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  family_member_id uuid not null,
  device_identifier text not null check (length(trim(device_identifier)) between 1 and 80),
  device_type text not null check (device_type in ('iphone','android','ipad','tablet','other')),
  status text not null default 'pending_approval'
    check (status in ('pending_approval','approved','rejected','suspended','revoked')),
  registered_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  last_import_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_family_devices_member
    foreign key (family_member_id,family_id)
    references public.family_members(id,family_id) on delete cascade,
  constraint uq_family_devices_id_family unique (id,family_id),
  constraint ck_family_device_approval_audit check (
    (status <> 'approved' or (approved_by is not null and approved_at is not null))
    and (status <> 'revoked' or (revoked_by is not null and revoked_at is not null))
  )
);
create unique index uq_family_device_identifier
  on public.family_devices(family_id,lower(device_identifier));
create index ix_family_devices_member on public.family_devices(family_member_id,family_id);
create index ix_family_devices_status on public.family_devices(family_id,status,created_at desc);

create table public.family_device_audit (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  device_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('registered','approved','rejected','suspended','revoked','renamed','owner_changed')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint fk_family_device_audit_device
    foreign key (device_id,family_id)
    references public.family_devices(id,family_id) on delete cascade
);
create index ix_family_device_audit_device on public.family_device_audit(device_id,created_at desc);

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_devices enable row level security;
alter table public.family_device_audit enable row level security;

create policy families_select_member on public.families for select to authenticated
using (exists (
  select 1 from public.family_members fm
  where fm.family_id=families.id and fm.auth_user_id=(select auth.uid()) and fm.status='active'
));
create policy families_insert_owner on public.families for insert to authenticated
with check (owner_user_id=(select auth.uid()));
create policy families_update_admin on public.families for update to authenticated
using (owner_user_id=(select auth.uid()))
with check (owner_user_id=(select auth.uid()));

create policy family_members_select_member on public.family_members for select to authenticated
using (
  auth_user_id=(select auth.uid())
  or exists (select 1 from public.families f where f.id=family_members.family_id and f.owner_user_id=(select auth.uid()))
  or exists (select 1 from public.family_members admin where admin.family_id=family_members.family_id and admin.auth_user_id=(select auth.uid()) and admin.role='admin' and admin.status='active')
);
create policy family_members_insert_owner on public.family_members for insert to authenticated
with check (exists (select 1 from public.families f where f.id=family_members.family_id and f.owner_user_id=(select auth.uid())));
create policy family_members_update_owner on public.family_members for update to authenticated
using (exists (select 1 from public.families f where f.id=family_members.family_id and f.owner_user_id=(select auth.uid())))
with check (exists (select 1 from public.families f where f.id=family_members.family_id and f.owner_user_id=(select auth.uid())));

create policy family_devices_select_member on public.family_devices for select to authenticated
using (
  exists (select 1 from public.families f where f.id=family_devices.family_id and f.owner_user_id=(select auth.uid()))
  or exists (select 1 from public.family_members fm where fm.id=family_devices.family_member_id and fm.auth_user_id=(select auth.uid()) and fm.status='active')
  or exists (select 1 from public.family_members admin where admin.family_id=family_devices.family_id and admin.auth_user_id=(select auth.uid()) and admin.role='admin' and admin.status='active')
);
create policy family_devices_register_pending on public.family_devices for insert to authenticated
with check (
  status='pending_approval'
  and approved_by is null and approved_at is null
  and registered_by=(select auth.uid())
  and exists (select 1 from public.family_members fm where fm.id=family_devices.family_member_id and fm.family_id=family_devices.family_id and fm.auth_user_id=(select auth.uid()) and fm.status='active')
);
create policy family_devices_owner_update on public.family_devices for update to authenticated
using (exists (select 1 from public.families f where f.id=family_devices.family_id and f.owner_user_id=(select auth.uid())))
with check (exists (select 1 from public.families f where f.id=family_devices.family_id and f.owner_user_id=(select auth.uid())));

create policy family_device_audit_select_owner on public.family_device_audit for select to authenticated
using (exists (select 1 from public.families f where f.id=family_device_audit.family_id and f.owner_user_id=(select auth.uid())));
create policy family_device_audit_insert_owner on public.family_device_audit for insert to authenticated
with check (actor_user_id=(select auth.uid()) and exists (select 1 from public.families f where f.id=family_device_audit.family_id and f.owner_user_id=(select auth.uid())));

grant select,insert,update on public.families to authenticated;
grant select,insert,update on public.family_members to authenticated;
grant select,insert,update on public.family_devices to authenticated;
grant select,insert on public.family_device_audit to authenticated;
revoke all on public.families,public.family_members,public.family_devices,public.family_device_audit from anon;
