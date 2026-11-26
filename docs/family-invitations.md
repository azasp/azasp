# Family invitations

The family owner invites a member by name and email from Family & devices. The
family-invitations Edge Function verifies the caller is the owner, sends a Supabase
Auth invitation, and creates a family_members row with status invited. An invited
member is not active and must not be granted family-data access.

When the invitee opens the Auth invitation, completes sign-in, and the app starts,
the app calls the same function with action accept. The function verifies that the
authenticated user's email matches the stored invitation email before changing the
membership status to active. The service-role key is used only inside the Edge
Function and must never be exposed to the browser.

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
