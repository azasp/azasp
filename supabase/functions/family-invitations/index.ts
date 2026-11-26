import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user?.id || !userData.user.email) return json({ error: "Valid authenticated email account required" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  if (body.action === "invite") {
    const familyId = String(body.family_id || "");
    const displayName = String(body.display_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    if (!familyId || !displayName || displayName.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json({ error: "Family, name and valid email are required" }, 400);

    const { data: family, error: familyError } = await admin.from("families")
      .select("id,owner_user_id").eq("id", familyId).maybeSingle();
    if (familyError || !family || family.owner_user_id !== userData.user.id)
      return json({ error: "Only the family owner can invite members" }, 403);

    const { data: existing } = await admin.from("family_members").select("id")
      .eq("family_id", familyId).ilike("invited_email", email).maybeSingle();
    if (existing) return json({ error: "This email already has a family invitation" }, 409);

    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { family_invitation: true, family_id: familyId, display_name: displayName },
    });
    if (inviteError || !inviteData.user) return json({ error: inviteError?.message || "Could not send invitation" }, 400);

    const { data: member, error: insertError } = await admin.from("family_members").insert({
      family_id: familyId, auth_user_id: inviteData.user.id, invited_email: email,
      display_name: displayName, role: "member", status: "invited",
    }).select("id").single();
    if (insertError) {
      await admin.auth.admin.deleteUser(inviteData.user.id);
      return json({ error: "Invitation could not be recorded: " + insertError.message }, 500);
    }
    return json({ success: true, member_id: member.id });
  }

  if (body.action === "accept") {
    const email = userData.user.email.toLowerCase();
    const { data: pending, error: pendingError } = await admin.from("family_members")
      .select("id,invited_email").eq("auth_user_id", userData.user.id).eq("status", "invited");
    if (pendingError) return json({ error: pendingError.message }, 500);
    const matches = (pending || []).filter((m) => (m.invited_email || "").toLowerCase() === email);
    if (!matches.length) return json({ success: true, accepted: 0 });
    const { error: updateError } = await admin.from("family_members")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .in("id", matches.map((m) => m.id)).eq("auth_user_id", userData.user.id).eq("status", "invited");
    if (updateError) return json({ error: updateError.message }, 500);
    return json({ success: true, accepted: matches.length });
  }
  return json({ error: "Unsupported action" }, 400);
});
