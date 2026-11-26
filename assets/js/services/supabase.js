// Supabase initialization, authentication, data loading and writes.
async function init() {
    if (typeof SUPABASE_URL === "undefined" || SUPABASE_URL.startsWith("PASTE")) { $("app").append(el("div", "card", "Add your Supabase URL and key in config.js.")); return }
    // Keep the Supabase session in browser storage across reloads and app visits.
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.localStorage
        }
    });
    configureActions({ load, draw, msg, isBusy: () => busy, setBusy: value => { busy = value; } });
    // Defer work until the auth callback releases its internal lock. Calling
    // getSession()/database methods directly inside this callback can race sign-in.
    sb.auth.onAuthStateChange((ev, session) => {
        if (ev === "SIGNED_IN") window.setTimeout(() => start(session), 0);
        if (ev === "SIGNED_OUT") window.setTimeout(() => {
            me = null; prof = null; kids = []; items = []; profs = []; masters = [];
            login();
        }, 0);
    });
    start();
}
async function start(authSession) {
    const session = authSession || (await sb.auth.getSession()).data.session;
    if (!session) { me = null; login(); return }
    const sameUserAlreadyLoaded = Boolean(me && me.id === session.user.id && prof);
    me = session.user;
    // Only accept the exact invitation identifier carried by its email redirect.
    // Never activate every pending invitation that happens to share this email.
    const invitationId = new URLSearchParams(window.location.search).get("family_invitation");
    let acceptedInvitation = false;
    if (invitationId) {
        try {
            const accepted = await sb.functions.invoke("family-invitations", {
                body: { action: "accept", invitation_id: invitationId }
            });
            if (accepted.error) console.warn("Family invitation acceptance failed:", accepted.error.message);
            else {
                acceptedInvitation = (accepted.data?.accepted || 0) > 0;
                const cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete("family_invitation");
                window.history.replaceState({}, "", cleanUrl.toString());
            }
        } catch (e) { console.warn("Family invitation acceptance failed:", e); }
    }
    if (sameUserAlreadyLoaded) { if (acceptedInvitation) { await load(); draw(); } return; }
    await load(); draw();
}
async function load() {
    const [k, e, p, m] = await Promise.all([sb.from("kids").select("*").order("created_at"), sb.from("entries").select("*").order("created_at", { ascending: false }), sb.from("profiles").select("*"), sb.from("masters").select("*").order("name")]);
    if (k.error || e.error || p.error || m.error) msg("Could not load data: " + ((k.error || e.error || p.error || m.error).message));
    kids = k.data || []; items = e.data || []; profs = p.data || []; masters = m.data || []; prof = profs.find(x => x.id === me.id) || null;
    if (prof && prof.role === "admin" && !kids.length) { await sb.from("kids").insert({ name: "My child" }); const r = await sb.from("kids").select("*"); kids = r.data || [] }
    // Expense tables are created by the consolidated MyTracker expense SQL migration.
    const [ex, ca, sc, sf, batches] = await Promise.all([
        sb.from("expenses").select("*").order("transaction_date", { ascending: false }),
        sb.from("expense_categories").select("*").eq("is_active", true).order("display_order").order("name"),
        sb.from("expense_subcategories").select("*").eq("is_active", true).order("display_order").order("name"),
        sb.from("saved_expense_filters").select("*").eq("is_active", true).order("is_favorite", { ascending: false }).order("display_order").order("name"),
        sb.from("expense_import_batches").select("*").order("created_at", { ascending: false }).limit(20)
    ]);
    expenses = ex.data || []; expenseCategories = ca.data || []; expenseSubcategories = sc.data || []; savedExpenseFilters = sf.data || [];
    expenseImportBatches = batches.data || []; expenseBatchLoadError = batches.error ? batches.error.message : "";
    if (ex.error || ca.error || sc.error || sf.error) expenseLoadError = (ex.error || ca.error || sc.error || sf.error).message;
    else expenseLoadError = "";
}

function login(mode) {
    mode = mode || "in";
    $("who").textContent = ""; $("side").textContent = ""; $("mb").style.display = "none"; const A = $("app"); A.textContent = "";
    const f = el("form", "card"); f.method = "post"; f.action = window.location.pathname; f.autocomplete = "on";
    f.setAttribute("data-form-type", mode === "in" ? "login" : "register");
    const mk = (type, name, ph, ac) => { const i = el("input"); i.type = type; i.name = name; i.id = "f-" + name; i.placeholder = ph; i.autocomplete = ac; i.required = true; const r = el("div", "row"); r.append(i); f.append(r); return i };
    f.append(el("b", null, mode === "in" ? "Sign in" : "Create account"));
    const nI = mode === "up" ? mk("text", "name", "Your name", "name") : null;
    const em = mk("text", "username", "Phone number or email", "username");
    em.setAttribute("inputmode", "email");
    const pw = mk("password", "password", "Password (6+ characters)", mode === "in" ? "current-password" : "new-password");
    pw.setAttribute("data-1p-ignore", "false");
    em.setAttribute("autocapitalize", "none"); em.setAttribute("autocorrect", "off");
    const go = el("button", "add", mode === "in" ? "Sign in" : "Create account"); go.type = "submit"; go.style.cssText = "margin-top:8px;width:100%";
    const sw = el("button", "link", mode === "in" ? "New here? Create account" : "Have an account? Sign in"); sw.type = "button"; sw.style.marginTop = "12px";
    sw.onclick = () => { msg(""); login(mode === "in" ? "up" : "in") };
    f.append(go, el("br"), sw);
    f.onsubmit = async ev => {
        ev.preventDefault(); msg(""); go.disabled = true;
        try {
            if (mode === "in") {
                const { error } = await sb.auth.signInWithPassword({ email: toEmail(em.value), password: pw.value });
                if (error) msg(error.message);
            } else {
                const { data, error } = await sb.auth.signUp({ email: toEmail(em.value), password: pw.value, options: { data: { name: nI.value.trim() } } });
                if (error) msg(error.message);
                else if (!data.session) msg("Account created. Confirm the email we sent, then sign in.");
            }
        } catch (error) { msg(error.message || "Sign-in failed. Please try again."); }
        finally { go.disabled = false; }
    };
    A.append(f);
}
