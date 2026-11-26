# Family invitations

The family owner invites a member by name and email from Family & devices. The
family-invitations Edge Function verifies the caller is the owner and creates a
family_members row with status invited. New Auth users receive a Supabase Auth
invitation. If Supabase reports that the email already belongs to an Auth user,
the function sends that existing account a sign-in OTP instead and leaves
auth_user_id unlinked until acceptance. An invited member is not active and must
not be granted family-data access.

When the invitee follows the Auth invitation or existing-user sign-in email,
authenticates, and the app starts, the app calls the same function with action
accept. The function compares the authenticated account's email with the stored
invitation email, then links the account and activates the membership. It updates
each invitation conditionally so a concurrent acceptance cannot link it to a
different user. The service-role key is used only inside the Edge Function and
must never be exposed to the browser.

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
4. Test with a separate email account: pending invitation, no family access before
   acceptance, acceptance after sign-in, active access after acceptance, and rejection
   of an email-mismatch attempt.

This initial implementation uses Supabase Auth inviteUserByEmail. An address already
registered with Auth may be rejected by Supabase and requires a separate account-linking
flow; the function fails closed rather than granting access.
