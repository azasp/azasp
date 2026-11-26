import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors });
const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
};
function parseSms(body: string) {
  const amountMatch = body.match(/(?:INR|RS\.?|₹)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i)
    || body.match(/([0-9][0-9,]*\.\d{2})\s*(?:INR|RS\.?)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;
  const ref = body.match(/(?:ref(?:erence)?\s*(?:no\.?|number)?|utr)\s*[:#-]?\s*([A-Z0-9]{8,24})/i)?.[1] || null;
  const last4 = body.match(/(?:ending|xx+|\*{2,}|a\/c\s*(?:no\.?)?\s*xx*)\s*([0-9]{4})/i)?.[1] || null;
  const cardContext = /credit\s*card|card\s*(?:account|payment|bill)/i.test(body);
  const processor = /billdesk|payment\s+(?:has\s+been\s+)?successfully\s+processed|expected\s+to\s+be\s+credited\s+to\s+your\s+credit\s+card/i.test(body);
  const cardCredited = /credited\s+to\s+your\s+credit\s+card|credit\s+card.{0,35}(?:credited|payment\s+received)/i.test(body);
  let event_kind = "unclassified";
  if (cardContext && cardCredited) event_kind = "card_payment_credited";
  else if (cardContext && processor) event_kind = "card_payment_processed";
  else if (amount && /\b(?:debited|spent|purchase|paid|sent|withdrawn)\b/i.test(body)) event_kind = "expense_debit";
  else if (amount && /\b(?:credited|received|deposited|refund)\b/i.test(body)) event_kind = "income_credit";
  const merchant = body.match(/\b(?:at|to)\s+([A-Z0-9][A-Z0-9 .&'-]{1,35})/i)?.[1]?.trim() || null;
  return { amount: Number.isFinite(amount) && amount! > 0 ? amount : null, payment_reference: ref, account_last4: last4, event_kind, merchant };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST required" });
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Missing bearer token" });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!url || !anonKey || !serviceKey) return json(500, { error: "Server configuration is incomplete" });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) return json(401, { error: "Invalid session" });
  const userId = authData.user.id;
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const deviceId = String(payload?.device_id || "");
  const messages = payload?.messages;
  if (!/^[0-9a-f-]{36}$/i.test(deviceId) || !Array.isArray(messages) || messages.length < 1 || messages.length > 500)
    return json(400, { error: "Provide a device_id and 1–500 messages" });

  const { data: device, error: deviceError } = await db.from("family_devices")
    .select("id,family_id,family_member_id,device_identifier,status").eq("id", deviceId).maybeSingle();
  if (deviceError || !device) return json(404, { error: "Device not found" });
  if (device.status !== "approved") return json(403, { error: "Device is not approved for imports" });
  const [{ data: family }, { data: member }] = await Promise.all([
    db.from("families").select("id,owner_user_id").eq("id", device.family_id).single(),
    db.from("family_members").select("id,auth_user_id,status").eq("id", device.family_member_id).single()
  ]);
  if (!family || !member || member.status !== "active") return json(403, { error: "Device owner is not an active family member" });
  if (family.owner_user_id !== userId && member.auth_user_id !== userId)
    return json(403, { error: "You are not authorised to import for this device" });

  const normalized = [];
  for (const item of messages) {
    const body = typeof item?.body === "string" ? item.body.slice(0, 4000) : "";
    if (!body.trim()) continue;
    const received = typeof item?.received_at === "string" && !Number.isNaN(Date.parse(item.received_at)) ? new Date(item.received_at).toISOString() : new Date().toISOString();
    const sender = typeof item?.sender === "string" ? item.sender.slice(0, 120) : null;
    const parsed = parseSms(body);
    normalized.push({ message_hash: await sha256(body.trim()), sender, received_at: received, ...parsed });
  }
  if (!normalized.length) return json(400, { error: "No valid messages supplied" });

  const batchResult = await db.from("expense_import_batches").insert({
    user_id: family.owner_user_id, family_id: family.id, source_family_device_id: device.id,
    source: "ios_messages", device_id: device.device_identifier, total_messages: normalized.length, status: "processing"
  }).select("id").single();
  if (batchResult.error) return json(500, { error: "Could not create import batch", detail: batchResult.error.message });
  const batchId = batchResult.data.id;

  const events = normalized.map(x => ({
    family_id: family.id, device_id: device.id, message_hash: x.message_hash, sender: x.sender,
    received_at: x.received_at, event_kind: x.event_kind, amount: x.amount,
    account_last4: x.account_last4, payment_reference: x.payment_reference
  }));
  const inserted = await db.from("sms_import_events").upsert(events, { onConflict: "device_id,message_hash", ignoreDuplicates: true }).select("id,message_hash");
  if (inserted.error) {
    await db.from("expense_import_batches").update({ status: "failed", failed_messages: normalized.length, completed_at: new Date().toISOString() }).eq("id", batchId);
    return json(500, { error: "Could not store import events", detail: inserted.error.message });
  }
  const newHashes = new Set((inserted.data || []).map(x => x.message_hash));
  const fresh = normalized.filter(x => newHashes.has(x.message_hash));
  const transactions = fresh.filter(x => x.event_kind === "expense_debit" || x.event_kind === "income_credit");
  const accountsResult = await db.from("financial_accounts").select("id,account_type,account_last4").eq("family_id", family.id).eq("is_active", true);
  const accounts = accountsResult.data || [];
  const expenseRows = transactions.map(x => {
    const account = x.account_last4 ? accounts.find(a => a.account_last4 === x.account_last4) : null;
    return {
      user_id: family.owner_user_id, family_id: family.id, source_family_device_id: device.id,
      transaction_date: x.received_at.slice(0, 10), transaction_type: x.event_kind === "income_credit" ? "income" : "expense",
      amount: x.amount, currency: "INR", description: x.merchant || (x.event_kind === "income_credit" ? "SMS credit" : "SMS debit"),
      original_description: null, category: "Uncategorised", merchant: x.merchant, financial_account_id: account?.id || null,
      source_app: "iOS Messages", source_device_id: device.device_identifier, source_sender: x.sender,
      original_message_date: x.received_at, import_batch_id: batchId, source_message_hash: x.message_hash,
      raw_data: { parser: "india_sms_v1", event_kind: x.event_kind, account_last4: x.account_last4 }
    };
  });
  let imported = 0;
  if (expenseRows.length) {
    const saved = await db.from("expenses").upsert(expenseRows, { onConflict: "source_family_device_id,source_message_hash", ignoreDuplicates: true }).select("id,source_message_hash");
    if (saved.error) {
      await db.from("expense_import_batches").update({ status: "partial", failed_messages: expenseRows.length, completed_at: new Date().toISOString() }).eq("id", batchId);
      return json(500, { error: "Events saved but transactions could not be imported", detail: saved.error.message, batch_id: batchId });
    }
    imported = saved.data?.length || 0;
    const byHash = new Map((saved.data || []).map(x => [x.source_message_hash, x.id]));
    for (const event of inserted.data || []) {
      const expenseId = byHash.get(event.message_hash);
      if (expenseId) await db.from("sms_import_events").update({ linked_expense_id: expenseId }).eq("id", event.id);
    }
  }
  const skipped = fresh.length - transactions.length + (normalized.length - fresh.length);
  await db.from("expense_import_batches").update({
    status: "completed", processed_messages: normalized.length, imported_transactions: imported,
    skipped_messages: skipped, failed_messages: 0, completed_at: new Date().toISOString()
  }).eq("id", batchId);
  await db.from("family_devices").update({ last_import_at: new Date().toISOString() }).eq("id", device.id);
  return json(200, { batch_id: batchId, received: normalized.length, new_messages: fresh.length, imported_transactions: imported, skipped_messages: skipped, repayment_events: fresh.filter(x => x.event_kind.startsWith("card_payment_")).length, message_bodies_stored: false });
});