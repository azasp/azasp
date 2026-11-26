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
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Server configuration is incomplete" });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const action = String(payload?.action || "");

  if (action === "register") {
    const code = normalizeCode(String(payload?.pairing_code || ""));
    const deviceIdentifier = String(payload?.device_identifier || "").trim().slice(0, 80);
    if (code.length < 16 || !deviceIdentifier) return json(400, { error: "A valid pairing code and friendly device name are required" });

    const deviceSecret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const [codeHash, deviceSecretHash] = await Promise.all([hash(code), hash(deviceSecret)]);
    // This RPC claims the one-time code and inserts the pending device/audit row atomically.
    const registered = await db.rpc("register_paired_device", {
      p_code_hash: codeHash,
      p_device_identifier: deviceIdentifier,
      p_device_secret_hash: deviceSecretHash
    });
    if (registered.error || !registered.data?.length) {
      const message = registered.error?.message || "Pairing could not be completed";
      const conflict = /invalid|expired|already used|active/i.test(message);
      return json(conflict ? 409 : 500, { error: conflict ? "Pairing code is invalid, expired, already used, or assigned to an inactive member" : "Could not register device" });
    }
    const device = registered.data[0];
    return json(201, {
      device_id: device.device_id,
      device_secret: deviceSecret,
      device_identifier: device.device_identifier,
      status: device.status,
      message: "Device registered. An administrator must approve it before SMS imports are accepted."
    });
  }

  if (action === "status") {
    const authHeader = req.headers.get("Authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const deviceSecret = match?.[1] || "";
    if (deviceSecret.length < 40) return json(401, { error: "Send the device credential as a Bearer token" });
    const deviceSecretHash = await hash(deviceSecret);
    const { data: device, error } = await db.from("family_devices")
      .select("id,family_id,family_member_id,status,device_identifier,last_import_at")
      .eq("device_secret_hash", deviceSecretHash).maybeSingle();
    if (error || !device) return json(401, { error: "Device credential is invalid" });
    const { data: member } = await db.from("family_members").select("status")
      .eq("id", device.family_member_id).eq("family_id", device.family_id).maybeSingle();
    if (!member || member.status !== "active") return json(403, { error: "Device owner is not an active family member" });
    await db.from("family_devices").update({ device_secret_last_used_at: new Date().toISOString() }).eq("id", device.id);
    return json(200, {
      device_id: device.id,
      status: device.status,
      device_identifier: device.device_identifier,
      last_import_at: device.last_import_at
    });
  }

  return json(400, { error: "action must be register or status" });
});
