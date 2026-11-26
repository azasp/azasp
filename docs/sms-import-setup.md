# MyTracker approved-device SMS import

## Endpoint

`POST https://flkbctstpgsllyvunihm.supabase.co/functions/v1/sms-import`

The function accepts either a valid Supabase user access token or a scoped per-device credential issued by `device-enrollment`. For iPhone Shortcuts, use the device credential. Never use a Supabase service-role key.

Headers:

- `Authorization: Bearer <device_secret>` (iPhone Shortcut) or `<current Supabase access token>` (authenticated app)
- `apikey: <Supabase publishable/anon key>`
- `Content-Type: application/json`

Body:

```json
{
  "device_id": "UUID shown beside the registered device in Family & devices",
  "messages": [
    {
      "body": "Bank SMS text",
      "sender": "BANK-SENDER",
      "received_at": "2026-11-26T09:30:00+05:30"
    }
  ]
}
```

Send 1–500 messages per request. The function rejects devices that are not approved, verifies that the signed-in user is the family owner or the authenticated owner of that device, and deduplicates each message by a SHA-256 hash scoped to the device.

## What is stored

- A hash, sender, received timestamp, event classification, amount, last four digits and payment reference.
- Parsed debit/credit transactions are stored as expenses.
- BillDesk / credit-card repayment messages are stored as repayment events rather than ordinary expenses, to avoid counting the repayment as new spending.
- The original SMS body is not stored in the database.

Account matching is conservative: a last-four match is linked only when exactly one active family account matches. Ambiguous messages remain unlinked for review.

## iPhone limitation

This endpoint does not grant an app permission to read the iPhone's entire Messages history. iOS Shortcuts must supply messages that the user explicitly shares or that an allowed Shortcut/automation provides. Historical backfill and a reliable all-sender workflow still need to be configured and tested on the actual iPhones.

## Important current scope

The importer records BillDesk/card-credit events but does not automatically pair every processor message with its bank debit. Review the SMS events and confirm the processor and issuer-credit stages in the repayment screen. Never mark a card credited based only on a BillDesk processing confirmation.


## iPhone first-run enrollment

See [iPhone SMS automation](./iphone-sms-automation.md). The family administrator creates a one-time pairing code from **Family & devices**. The Shortcut exchanges it with `POST /device-enrollment`, receives a device UUID and scoped device secret, and the device remains pending approval. The Shortcut must call the enrollment status action before each import and stop unless the device is approved. Device secrets can be revoked by changing the device status in MyTracker.
