# PR #5 corrective changes and validation

## New migrations

Apply these after the existing PR #5 migrations, in filename order:

1. `20261126_pr5_pairing_rate_limit.sql`
2. `20261126_pr5_repayment_state_atomicity.sql`
3. `20261126_pr5_sms_retry_and_device_enrollment_hardening.sql`

Do not deploy the Edge Functions before applying these migrations. The device enrollment function calls `register_paired_device` and `consume_device_pairing_attempt`; the repayment UI calls `set_credit_card_repayment_status` and `allocate_credit_card_repayment`.

## Corrected behavior

- `card_payment_bank_debit` is accepted by the SMS event constraint.
- SMS import retries re-read stored events and materialize any expense whose event has no `linked_expense_id`. The expense unique key makes replay idempotent; the importer reads back existing expenses and repairs event links.
- Pairing code consumption, device creation and audit insertion are one database transaction. A failed device insert rolls back the code claim.
- Pairing attempts are rate-limited persistently per source IP hash (8 attempts per 15-minute window).
- Device status checks take the secret only from the Authorization bearer header and reject inactive family members.
- Credit-card bill settlement is driven by the repayment/allocation ledger. Legacy manual bank-expense matching and manual settlement confirmation were removed from the bill UI.
- Allocation and repayment stage transitions run through database functions with row locks. A bill is settled only when fully allocated and every contributing repayment is issuer-credited.
- New family member records are created as `invited`, not falsely marked `active`. An authenticated invitation/acceptance workflow is still required before that member can pair devices or access family data.

## Required verification before merge

- Apply migrations to a disposable Supabase project first.
- Test every SMS event kind, especially `card_payment_bank_debit`.
- Simulate failure after event insertion and before expense insertion; retry the same batch and verify exactly one expense and a non-null `linked_expense_id`.
- Simulate failure after expense insertion and before event linking; retry and verify the event link is repaired without a duplicate expense.
- Test pairing success, expired/used code, inactive member, duplicate device identifier, and rate-limit response.
- Verify device status with pending, approved, suspended, revoked and inactive-member cases.
- Test partial/split allocations, concurrent allocations, over-allocation, wrong-card allocation, partial repayment, and issuer-credit transitions.
- Confirm a bill remains unsettled until the full amount is allocated and every contributing repayment is credited.
- Run authenticated family-isolation/RLS tests and actual iPhone Shortcut tests.

## Validation status

The GitHub connector reports no workflow runs or commit status checks for the current PR head. No SQL migration has been applied to the live Supabase project in this change, and no Edge Function deployment, authenticated HTTP test, browser test or iPhone test has been performed. Do not treat the changes as production-verified until the checklist passes.
