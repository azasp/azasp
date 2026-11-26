# Family invitations

The family owner invites a member by name and email from Family & devices. The
family-invitations Edge Function verifies the caller is the owner and creates a
family_members row with status invited. New Auth users receive a Supabase Auth
invitation. If Supabase reports that the email already belongs to an Auth user,
the function sends that existing account a sign-in OTP instead and leaves
auth_user_id unlinked until acceptance. An invited member is not active and must
not be granted family-data access.

Each email redirect carries the opaque family_members invitation row ID in the
family_invitation query parameter. When the invitee follows that specific email,
authenticates, and the app starts, the app passes that ID to the function with
action accept. The function loads only that row, compares the authenticated
account's email with the stored invitation email, and conditionally links and
activates only that membership. Other pending invitations for the same email,
including invitations from other families, remain pending. The service-role key
is used only inside the Edge Function and must never be exposed to the browser.

Accepted non-owner members see a read-only Family & devices view containing only
their own registered devices and accounts assigned to their family_members row.
They do not get owner controls for inviting members, approving devices, or
reassigning accounts. The families table remains owner-readable only; member
discovery starts from the member's own active family_members row.

## Deployment

1. Apply 20261126_pr5_family_invitations.sql after the existing family/device foundation
   and family RLS migrations.
2. Deploy supabase/functions/family-invitations/index.ts as the family-invitations
   Supabase Edge Function.
3. Configure Supabase Auth email templates, SMTP, and allowed redirect URLs for MyTracker.
4. Test both a new Auth email and an already-registered Auth email: pending invitation,
   no family access before acceptance, acceptance after sign-in, active access after
   acceptance, and rejection of an email-mismatch attempt.
5. Test concurrent duplicate invites for one family/email; only one pending membership
   should be created. Also test that a different family can invite the same email.
6. Invite the same email to two different families, accept one email link, and verify
   only that invitation becomes active while the other remains invited.

For existing Auth users, the function sends a sign-in OTP email and leaves the
membership unlinked until the account authenticates. A unique partial database
index prevents duplicate pending invitations for the same email in one family.
A service-role-only database helper also rejects an email already linked to an
active, invited or suspended Auth membership in that family, avoiding a duplicate
family login at acceptance time. The same email can be invited independently by
different families.
