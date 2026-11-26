import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const migrationDir = "supabase/migrations";
const migrations = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
const read = (name) => readFileSync(join(migrationDir, name), "utf8");
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, error: error.message });
  }
}

check("PR 5 corrective migrations exist in deterministic order", () => {
  const expected = [
    "20261126_pr5_family_invitations.sql",
    "20261126_pr5_pairing_rate_limit.sql",
    "20261126_pr5_repayment_state_atomicity.sql",
    "20261126_pr5_sms_retry_and_device_enrollment_hardening.sql",
  ];
  for (const file of expected) assert.ok(migrations.includes(file), `Missing migration: ${file}`);
  assert.deepEqual(expected, [...expected].sort());
});

check("Family invitations prevent duplicate pending email invitations", () => {
  const sql = read("20261126_pr5_family_invitations.sql");
  assert.match(sql, /create unique index if not exists uq_family_members_pending_invitation_email/i);
  assert.match(sql, /where status\s*=\s*'invited' and invited_email is not null/i);
});

check("Family membership email helper is restricted to service role", () => {
  const sql = read("20261126_pr5_family_invitations.sql");
  assert.match(sql, /security definer/i);
  assert.match(sql, /join auth\.users/i);
  assert.match(sql, /revoke all on function public\.family_has_auth_member_email\(uuid,text\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.family_has_auth_member_email\(uuid,text\) to service_role/i);
});

check("Pairing rate limit is private and enforces eight attempts per window", () => {
  const sql = read("20261126_pr5_pairing_rate_limit.sql");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.device_pairing_rate_limits from public,anon,authenticated/i);
  assert.match(sql, /attempt_count >= 8/i);
  assert.match(sql, /interval '15 minutes'/i);
});

check("Device registration consumes the code and writes the device atomically", () => {
  const sql = read("20261126_pr5_sms_retry_and_device_enrollment_hardening.sql");
  assert.match(sql, /create or replace function public\.register_paired_device/i);
  assert.match(sql, /update public\.device_pairing_codes[\s\S]*?returning \* into pairing/i);
  assert.match(sql, /insert into public\.family_devices/i);
  assert.match(sql, /insert into public\.family_device_audit/i);
  assert.match(sql, /grant execute on function public\.register_paired_device\(text,text,text\) to service_role/i);
});

check("Repayment allocation is restricted to credited repayments and locks rows", () => {
  const sql = read("20261126_pr5_sms_retry_and_device_enrollment_hardening.sql");
  assert.match(sql, /create or replace function public\.allocate_credit_card_repayment/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /r\.status <> 'credited'/i);
  assert.match(sql, /Allocation exceeds remaining repayment or bill amount/i);
});

check("Repayment transitions recalculate settlement from credited allocations", () => {
  const sql = read("20261126_pr5_repayment_state_atomicity.sql");
  assert.match(sql, /create or replace function public\.set_credit_card_repayment_status/i);
  assert.match(sql, /r\.status='processed' and p_next_status='credited'/i);
  assert.match(sql, /rp\.status<>'credited'/i);
  assert.match(sql, /revoke update on public\.credit_card_repayments from authenticated/i);
});

check("SMS retry path rereads stored events and repairs missing expense links", () => {
  const source = readFileSync("supabase/functions/sms-import/index.ts", "utf8");
  assert.match(source, /Re-read all submitted events, including duplicates/i);
  assert.match(source, /linked_expense_id/i);
  assert.match(source, /onConflict: "source_family_device_id,source_message_hash"/i);
  assert.match(source, /Transaction saved but event link could not be completed/i);
});

check("Family invitation function validates caller and email-bound acceptance", () => {
  const source = readFileSync("supabase/functions/family-invitations/index.ts", "utf8");
  assert.match(source, /caller\.auth\.getUser\(\)/);
  assert.match(source, /family_has_auth_member_email/);
  assert.match(source, /lower\(.*email|email.*toLowerCase/s);
  assert.match(source, /auth_user_id: userData\.user\.id/);
});

const failed = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name}`);
  if (item.error) console.error(`  ${item.error}`);
}
console.log(`\\nPR 5 guardrails: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exitCode = 1;
