# PR #5 corrective changes and validation

## New migrations

Apply these after the family/device foundation and family RLS migrations, in filename order:

1. `20261126_pr5_family_invitations.sql`
2. `20261126_pr5_pairing_rate_limit.sql`
3. `20261126_pr5_repayment_state_atomicity.sql`
4. `20261126_pr5_sms_retry_and_device_enrollment_hardening.sql`

Do not deploy the Edge Functions before applying these migrations. The device enrollment function calls `register_paired_device` and `consume_device_pairing_attempt`; the repayment UI calls `set_credit_card_repayment_status` and `allocate_credit_card_repayment`.

## Corrected behavior

- `card_payment_bank_debit` is accepted by the SMS event constraint.
- SMS import retries re-read stored events and materialize any expense whose event has no `linked_expense_id`. The expense unique key makes replay idempotent; the importer reads back existing expenses and repairs event links.
- Pairing code consumption, device creation and audit insertion are one database transaction. A failed device insert rolls back the code claim.
- Pairing attempts are rate-limited persistently per source IP hash (8 attempts per 15-minute window).
- Device status checks take the secret only from the Authorization bearer header and reject inactive family members.
- Credit-card bill settlement is driven by the repayment/allocation ledger. Legacy manual bank-expense matching and manual settlement confirmation were removed from the bill UI.
- Allocation and repayment stage transitions run through database functions with row locks. A bill is settled only when fully allocated and every contributing repayment is issuer-credited.
- Family invitations use Supabase Auth email invitations for new accounts and sign-in OTP email for existing accounts. Membership remains `invited` until the authenticated account email matches; acceptance links and activates it server-side.
- Owner self-membership remains allowed when creating a family workspace, while browser clients cannot activate or link another account's membership.
- Accepted non-owner members receive a read-only Family & devices view for their own devices and assigned accounts. Family metadata remains owner-readable only to avoid the previous mutual-RLS recursion.
- Family member data policies continue to require active membership for family devices, linked financial accounts, SMS events and family expenses.

## Required verification before merge

- Apply migrations to a disposable Supabase project first.
- Test every SMS event kind, especially `card_payment_bank_debit`.
- Simulate failure after event insertion and before expense insertion; retry the same batch and verify exactly one expense and a non-null `linked_expense_id`.
- Simulate failure after expense insertion and before event linking; retry and verify the event link is repaired without a duplicate expense.
- Test pairing success, expired/used code, inactive member, duplicate device identifier, and rate-limit response.
- Verify device status with pending, approved, suspended, revoked and inactive-member cases.
- Test partial/split allocations, concurrent allocations, over-allocation, wrong-card allocation, partial repayment, and issuer-credit transitions.
- Confirm a bill remains unsettled until the full amount is allocated and every contributing repayment is credited.
- Test family creation after applying the invitation migration; verify the owner can still create their own active admin membership but cannot create a linked active member for another user.
- Test new-account invitation, existing-account OTP invitation, wrong-email rejection, duplicate pending invitation, concurrent duplicate invite requests for the same family/email, the same email invited by two different families, concurrent acceptance, and accepted member access.
- Verify an invited (not yet accepted) account cannot read family devices, linked accounts, SMS events or family expenses; verify an accepted member can read only their own devices/accounts where the policies scope by family member.
- Verify non-owner Family & devices UI is read-only and does not expose invite, approve, suspend, revoke, or account-reassignment controls.
- Run authenticated family-isolation/RLS tests and actual iPhone Shortcut tests.

## Validation status

No SQL migration has been applied to the live Supabase project in this change, and no Edge Function deployment, authenticated HTTP test, browser test or iPhone test has been performed. Static review only; do not treat the changes as production-verified until the checklist passes.
