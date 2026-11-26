-- Break mutual recursion between families and family_members SELECT policies.
-- Family workspace metadata is visible to its owner; members see their own membership
-- and devices through the independent family_members/family_devices policies.
drop policy if exists families_select_owner_or_member on public.families;
drop policy if exists families_select_owner_only on public.families;
create policy families_select_owner_only on public.families
for select to authenticated
using (owner_user_id=(select auth.uid()));