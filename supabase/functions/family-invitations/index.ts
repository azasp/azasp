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

    const { data: existingInvite, error: existingInviteError } = await admin.from("family_members").select("id")
      .eq("family_id", familyId).eq("status", "invited").eq("invited_email", email).limit(1).maybeSingle();
    if (existingInviteError) return json({ error: "Could not verify existing invitations" }, 500);
    if (existingInvite) return json({ error: "This email already has a pending family invitation" }, 409);

    const { data: alreadyMember, error: memberCheckError } = await admin.rpc("family_has_auth_member_email", {
      p_family_id: familyId, p_email: email,
    });
    if (memberCheckError) return json({ error: "Could not verify family membership" }, 500);
    if (alreadyMember) return json({ error: "This account already belongs to the family" }, 409);

    // Reserve the pending membership before sending email. This closes the race where
    // an invitee follows the email immediately and accepts before a row exists.
    const { data: member, error: insertError } = await admin.from("family_members").insert({
      family_id: familyId, auth_user_id: null, invited_email: email,
      display_name: displayName, role: "member", status: "invited",
    }).select("id").single();
    if (insertError) {
      if (insertError.code === "23505") return json({ error: "This email already has a pending family invitation" }, 409);
      return json({ error: "Invitation could not be reserved: " + insertError.message }, 500);
    }

    const origin = req.headers.get("Origin");
    if (!origin) {
      await admin.from("family_members").delete().eq("id", member.id).eq("status", "invited");
      return json({ error: "App origin is required to deliver a family invitation" }, 400);
    }
    let invitationRedirect: string;
    try {
      const redirect = new URL("/", origin);
      redirect.searchParams.set("family_invitation", member.id);
      invitationRedirect = redirect.toString();
    } catch {
      await admin.from("family_members").delete().eq("id", member.id).eq("status", "invited");
      return json({ error: "Invalid app origin" }, 400);
    }

    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { family_invitation: true, family_id: familyId, family_invitation_id: member.id, display_name: displayName },
      redirectTo: invitationRedirect,
    });

    let invitedUserId: string | null = inviteData?.user?.id || null;
    const createdAuthUser = Boolean(invitedUserId);
    if (inviteError) {
      // Supabase reports an existing identity with a stable error code on supported versions.
      // Keep a narrow message fallback for older Auth responses.
      const code = String(inviteError.code || "").toLowerCase();
      const message = String(inviteError.message || "");
      const existingIdentity = ["email_exists", "user_already_exists", "identity_already_exists"].includes(code)
        || /already (registered|exists)|user.*already|email.*exists/i.test(message);
      if (!existingIdentity) {
        await admin.from("family_members").delete().eq("id", member.id).eq("status", "invited");
        return json({ error: message || "Could not send invitation" }, 400);
      }

      // Existing Auth identities receive a sign-in OTP; acceptance remains email-bound.
      const { error: otpError } = await admin.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: invitationRedirect },
      });
      if (otpError) {
        await admin.from("family_members").delete().eq("id", member.id).eq("status", "invited");
        return json({ error: "Could not send sign-in email to the existing account: " + otpError.message }, 400);
      }
    } else if (!invitedUserId) {
      await admin.from("family_members").delete().eq("id", member.id).eq("status", "invited");
      return json({ error: "Auth did not return an invited user" }, 400);
    }

    // Link the newly-created Auth identity after successful delivery. For existing
    // identities this remains null until the recipient authenticates and accepts.
    if (invitedUserId) {
      const { error: linkError } = await admin.from("family_members")
        .update({ auth_user_id: invitedUserId, updated_at: new Date().toISOString() })
        .eq("id", member.id);
      if (linkError) {
        if (createdAuthUser) await admin.auth.admin.deleteUser(invitedUserId);
        await admin.from("family_members").delete().eq("id", member.id).eq("status", "invited");
        return json({ error: "Invitation could not be linked: " + linkError.message }, 500);
      }
    }
    return json({
      success: true, member_id: member.id,
      delivery: createdAuthUser ? "auth_invitation" : "sign_in_link",
    });
  }

  if (body.action === "accept") {
    const invitationId = String(body.invitation_id || "").trim();
    if (!invitationId) return json({ error: "The specific family invitation is required" }, 400);

    const email = userData.user.email.toLowerCase();
    const { data: invitation, error: invitationError } = await admin.from("family_members")
      .select("id,auth_user_id,invited_email,status")
      .eq("id", invitationId).eq("status", "invited").maybeSingle();
    if (invitationError) return json({ error: invitationError.message }, 500);
    if (!invitation || String(invitation.invited_email || "").toLowerCase() !== email)
      return json({ error: "This invitation does not belong to the authenticated email account" }, 403);
    if (invitation.auth_user_id && invitation.auth_user_id !== userData.user.id)
      return json({ error: "This invitation is already linked to another account" }, 409);

    let update = admin.from("family_members")
      .update({ auth_user_id: userData.user.id, status: "active", updated_at: new Date().toISOString() })
      .eq("id", invitation.id).eq("status", "invited");
    update = invitation.auth_user_id
      ? update.eq("auth_user_id", userData.user.id)
      : update.is("auth_user_id", null);
    const { data: changed, error: updateError } = await update.select("id");
    if (updateError) return json({ error: updateError.message }, 500);
    return json({ success: true, accepted: changed?.length || 0 });
  }
  return json({ error: "Unsupported action" }, 400);
});
