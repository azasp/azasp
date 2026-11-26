# MyTracker iPhone SMS automation

## What this workflow does

- A family administrator creates a one-time iPhone pairing code in **Family & devices**.
- The code expires after 15 minutes and can be used once.
- The iPhone Shortcut uses that code on first run to register a device.
- The server assigns a UUID and a random device credential. The new device is `pending_approval`.
- The Shortcut saves the credential in its private iCloud Drive folder and reuses it on later runs.
- Each message-triggered run checks device approval before sending anything.
- Only locally classified financial candidates are sent to MyTracker.
- The server deduplicates messages and stores parsed metadata, not original SMS bodies.

## Endpoints

Base URL: `https://flkbctstpgsllyvunihm.supabase.co/functions/v1`

### First-run enrollment

`POST /device-enrollment`

Headers:
- `Content-Type: application/json`

Body:
```json
{
  "action": "register",
  "pairing_code": "ONE_TIME_CODE",
  "device_identifier": "Vikas Personal"
}
```

The response includes `device_id`, `device_secret` and `status`. Save the secret immediately; it is not returned again. The device starts pending approval.

### Approval check

`POST /device-enrollment`

Headers:
- `Authorization: Bearer <device_secret>`
- `Content-Type: application/json`

Body:
```json
{ "action": "status", "device_secret": "DEVICE_SECRET" }
```

Proceed only when `status` equals `approved`. Pending, rejected, suspended, revoked, missing or invalid credentials must stop the run.

### SMS import

`POST /sms-import`

Headers:
- `Authorization: Bearer <device_secret>`
- `Content-Type: application/json`

Body:
```json
{
  "device_id": "DEVICE_UUID",
  "messages": [
    {
      "body": "SMS BODY PROVIDED BY THE MESSAGE AUTOMATION",
      "sender": "SENDER",
      "received_at": "2026-11-26T09:30:00+05:30"
    }
  ]
}
```

The device credential is a scoped secret, not a Supabase service-role key or user password. Revoke the device in MyTracker to block future imports.

## iPhone Shortcut logic

Create a Personal Automation in Shortcuts using the **Message** trigger and choose **Run Immediately** where available.

The automation should:
1. Receive the message supplied by the Message trigger.
2. Read sender, message text and received date from the trigger input.
3. If no local credential file exists, ask for the one-time pairing code and friendly device name, call enrollment, then save `device_id` and `device_secret` to `iCloud Drive/Shortcuts/MyTracker/device.json`.
4. Call the approval endpoint on every run. Stop unless approved.
5. Apply a local financial-candidate filter. Suggested terms include debit, credited, UPI, NEFT, IMPS, RTGS, card, bill payment, paid, purchase, refund, reversed, EMI, interest, fee, charge, deposit, withdrawal, and transaction. Keep this filter conservative and test with real bank message formats.
6. If it is a candidate, POST one message to `/sms-import` using the device secret.
7. Do not store the SMS body in the configuration file or log it.

## Important iOS limitations

- The Message automation only receives messages that iOS exposes to that trigger. It is not a general permission to scan the entire Messages database.
- Apple may require sender/content criteria for a Message automation, depending on the iOS version. If the UI does not allow an unrestricted trigger, use the broadest supported trigger and understand that coverage is incomplete.
- This is not historical inbox backfill.
- Do not assume every SMS will trigger while the phone is locked or under all Focus/power conditions; test on the target iPhone.
- The first run needs the pairing code generated in MyTracker. The administrator must approve the pending device before imports begin.
- The device secret is a bearer credential. Anyone who obtains it can submit messages as that device until the device is revoked. Keep the configuration file private and never share it.

## Validation checklist

- Pairing code works once and expires after 15 minutes.
- New device appears as pending approval.
- Pending device cannot import.
- Approved device can call status and import.
- Suspended/revoked device cannot import.
- Repeated message is deduplicated.
- Non-financial sample messages do not reach the import endpoint.
- Test sender/date/message fields on the actual iOS version before enabling for all family members.
