-- Email-bound family invitations. Membership remains invited until the authenticated invitee accepts.
alter table public.family_members add column if not exists invited_email text;
-- Prevent two concurrent owner requests from creating duplicate pending invitations
-- for the same email in one family. The same email may belong to different families.
create unique index if not exists uq_family_members_pending_invitation_email
  on public.family_members (family_id, lower(invited_email))
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


-- Service-role-only helper: avoid inviting an Auth identity that is already a
-- member of this family (including the owner), which would violate the one-login
-- per-family constraint when the invitation is accepted.
create or replace function public.family_has_auth_member_email(
  p_family_id uuid,
  p_email text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.family_members fm
    join auth.users u on u.id = fm.auth_user_id
    where fm.family_id = p_family_id
      and fm.status in ('invited','active','suspended')
      and lower(u.email) = lower(trim(p_email))
  );
$$;

revoke all on function public.family_has_auth_member_email(uuid,text) from public, anon, authenticated;
grant execute on function public.family_has_auth_member_email(uuid,text) to service_role;
