// Supabase initialization, authentication, data loading and writes.
async function init() {
    if (typeof SUPABASE_URL === "undefined" || SUPABASE_URL.startsWith("PASTE")) { $("app").append(el("div", "card", "Add your Supabase URL and key in config.js.")); return }
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    configureActions({ load, draw, msg, isBusy: () => busy, setBusy: value => { busy = value; } });
    sb.auth.onAuthStateChange((ev, s) => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") start() });
    start();
}
async function start() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { me = null; login(); return }
    const sameUserAlreadyLoaded = Boolean(me && me.id === session.user.id && prof);
    me = session.user;
    // Check acceptance even for an already-loaded session: an existing user may
    // authenticate an invitation OTP in the same browser without changing user ID.
    let acceptedInvitation = false;
    try {
        const accepted = await sb.functions.invoke("family-invitations", { body: { action: "accept" } });
        if (accepted.error) console.warn("Family invitation acceptance check failed:", accepted.error.message);
        else acceptedInvitation = (accepted.data?.accepted || 0) > 0;
    } catch (e) { console.warn("Family invitation acceptance check failed:", e); }
    if (sameUserAlreadyLoaded) { if (acceptedInvitation) draw(); return; }
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
    const f = el("form", "card"); f.method = "post"; f.action = "#"; f.autocomplete = "on";
    const mk = (type, name, ph, ac) => { const i = el("input"); i.type = type; i.name = name; i.id = "f-" + name; i.placeholder = ph; i.autocomplete = ac; i.required = true; const r = el("div", "row"); r.append(i); f.append(r); return i };
    f.append(el("b", null, mode === "in" ? "Sign in" : "Create account"));
    const nI = mode === "up" ? mk("text", "name", "Your name", "name") : null;
    const em = mk("text", "email", "Phone number or email", "username");
    const pw = mk("password", "password", "Password (6+ characters)", mode === "in" ? "current-password" : "new-password");
    em.setAttribute("autocapitalize", "none"); em.setAttribute("autocorrect", "off");
    const go = el("button", "add", mode === "in" ? "Sign in" : "Create account"); go.type = "submit"; go.style.cssText = "margin-top:8px;width:100%";
    const sw = el("button", "link", mode === "in" ? "New here? Create account" : "Have an account? Sign in"); sw.type = "button"; sw.style.marginTop = "12px";
    sw.onclick = () => { msg(""); login(mode === "in" ? "up" : "in") };
    f.append(go, el("br"), sw);
    f.onsubmit = async ev => {
        ev.preventDefault(); msg("");
        if (mode === "in") { const { error } = await sb.auth.signInWithPassword({ email: toEmail(em.value), password: pw.value }); if (error) msg(error.message) }
        else { const { data, error } = await sb.auth.signUp({ email: toEmail(em.value), password: pw.value, options: { data: { name: nI.value.trim() } } }); if (error) msg(error.message); else if (!data.session) msg("Account created. Confirm the email we sent, then sign in.") }
    };
    A.append(f);
}
