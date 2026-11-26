import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors });
const hash = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
};
const normalizeCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST required" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json(500, { error: "Server configuration is incomplete" });

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const action = String(payload?.action || "");
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (action === "register") {
    const code = normalizeCode(String(payload?.pairing_code || ""));
    const deviceIdentifier = String(payload?.device_identifier || "").trim().slice(0, 80);
    if (code.length < 16 || !deviceIdentifier) return json(400, { error: "A valid pairing code and friendly device name are required" });
    const codeHash = await hash(code);
    const { data: pairing, error: pairingError } = await db.from("device_pairing_codes")
      .select("id,family_id,family_member_id,created_by,expires_at,used_at")
      .eq("code_hash", codeHash).maybeSingle();
    if (pairingError || !pairing) return json(401, { error: "Pairing code is invalid" });
    if (pairing.used_at || Date.parse(pairing.expires_at) <= Date.now()) return json(410, { error: "Pairing code has expired or was already used" });

    const claimed = await db.from("device_pairing_codes").update({ used_at: new Date().toISOString() })
      .eq("id", pairing.id).is("used_at", null).gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (claimed.error || !claimed.data) return json(409, { error: "Pairing code was already used; generate a new code in MyTracker" });

    const deviceSecret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const deviceSecretHash = await hash(deviceSecret);
    const inserted = await db.from("family_devices").insert({
      family_id: pairing.family_id,
      family_member_id: pairing.family_member_id,
      device_identifier: deviceIdentifier,
      device_type: "iphone",
      status: "pending_approval",
      registered_by: pairing.created_by,
      device_secret_hash: deviceSecretHash,
      device_secret_created_at: new Date().toISOString()
    }).select("id,status,device_identifier").single();
    if (inserted.error) return json(500, { error: "Could not register device", detail: inserted.error.message });

    await db.from("family_device_audit").insert({
      family_id: pairing.family_id, device_id: inserted.data.id,
      actor_user_id: pairing.created_by, action: "registered",
      details: { device_identifier: deviceIdentifier, registration_method: "ios_shortcut" }
    });

    return json(201, {
      device_id: inserted.data.id,
      device_secret: deviceSecret,
      device_identifier: inserted.data.device_identifier,
      status: inserted.data.status,
      message: "Device registered. An administrator must approve it before SMS imports are accepted."
    });
  }

  if (action === "status") {
    const deviceSecret = String(payload?.device_secret || "");
    if (deviceSecret.length < 40) return json(400, { error: "Device credential is missing" });
    const deviceSecretHash = await hash(deviceSecret);
    const { data: device, error } = await db.from("family_devices")
      .select("id,status,device_identifier,last_import_at")
      .eq("device_secret_hash", deviceSecretHash).maybeSingle();
    if (error || !device) return json(401, { error: "Device credential is invalid or revoked" });
    await db.from("family_devices").update({ device_secret_last_used_at: new Date().toISOString() }).eq("id", device.id);
    return json(200, { device_id: device.id, status: device.status, device_identifier: device.device_identifier, last_import_at: device.last_import_at });
  }

  return json(400, { error: "action must be register or status" });
});
