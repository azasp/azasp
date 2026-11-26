-- Harden family and device access policies (idempotent).
drop policy if exists families_select_member on public.families;
drop policy if exists families_select_owner_or_member on public.families;
create policy families_select_owner_or_member on public.families for select to authenticated
using (owner_user_id=(select auth.uid()) or exists(select 1 from public.family_members fm where fm.family_id=families.id and fm.auth_user_id=(select auth.uid()) and fm.status='active'));
drop policy if exists family_members_select_member on public.family_members;
drop policy if exists family_members_select_owner_or_self on public.family_members;
create policy family_members_select_owner_or_self on public.family_members for select to authenticated
using (auth_user_id=(select auth.uid()) or exists(select 1 from public.families f where f.id=family_members.family_id and f.owner_user_id=(select auth.uid())));
drop policy if exists family_devices_register_pending on public.family_devices;
create policy family_devices_register_pending on public.family_devices for insert to authenticated
with check (status='pending_approval' and approved_by is null and approved_at is null and registered_by=(select auth.uid()) and
(exists(select 1 from public.families f where f.id=family_devices.family_id and f.owner_user_id=(select auth.uid())) or
exists(select 1 from public.family_members fm where fm.id=family_devices.family_member_id and fm.family_id=family_devices.family_id and fm.auth_user_id=(select auth.uid()) and fm.status='active')));
drop policy if exists family_device_audit_insert_owner on public.family_device_audit;
drop policy if exists family_device_audit_insert_actor on public.family_device_audit;
create policy family_device_audit_insert_actor on public.family_device_audit for insert to authenticated
with check (actor_user_id=(select auth.uid()) and
(exists(select 1 from public.families f where f.id=family_device_audit.family_id and f.owner_user_id=(select auth.uid())) or
exists(select 1 from public.family_devices d where d.id=family_device_audit.device_id and d.family_id=family_device_audit.family_id and d.registered_by=(select auth.uid()))));
drop policy if exists financial_account_devices_insert_approved_device on public.financial_account_devices;
create policy financial_account_devices_insert_approved_device on public.financial_account_devices for insert to authenticated
with check (exists(select 1 from public.families f where f.id=financial_account_devices.family_id and f.owner_user_id=(select auth.uid())) and
exists(select 1 from public.family_devices d where d.id=financial_account_devices.device_id and d.family_id=financial_account_devices.family_id and d.status='approved'));
