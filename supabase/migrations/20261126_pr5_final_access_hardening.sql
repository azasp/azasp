-- PR #5 final access hardening.
-- Family members may inspect only device/account associations for devices assigned
-- to their own active membership. Owners retain full workspace visibility.
drop policy if exists financial_account_devices_select_family on public.financial_account_devices;
create policy financial_account_devices_select_family on public.financial_account_devices
for select to authenticated using (
  exists (
    select 1 from public.families f
    where f.id=financial_account_devices.family_id
      and f.owner_user_id=(select auth.uid())
  )
  or exists (
    select 1
    from public.family_devices d
    join public.family_members fm
      on fm.id=d.family_member_id
     and fm.family_id=d.family_id
    where d.id=financial_account_devices.device_id
      and d.family_id=financial_account_devices.family_id
      and fm.auth_user_id=(select auth.uid())
      and fm.status='active'
  )
);
