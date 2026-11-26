-- Email-bound family invitations. Membership remains invited until the authenticated invitee accepts.
alter table public.family_members add column if not exists invited_email text;
create index if not exists ix_family_members_pending_invitation
  on public.family_members (lower(invited_email), created_at desc)
  where status = 'invited' and invited_email is not null;

-- Browser clients may create only unlinked invited member rows; all linking and activation
-- is performed by the service-role Edge Function after validating the authenticated email.
drop policy if exists family_members_insert_owner on public.family_members;
create policy family_members_insert_owner on public.family_members
for insert to authenticated
with check (
  exists (select 1 from public.families f
    where f.id = family_members.family_id and f.owner_user_id = (select auth.uid()))
  and (
    (auth_user_id is null and status = 'invited' and role in ('member','viewer'))
    or (auth_user_id = (select auth.uid()) and status = 'active' and role = 'admin')
  )
);

-- Prevent browser-side activation or account linking. Service-role operations bypass RLS.
drop policy if exists family_members_update_owner on public.family_members;
revoke update on public.family_members from authenticated;
