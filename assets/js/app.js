// Main application rendering and feature orchestration.
function stats(k) {
    const l = items.filter(i => i.kid_id === k), s = c => l.filter(i => i.cat === c);
    const sg = a => a.reduce((t, i) => t + i.num * (i.sign == 0 ? 1 : -1), 0);
    return { bal: sg(s("money")), st: sg(s("stars")), spent: s("shop").filter(i => i.done).reduce((t, i) => t + i.num, 0), temp: (s("health").find(i => hsub(i) === "temp" && i.num) || {}).num }
}
function draw() {
    if (busy) return;
    const A = $("app"), sd = $("side");
    A.textContent = "";
    sd.textContent = "";
    $("who").textContent = "";
    const r = role(), al = ALLOW[r] || [];

    // Keep account identity and sign-out available in the navigation drawer.
    $("mb").style.display = "";
    const account = el("div", "side-account");
    account.append(
        el("div", "side-account-name", prof?.name || me?.user_metadata?.name || "My account"),
        el("div", "side-account-email", shown(me?.email || "")),
        el("div", "side-account-role", r === "admin" ? "Administrator" : (ROLES[r] || r))
    );
    const actions = el("div", "side-account-actions");
    if (al.includes("profile")) {
        const profileButton = el("button", "side-account-link", "👤 Profile");
        profileButton.onclick = () => {
            tab = "profile";
            sd.classList.remove("open");
            $("ov").classList.remove("show");
            draw();
        };
        actions.append(profileButton);
    }
    const signOutButton = el("button", "side-account-link sign-out", "↪ Sign out");
    signOutButton.onclick = async () => {
        signOutButton.disabled = true;
        const { error } = await sb.auth.signOut();
        if (error) {
            signOutButton.disabled = false;
            msg("Could not sign out: " + error.message);
        }
    };
    actions.append(signOutButton);
    account.append(actions);
    sd.append(account);

    if (!al.length) {
        A.append(el("div", "card", "Your account is waiting for approval. Ask the admin to give you a role, then reload."));
        return;
    }

    // Show the live database quota status across all admin pages.
    if (r === "admin") {
        renderGlobalResourceNotice(A);
        if (!resourceMetricsLoading && (!resourceMetricsCache || Date.now() - resourceMetricsCacheAt >= RESOURCE_METRICS_TTL_MS)) {
            refreshResourceMetrics(false).then(() => {
                if (role() === "admin" && !busy) draw();
            });
        }
    }

    if (r === "child" && prof?.kid_id) kid = prof.kid_id;
    else if (!kids.find(k => k.id === kid)) kid = kids[0] && kids[0].id;
    if (!al.includes(tab)) tab = al[0];

    // Person selection is relevant only to child-specific tracker sections.
    const kidScopedTabs = ["money", "stars", "shop", "classes", "health", "rewards"];
    if (r !== "child" && kids.length > 1 && kidScopedTabs.includes(tab)) {
        const picker = el("div", "side-kid-picker");
        picker.append(el("label", "side-kid-label", "Viewing"));
        const select = el("select", "side-kid-select");
        kids.forEach(k => {
            const option = el("option", null, kl(k));
            option.value = k.id;
            select.append(option);
        });
        select.value = kid || "";
        select.onchange = () => { kid = select.value; draw(); };
        picker.append(select);
        sd.append(picker);
    }

    sd.append(el("div", "side-divider"));
    al.forEach(k => {
        const b = el("button", k === tab ? "on" : "", TABS[k].n);
        b.onclick = () => {
            tab = k;
            sd.classList.remove("open");
            $("ov").classList.remove("show");
            draw();
        };
        sd.append(b);
    });

    const S = el("div", "card"), F = el("div", "card"), L = el("div", "card");
    if (tab === "over") overview(S);
    else if (tab === "people") people(S, F, L);
    else if (tab === "masters") masterTab(S);
    else if (tab === "profile") profileTab(S);
    else if (tab === "rewards") rewardsTab(S, F, L, r);
    else if (tab === "expenses") expensesTab(S, F, L, r);
    else if (tab === "family") familyDevicesTab(S, F, L);
    else if (tab === "resources") resourcesTab(S, F, L);
    else entries(S, F, L, r);
    [S, F, L].forEach(x => { if (x.childNodes.length) A.append(x); });
}
let ovKid = null;
function overview(S) {
    if (!kids.length) { S.append(el("div", "sub", "No people yet.")); return }
    let def = null; try { def = localStorage.getItem("mt-default") } catch (e) { }
    const dId = (kids.find(k => k.id === def) || kids[0]).id;
    if (!kids.find(k => k.id === ovKid)) ovKid = dId;
    const k = kids.find(x => x.id === ovKid), t = stats(k.id);
    const chips = el("div"); chips.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
    kids.forEach(x => { const b = el("button", "add", (x.id === dId ? "★ " : "") + kl(x)); if (x.id !== ovKid) b.style.cssText = "background:var(--bd);color:var(--tx)"; b.onclick = () => { ovKid = x.id; draw() }; chips.append(b) });
    S.append(chips);
    const g = el("div"); g.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px";
    [["Money", "₹" + t.bal.toFixed(2), false], ["Stars", String(t.st), t.st < 0], ["Shopping spent", "₹" + t.spent.toFixed(2), false], ["Last temperature", t.temp ? t.temp + "°F" : "—", t.temp >= 100.4]].forEach(([a, b, bad]) => {
        const c = el("div"); c.style.cssText = "border:1px solid var(--bd);border-radius:10px;padding:10px";
        const v = el("div", bad ? "neg" : null, b); v.style.cssText = "font-size:22px;font-weight:700"; c.append(el("div", "sub", a), v); g.append(c)
    });
    S.append(g);
    if (k.id !== dId) { const d = el("button", "link", "Make " + k.name + " the default"); d.style.marginTop = "10px"; d.onclick = () => { try { localStorage.setItem("mt-default", k.id) } catch (e) { } draw() }; S.append(d) }
    const rec = items.filter(i => i.kid_id === k.id).slice(0, 3);
    if (rec.length) {
        const h = el("div", "sub", "Latest"); h.style.marginTop = "14px"; S.append(h);
        rec.forEach(i => { const d = el("div", null, (TABS[i.cat] ? TABS[i.cat].n.split(" ")[0] : "") + " " + (i.text || TABS[i.cat].n.split(" ").slice(1).join(" ")) + " · " + (i.date || "")); d.style.cssText = "padding:6px 0;font-size:15px"; S.append(d) })
    }
}
function entries(S, F, L, r) {
    const T = TABS[tab], list = items.filter(i => i.cat === tab && i.kid_id === kid), canAdd = ["admin", "parent", "teacher"].includes(r);
    if (T.sign) { const tot = list.reduce((t, i) => t + i.num * (i.sign == 0 ? 1 : -1), 0); S.append(el("div", "sub", tab === "money" ? "Balance" : "Total stars"), el("div", "big" + (tot < 0 ? " neg" : ""), (tab === "money" ? "₹" : "") + tot.toFixed(tab === "money" ? 2 : 0))) }
    else if (tab === "shop") S.append(el("div", "sub", "Spent so far"), el("div", "big", "₹" + list.filter(i => i.done).reduce((t, i) => t + i.num, 0).toFixed(2)));
    else if (tab === "health") healthSummary(S, list);
    else S.append(el("div", "sub", "Entries"), el("div", "big", list.length));
    if (tab === "stars" && ALLOW[r].includes("rewards")) { const g = el("button", "link", "🎁 Redeem stars →"); g.style.marginTop = "10px"; g.onclick = () => { tab = "rewards"; draw() }; S.append(g) }
    if (canAdd) {
        let hs, r0; if (tab === "health") { hs = el("select"); Object.keys(HT).forEach(k => { const o = el("option", null, HT[k][0]); o.value = k; hs.append(o) }); r0 = el("div", "row"); r0.append(hs) }
        const txt = el("input"); txt.placeholder = T.txt; const r1 = el("div", "row"); r1.append(txt);
        const r2 = el("div", "row"); let num, sg;
        if (T.num) { num = el("input"); num.type = "number"; num.step = "any"; num.inputMode = "decimal"; num.placeholder = T.num; r2.append(num) }
        if (T.sign) { sg = el("select"); T.sign.forEach((o, i) => { const op = el("option", null, o); op.value = i; sg.append(op) }); r2.append(sg) }
        const dt = el("input"); dt.type = "date"; dt.value = new Date().toISOString().slice(0, 10); r2.append(dt);
        const ad = el("button", "add", "Add");
        ad.onclick = () => {
            const v = num ? parseFloat(num.value) : 0; if (!txt.value.trim() && !(num && !isNaN(v))) return;
            act(sb.from("entries").insert({ kid_id: kid, cat: tab, sub: hs ? hs.value : null, text: txt.value.trim(), num: isNaN(v) ? 0 : v, sign: sg ? +sg.value : 0, date: dt.value }))
        };
        r2.append(ad);
        const ml = masters.filter(m => m.kind === KMAP[tab]); let pm;
        if (ml.length) {
            pm = el("select"); const o0 = el("option", null, "Pick from list…"); o0.value = ""; pm.append(o0);
            ml.forEach(m => { const o = el("option", null, m.name + (m.value ? " (" + (tab === "shop" ? "₹" : "") + m.value + ")" : "")); o.value = m.id; pm.append(o) });
            pm.onchange = () => { const m = ml.find(x => x.id === pm.value); if (m) { txt.value = m.name; if (num && m.value) num.value = Math.abs(m.value); if (sg && tab === "stars") sg.value = m.value < 0 ? 1 : 0 } }
        }
        if (hs) { hs.onchange = () => { const u = HT[hs.value][1]; num.style.display = u ? "" : "none"; num.placeholder = u ? "Value (" + u + ")" : ""; num.value = ""; if (pm) pm.style.display = hs.value === "med" ? "" : "none" }; hs.onchange(); F.append(r0) }
        if (pm) F.append(pm); F.append(r1, r2)
    }
    if (!list.length) L.append(el("div", "sub", "Nothing yet."));
    list.forEach(i => {
        const it = el("div", "item"), left = el("div"), t = el("div", null, (tab === "health" ? HT[hsub(i)][0] + (i.text ? " · " : "") : "") + (i.text || (tab === "health" ? "" : "(no note)")));
        if (tab === "shop" && i.done) t.style.textDecoration = "line-through";
        left.append(t, el("div", "sub", (i.date || "") + " · " + (tab === "stars" ? "given by " : "by ") + (i.by ? (nm(i.by) || "removed user") : "unknown") + " · " + tm(i.created_at)));
        const right = el("div"); right.style.cssText = "display:flex;align-items:center;gap:4px";
        if (T.sign) right.append(el("b", i.sign == 0 ? "pos" : "neg", (i.sign == 0 ? "+" : "−") + (tab === "money" ? "₹" : "") + i.num));
        else if (tab === "shop") { right.append(el("span", null, "₹" + i.num)); const c = el("input"); c.type = "checkbox"; c.checked = !!i.done; c.disabled = !(r === "admin" || r === "parent"); c.style.cssText = "flex:none;width:22px;height:22px"; c.onchange = () => act(sb.from("entries").update({ done: c.checked }).eq("id", i.id)); right.append(c) }
        else if (tab === "health") { const u = hsub(i); if (i.num) right.append(el("b", u === "temp" && i.num >= 100.4 ? "fever" : null, i.num + " " + HT[u][1])) }
        if (r === "admin") { const x = el("button", "x", "✕"); x.onclick = () => { if (confirm("Delete this entry?")) act(sb.from("entries").delete().eq("id", i.id)) }; right.append(x) }
        it.append(left, right); L.append(it)
    });
}

function healthSummary(S, list) {
    const last = k => list.find(i => hsub(i) === k && (k === "doc" || k === "vac" || i.num));
    const t = last("temp"), w = last("weight"), h = last("height"), d = last("doc"), v = last("vac");
    const g = el("div"); g.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px";
    [["Last temp", t && t.num + "°F", t && t.num >= 100.4], ["Weight", w && w.num + " kg"], ["Height", h && h.num + " cm"], ["Last doctor visit", d && d.date], ["Last vaccine", v && (v.text || v.date)]].forEach(([a, b, f]) => { const c = el("div"); c.append(el("div", "sub", a), el("div", f ? "fever" : null, b || "—")); c.lastChild.style.fontSize = "18px"; g.append(c) });
    S.append(g);
    const ts = list.filter(i => hsub(i) === "temp" && i.num).slice(0, 14).reverse();
    if (ts.length > 1) {
        const ns = "http://www.w3.org/2000/svg", sv = document.createElementNS(ns, "svg"); sv.setAttribute("viewBox", "0 0 300 70"); sv.style.cssText = "width:100%;margin-top:10px";
        const lo = Math.min(97, ...ts.map(i => i.num)), hi = Math.max(101, ...ts.map(i => i.num)), Y = q => 65 - (q - lo) / (hi - lo) * 60, X = k => 10 + k * 280 / (ts.length - 1);
        const f = document.createElementNS(ns, "line");[["x1", 0], ["x2", 300], ["y1", Y(100.4)], ["y2", Y(100.4)], ["stroke", "#c0392b"], ["stroke-dasharray", "4 4"]].forEach(([a, b]) => f.setAttribute(a, b));
        const pl = document.createElementNS(ns, "polyline");[["points", ts.map((i, k) => X(k) + "," + Y(i.num)).join(" ")], ["fill", "none"], ["stroke", "#e8a200"], ["stroke-width", "2.5"]].forEach(([a, b]) => pl.setAttribute(a, b));
        sv.append(f, pl); S.append(sv, el("div", "sub", "Temperature trend (dashed line = 100.4°F)"))
    }
}
function redeem(S, tot) {
    const rate = (masters.find(m => m.kind === "rate") || {}).value, rw = masters.filter(m => m.kind === "reward");
    const h = el("b", null, "Redeem stars"); h.style.cssText = "display:block;margin-top:14px"; S.append(h);
    const a = el("div", "row"), rs = el("select"), o0 = el("option", null, rw.length ? "Pick a reward…" : "No rewards yet (add in Masters)"); o0.value = ""; rs.append(o0);
    rw.forEach(m => { const o = el("option", null, m.name + " — " + m.value + " ⭐"); o.value = m.id; rs.append(o) });
    const rb = el("button", "add", "Redeem");
    rb.onclick = () => {
        const m = rw.find(x => x.id === rs.value); if (!m) return; if (m.value > tot) { msg("Not enough stars (" + tot + " available)."); return }
        if (confirm("Redeem " + m.name + " for " + m.value + " stars?")) act(sb.from("entries").insert({ kid_id: kid, cat: "stars", sign: 1, num: m.value, text: "Redeemed: " + m.name }))
    };
    a.append(rs, rb); S.append(a);
    const b = el("div", "row"), n = el("input"); n.type = "number"; n.min = "1"; n.step = "1"; n.inputMode = "numeric"; n.placeholder = rate ? "Stars to convert (₹" + rate + " each)" : "Set the rate in Masters first";
    const cb = el("button", "add", "Convert to ₹");
    cb.onclick = () => {
        const v = parseFloat(n.value); if (!rate || !(v > 0)) return; if (v > tot) { msg("Not enough stars (" + tot + " available)."); return }
        const money = Math.round(v * rate * 100) / 100;
        if (confirm("Convert " + v + " stars to ₹" + money + "?")) act(sb.from("entries").insert([{ kid_id: kid, cat: "stars", sign: 1, num: v, text: "Converted to ₹" + money }, { kid_id: kid, cat: "money", sign: 0, num: money, text: "From " + v + " stars" }]))
    };
    b.append(n, cb); S.append(b);
}
function mkUser(F) {
    const box = el("div", "item"); box.style.cssText = "display:block;border-bottom:2px solid var(--bd);padding-bottom:14px";
    box.append(el("div", null, "➕ Create a user"));
    const n = el("input"), e = el("input"), pw = el("input"); n.placeholder = "Name"; e.placeholder = "Phone number or email"; e.setAttribute("autocapitalize", "none"); pw.placeholder = "Default password (6+ characters)";
    [n, e, pw].forEach(i => { const r = el("div", "row"); r.append(i); box.append(r) });
    const r2 = el("div", "row"), rs = el("select"), ks = el("select");
    Object.keys(ROLES).filter(k => k !== "pending").forEach(k => { const o = el("option", null, ROLES[k]); o.value = k; rs.append(o) });
    kids.forEach(k => { const o = el("option", null, kl(k)); o.value = k.id; ks.append(o) });
    const sh = () => { ks.style.display = rs.value === "child" ? "" : "none" }; rs.value = "parent"; sh(); rs.onchange = sh; r2.append(rs, ks); box.append(r2);
    const b = el("button", "add", "Create user"); b.style.marginTop = "8px";
    b.onclick = async () => {
        const name = n.value.trim(), email = toEmail(e.value), pass = pw.value;
        if (!name || !email || pass.length < 6) { msg("Enter a name, a phone number or email, and a password of 6+ characters."); return }
        busy = true; msg("Creating…");
        const c = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "mt-create" } });
        const { data, error } = await c.auth.signUp({ email, password: pass, options: { data: { name } } });
        if (error) { busy = false; msg(error.message); return }
        const u = data.user;
        if (!u || (u.identities && !u.identities.length)) { busy = false; msg("That email is already registered."); return }
        const up = await sb.from("profiles").update({ name, role: rs.value, kid_id: rs.value === "child" ? ks.value : null }).eq("id", u.id);
        busy = false; await load(); draw();
        msg(up.error ? up.error.message : "Created " + name + ". Give them the login and default password." + (data.session ? "" : " Turn off Confirm email in Supabase, or they must verify first."));
    };
    box.append(b); F.append(box);
}
function profileTab(S) {
    const r = role(); S.append(el("b", null, "My profile"));
    const row = (a, b) => { const d = el("div", "item"); d.append(el("span", "sub", a), el("span", null, b)); S.append(d) };
    row("Login", shown(me.email || "")); row("Role", r === "admin" ? "Admin" : ROLES[r]);
    if (r === "child" && prof && prof.kid_id) { const kk = kids.find(k => k.id === prof.kid_id); row("Person", kk ? kl(kk) : "—") }
    const nr = el("div", "row"), ni = el("input"); ni.value = prof ? prof.name || "" : ""; ni.placeholder = "Name"; ni.autocomplete = "name";
    const nb = el("button", "add", "Save name");
    nb.onclick = async () => { const v = ni.value.trim(); if (!v) return; busy = true; msg("Saving…"); const { error } = await sb.rpc("set_my_name", { n: v }); if (!error) await load(); busy = false; draw(); msg(error ? error.message : "Name saved.") };
    nr.append(ni, nb); S.append(el("div", "sub", "Name"), nr);
    const pr2 = el("div", "row"), pi = el("input"); pi.type = "password"; pi.placeholder = "New password (6+ characters)"; pi.autocomplete = "new-password";
    const pb = el("button", "add", "Change");
    pb.onclick = async () => { if (pi.value.length < 6) { msg("Password must be 6+ characters."); return } const { error } = await sb.auth.updateUser({ password: pi.value }); pi.value = ""; msg(error ? error.message : "Password changed.") };
    pr2.append(pi, pb); S.append(el("div", "sub", "Change password"), pr2);
    const so2 = el("button", "add", "Sign out"); so2.style.cssText = "margin-top:14px;background:var(--bd);color:var(--tx)"; so2.onclick = async () => { prof = null; await sb.auth.signOut() }; S.append(so2);
}
const pic = v => { if (v && /^https:\/\//i.test(v)) { const i = document.createElement("img"); i.src = v; i.alt = ""; i.loading = "lazy"; i.style.cssText = "width:100%;height:90px;object-fit:cover;border-radius:8px"; return i } const d = el("div", null, v || "🎁"); d.style.cssText = "font-size:48px;text-align:center;height:90px;line-height:90px"; return d };
function rewardsTab(S, F, L, r) {
    const rate = (masters.find(m => m.kind === "rate") || {}).value, rw = masters.filter(m => m.kind === "reward").sort((a, b) => a.value - b.value);
    const tot = items.filter(i => i.cat === "stars" && i.kid_id === kid).reduce((t, i) => t + i.num * (i.sign == 0 ? 1 : -1), 0), canR = r === "admin" || r === "parent";
    const big = el("div", "big" + (tot < 0 ? " neg" : ""), tot + " ⭐");
    S.append(el("div", "sub", "Stars available"), big);
    if (rate) S.append(el("div", "sub", "1 ⭐ = ₹" + rate));
    if (!rw.length) L.append(el("div", "sub", "No rewards yet. The admin adds them in Masters → Star rewards."));
    else {
        const g = el("div"); g.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px";
        rw.forEach(m => {
            const c = el("div"); c.style.cssText = "border:1px solid var(--bd);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px";
            const nm2 = el("b", null, m.name), cost = el("div", "sub", m.value + " ⭐" + (rate ? " · ₹" + Math.round(m.value * rate * 100) / 100 : ""));
            const need = m.value - tot; let btn;
            if (canR && need <= 0) { btn = el("button", "add", "Redeem"); btn.onclick = () => { if (confirm("Redeem " + m.name + " for " + m.value + " stars?")) act(sb.from("entries").insert({ kid_id: kid, cat: "stars", sign: 1, num: m.value, text: "Redeemed: " + m.name })) } }
            else { btn = el("div", "sub", need <= 0 ? "Ready! Ask a parent" : "Need " + need + " more ⭐"); btn.style.textAlign = "center" }
            c.append(pic(m.image), nm2, cost, btn); g.append(c)
        });
        L.append(g)
    }
    if (canR) {
        F.append(el("b", null, "Convert stars to money"));
        const b = el("div", "row"), n = el("input"); n.type = "number"; n.min = "1"; n.step = "1"; n.inputMode = "numeric"; n.placeholder = rate ? "Stars to convert (₹" + rate + " each)" : "Set the rate in Masters first";
        const cb = el("button", "add", "Convert to ₹");
        cb.onclick = () => {
            const v = parseFloat(n.value); if (!rate || !(v > 0)) return; if (v > tot) { msg("Not enough stars (" + tot + " available)."); return }
            const money = Math.round(v * rate * 100) / 100;
            if (confirm("Convert " + v + " stars to ₹" + money + "?")) act(sb.from("entries").insert([{ kid_id: kid, cat: "stars", sign: 1, num: v, text: "Converted to ₹" + money }, { kid_id: kid, cat: "money", sign: 0, num: money, text: "From " + v + " stars" }]))
        };
        b.append(n, cb); F.append(b)
    }
}
function masterTab(S) {
    S.append(el("div", "sub", "Set up lists once. They appear as dropdowns when adding entries."));
    Object.keys(MK).forEach(k => {
        const n0 = masters.filter(m => m.kind === k).length;
        const h = el("button", "x", (openM[k] ? "▾ " : "▸ ") + MK[k][0] + (k === "rate" ? "" : " (" + n0 + ")")); h.style.cssText = "display:block;width:100%;text-align:left;margin-top:10px;padding:10px;font-size:16px;font-weight:700;color:var(--tx);border:1px solid var(--bd);border-radius:8px;background:var(--bg)";
        h.onclick = () => { openM[k] = !openM[k]; draw() };
        S.append(h); const W = el("div"); W.style.display = openM[k] ? "block" : "none"; S.append(W);
        const ml = masters.filter(m => m.kind === k);
        if (k === "rate") {
            const cur = ml[0]; W.append(el("div", "sub", cur ? "Current: ₹" + cur.value + " per star" : "Not set yet")); const r = el("div", "row"), v = el("input"); v.type = "number"; v.step = "any"; v.inputMode = "decimal"; v.placeholder = "₹ per star";
            const b = el("button", "add", "Set"); b.onclick = () => { const val = parseFloat(v.value); if (!(val > 0)) return; act((async () => { await sb.from("masters").delete().eq("kind", "rate"); return sb.from("masters").insert({ kind: "rate", name: "₹ per star", value: val }) })()) }; r.append(v, b); W.append(r); return
        }
        if (!ml.length) W.append(el("div", "sub", "None yet."));
        ml.forEach(m => {
            const it = el("div", "item"), l = el("div", null, (k === "reward" && m.image && !/^https?:/i.test(m.image) ? m.image + " " : "") + m.name); if (m.value) l.append(el("span", "sub", "  " + (k === "item" ? "₹" : "") + m.value + (k === "reward" ? " ⭐" : "")));
            const x = el("button", "x", "✕"); x.onclick = () => { if (confirm("Remove this?")) act(sb.from("masters").delete().eq("id", m.id)) }; const ed = el("button", "x", "✎");
            ed.onclick = () => {
                const nn = prompt("Name", m.name); if (nn === null) return; const upd = { name: nn.trim() || m.name };
                if (k === "item" || k === "reason" || k === "reward") { const vv = prompt(MK[k][1] || "Value", m.value == null ? "" : m.value); if (vv === null) return; const num = parseFloat(vv); upd.value = isNaN(num) ? null : num; if (k === "reward") { const im = prompt("Picture: an emoji, or an image link starting with https:// (empty to clear)", m.image || ""); if (im === null) return; upd.image = im.trim() || null } }
                act(sb.from("masters").update(upd).eq("id", m.id))
            };
            it.append(l, ed, x); W.append(it)
        });
        const r = el("div", "row"), n = el("input"), v = el("input"), im = el("input"); n.placeholder = "Add name"; im.placeholder = "Emoji or https:// image link (optional)"; r.append(n);
        if (k === "item" || k === "reason" || k === "reward") { v.type = "number"; v.step = "any"; v.inputMode = "decimal"; v.placeholder = MK[k][1]; r.append(v) }
        const b = el("button", "add", "Add"); b.onclick = () => { const nv = n.value.trim(); if (!nv) return; const val = parseFloat(v.value); act(sb.from("masters").insert({ kind: k, name: nv, value: isNaN(val) ? null : val, image: (k === "reward" && im.value.trim()) || null })) };
        r.append(b); if (k === "reward") { const r2 = el("div", "row"); r2.append(im); W.append(r2) } W.append(r)
    });
}
function people(S, F, L) {
    S.append(el("b", null, "Family members"));
    kids.forEach(k => {
        const it = el("div", "item", kl(k) + (k.kind === "adult" ? " (adult)" : " (child)")), ed = el("button", "x", "✎");
        ed.onclick = () => { const v = prompt("Rename", k.name); if (v && v.trim()) act(sb.from("kids").update({ name: v.trim() }).eq("id", k.id)) }; const dl = el("button", "x", "✕");
        dl.onclick = () => { if (kids.length < 2) { msg("You need at least one person."); return } if (prompt('This permanently deletes "' + k.name + '" and ALL their entries. Type DELETE to confirm.') === "DELETE") act(sb.from("kids").delete().eq("id", k.id)) };
        const bd = el("button", "x", "🎂");
        bd.onclick = () => { const v = prompt("Date of birth (YYYY-MM-DD). Leave empty to clear.", k.dob || ""); if (v === null) return; const t = v.trim(); if (t && !/^\d{4}-\d{2}-\d{2}$/.test(t)) { msg("Use the format YYYY-MM-DD"); return } act(sb.from("kids").update({ dob: t || null }).eq("id", k.id)) };
        it.append(ed, bd, dl); S.append(it)
    });
    const ki = el("input"); ki.placeholder = "Add person's name"; const kd = el("select");[["child", "Child"], ["adult", "Adult"]].forEach(([v, t]) => { const o = el("option", null, t); o.value = v; kd.append(o) }); const dbi = el("input"); dbi.type = "date"; const kb = el("button", "add", "Add");
    kb.onclick = () => { const v = ki.value.trim(); if (v) act(sb.from("kids").insert({ name: v, kind: kd.value, dob: dbi.value || null })) };
    const kr = el("div", "row"); kr.append(ki, kd, kb); const dr = el("div", "row"); dr.append(dbi); S.append(kr, el("div", "sub", "Date of birth (optional)"), dr);
    F.append(el("b", null, "Accounts")); mkUser(F); F.append(el("div", "sub", "People who sign up themselves wait here for a role."));
    profs.forEach(p => {
        const self = p.id === me.id, box = el("div", "item"); box.style.display = "block";
        const ni = el("input"); ni.value = p.name || ""; ni.placeholder = "Name"; const r1 = el("div", "row"); r1.append(ni); box.append(r1);
        let rs, ks;
        if (!self) {
            const r2 = el("div", "row"); rs = el("select"); Object.keys(ROLES).forEach(k => { const o = el("option", null, ROLES[k]); o.value = k; rs.append(o) }); rs.value = p.role === "admin" ? "parent" : p.role;
            ks = el("select"); kids.forEach(k => { const o = el("option", null, k.name); o.value = k.id; ks.append(o) }); ks.value = p.kid_id || (kids[0] && kids[0].id) || "";
            const sh = () => { ks.style.display = rs.value === "child" ? "" : "none" }; sh(); rs.onchange = sh; r2.append(rs, ks); box.append(r2)
        }
        else box.append(el("div", "sub", "You (Admin)"));
        const r3 = el("div", "row"), sv = el("button", "add", "Save");
        sv.onclick = () => act(sb.from("profiles").update(self ? { name: ni.value.trim() || p.name } : { name: ni.value.trim() || p.name, role: rs.value, kid_id: rs.value === "child" ? ks.value : null }).eq("id", p.id));
        r3.append(sv);
        if (!self) { const rm = el("button", "add", "Remove"); rm.style.cssText = "background:var(--red);color:#fff"; rm.onclick = () => { if (confirm("Remove " + (p.name || "this user") + "? They will lose access.")) act(sb.from("profiles").delete().eq("id", p.id)) }; r3.append(rm) }
        box.append(r3); F.append(box)
    });
}
$("mb").onclick = () => { $("side").classList.add("open"); $("ov").classList.add("show") };
$("ov").onclick = () => { $("side").classList.remove("open"); $("ov").classList.remove("show") };
init();
