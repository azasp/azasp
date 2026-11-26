// Expenses feature: imports, categories, filters, grouping and transaction actions.
// ============================================================
// EXPENSES MODULE — CSV import, transaction editing, multi-tags,
// categories/subcategories, grouping, filtering and saved filters.
// ============================================================
const exToday = () => new Date().toISOString().slice(0, 10);
const exMoney = n => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const exName = x => x.custom_name || x.description || "Unnamed transaction";
const exActive = () => expenses.filter(x => !x.is_deleted);
const exOpt = (select, rows, label, value) => rows.forEach(x => { const o = el("option", null, label(x)); o.value = value(x); select.append(o) });
function exRow(parent, label, node) { parent.append(el("div", "sub", label)); const r = el("div", "row"); r.append(node); parent.append(r); return r }
function exMulti(rows, selected, placeholder) {
    const s = el("select"); s.multiple = true; s.size = Math.min(5, Math.max(2, rows.length)); s.style.minHeight = "90px";
    exOpt(s, rows, x => x.name, x => x.id);[...s.options].forEach(o => o.selected = selected.includes(o.value));
    s.setAttribute("aria-label", placeholder); return s;
}
function exSelected(s) { return [...s.selectedOptions].map(o => o.value) }
function exParseCSV(text) {
    const out = []; let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i], n = text[i + 1];
        if (c === '"' && quoted && n === '"') { field += '"'; i++ }
        else if (c === '"') quoted = !quoted;
        else if (c === ',' && !quoted) { row.push(field); field = "" }
        else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && n === '\n') i++; row.push(field); if (row.some(v => v.trim())) out.push(row); row = []; field = "" }
        else field += c;
    }
    row.push(field); if (row.some(v => v.trim())) out.push(row);
    if (!out.length) return [];
    const headers = out.shift().map(x => x.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
    return out.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()])));
}
function exPick(obj, keys) { for (const k of keys) { if (obj[k] != null && obj[k] !== "") return obj[k] } return "" }
function exDate(v) {
    if (!v) return exToday(); let d = new Date(v);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
    const m = String(v).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]).toISOString().slice(0, 10) }
    return exToday();
}
function expensesTab(S, F, L, r) {
    const canEdit = ["admin", "parent"].includes(r);
    if (expenseLoadError) { S.append(el("div", "sub", "Expense data could not load: " + expenseLoadError)); S.append(el("div", "sub", "Check that the consolidated expense SQL migration completed successfully and that the signed-in user owns these rows.")); return }
    // SMS import status: batch history and devices contributing transactions.
    const smsBox = el("div", "card");
    smsBox.append(el("b", null, "📩 SMS import & devices"));
    const smsRows = all.filter(x => String(x.source_app || "").toLowerCase().includes("message") || String(x.source_app || "").toLowerCase().includes("sms"));
    const deviceIds = [...new Set(smsRows.map(x => x.source_device_id).filter(Boolean))];
    const smsStats = el("div"); smsStats.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px";
    [[ "SMS transactions", smsRows.length ], [ "Devices", deviceIds.length ], [ "Import batches", expenseImportBatches.length ]].forEach(([label, value]) => { const c = el("div", "card"); c.style.margin = "0"; c.append(el("div", "sub", label), el("div", "big", String(value))); smsStats.append(c) });
    smsBox.append(smsStats);
    if (expenseBatchLoadError) smsBox.append(el("div", "sub", "Import history unavailable: " + expenseBatchLoadError));
    if (deviceIds.length) { smsBox.append(el("div", "sub", "Devices seen in imported SMS transactions")); deviceIds.forEach(id => { const n = smsRows.filter(x => x.source_device_id === id).length; smsBox.append(el("div", "item", id + " · " + n + " transactions")) }) }
    if (expenseImportBatches.length) {
        smsBox.append(el("div", "sub", "Recent import batches"));
        expenseImportBatches.slice(0, 10).forEach(batch => {
            const row = el("div", "item"), left = el("div"), right = el("div");
            left.append(el("b", null, batch.source || "Import"), el("div", "sub", new Date(batch.created_at).toLocaleString() + (batch.device_id ? " · " + batch.device_id : "")));
            right.style.textAlign = "right"; right.append(el("b", null, batch.status || "pending"), el("div", "sub", (batch.imported_transactions || 0) + " imported · " + (batch.skipped_messages || 0) + " skipped · " + (batch.failed_messages || 0) + " failed"));
            row.append(left, right); smsBox.append(row);
        });
    } else if (!expenseBatchLoadError) smsBox.append(el("div", "sub", "No SMS import batches yet. Historical SMS import will appear here once the iPhone Shortcut is connected."));
    S.append(smsBox);
    const all = exActive();
    const totalExp = all.filter(x => x.transaction_type === "expense").reduce((a, x) => a + Number(x.amount), 0);
    const totalInc = all.filter(x => x.transaction_type === "income").reduce((a, x) => a + Number(x.amount), 0);
    const summary = el("div"); summary.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px";
    [["Expenses", exMoney(totalExp)], ["Income", exMoney(totalInc)]].forEach(([a, b]) => { const c = el("div", "card"); c.append(el("div", "sub", a), el("div", "big", b)); summary.append(c) });
    S.append(summary);
    const h = el("b", null, "Transactions"); h.style.display = "block"; h.style.marginTop = "12px"; S.append(h);
    const importBox = el("div"); importBox.append(el("div", "sub", "Import a CSV exported from Spending Tracker Pro."));
    if (canEdit) {
        const file = el("input"); file.type = "file"; file.accept = ".csv,text/csv"; file.style.width = "100%";
        const preview = el("div", "sub", "CSV not selected yet.");
        const imp = el("button", "add", "Import CSV"); imp.disabled = true; let parsed = [];
        file.onchange = async () => {
            parsed = []; imp.disabled = true; preview.textContent = "Reading CSV…";
            const f = file.files[0]; if (!f) return; try { parsed = exParseCSV(await f.text()); preview.textContent = parsed.length + " rows found. Check the column mapping assumptions before importing. The importer recognises common date, amount, type, category, description and account headings."; imp.disabled = !parsed.length } catch (e) { preview.textContent = "Could not read CSV: " + e.message }
        };
        imp.onclick = async () => {
            if (!parsed.length) return; let rows = [], bad = 0;
            parsed.forEach((o, idx) => {
                const amountRaw = String(exPick(o, ["amount", "value", "total", "debit", "credit"])).replace(/[₹,\s]/g, "");
                const amount = Math.abs(Number(amountRaw)); if (!(amount > 0)) { bad++; return }
                const typ = String(exPick(o, ["type", "transaction_type", "income_expense"])).toLowerCase();
                const credit = String(exPick(o, ["credit", "income"])).replace(/[₹,\s]/g, "");
                const debit = String(exPick(o, ["debit", "expense"])).replace(/[₹,\s]/g, "");
                const isIncome = /income|credit|received|deposit/.test(typ) || (Number(credit) > 0 && !Number(debit));
                const desc = exPick(o, ["description", "name", "title", "payee", "merchant", "narration", "note"]);
                const date = exDate(exPick(o, ["date", "transaction_date", "time", "datetime"]));
                const raw = JSON.stringify(o);
                rows.push({ user_id: me.id, transaction_date: date, transaction_type: isIncome ? "income" : "expense", amount, currency: "INR", description: desc || "Imported transaction", original_description: desc || null, category: exPick(o, ["category", "category_name"]) || null, merchant: exPick(o, ["merchant", "payee"]) || null, account: exPick(o, ["account", "account_name"]) || null, payment_method: exPick(o, ["payment_method", "payment", "method"]) || null, source_app: "Spending Tracker", import_hash: exHash(date + "|" + amount + "|" + typ + "|" + desc + "|" + raw), raw_data: o });
            });
            if (!rows.length) { msg("No valid amount rows found."); return }
            busy = true; msg("Importing " + rows.length + " transactions…");
            const { data, error } = await sb.from("expenses").upsert(rows, { onConflict: "user_id,import_hash", ignoreDuplicates: true }).select("id");
            busy = false; if (error) { msg("Import failed: " + error.message); return }
            await load(); draw(); msg("Import complete. " + rows.length + " rows processed; " + bad + " rows skipped. Existing matching imports were ignored.");
        };
        importBox.append(file, preview, imp);
    }
    F.append(importBox);

    // Filters
    const filterTitle = el("b", null, "Filter and group"); F.append(filterTitle);
    const search = el("input"); search.placeholder = "Search transaction name, merchant, notes"; exRow(F, "Search", search);
    const source = el("select"); [["", "All sources"], ["ios_messages", "iPhone Messages / SMS"], ["spending_tracker", "Spending Tracker"], ["manual", "Manual / other"]].forEach(([v, label]) => { const o = el("option", null, label); o.value = v; source.append(o) }); exRow(F, "Source", source);
    const type = el("select");[["", "All types"], ["expense", "Expenses"], ["income", "Income"]].forEach(([v, t]) => { const o = el("option", null, t); o.value = v; type.append(o) }); exRow(F, "Type", type);
    const preset = el("select");[["all", "All time"], ["today", "Today"], ["yesterday", "Yesterday"], ["this_week", "This week"], ["this_month", "This month"], ["last_month", "Last month"], ["this_year", "This year"], ["custom", "Custom range"]].forEach(([v, t]) => { const o = el("option", null, t); o.value = v; preset.append(o) }); preset.value = "this_month"; exRow(F, "Date range", preset);
    const from = el("input"), to = el("input"); from.type = to.type = "date"; from.value = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10); to.value = exToday();
    const dateRow = el("div", "row"); dateRow.append(from, to); F.append(dateRow);
    const cat = exMulti(expenseCategories, [], "Categories"); exRow(F, "Categories (select multiple)", cat);
    const sub = exMulti(expenseSubcategories, [], "Subcategories"); exRow(F, "Subcategories (select multiple)", sub);
    const method = el("input"); method.placeholder = "e.g. UPI, Cash, Credit Card"; exRow(F, "Payment method contains", method);
    const account = el("input"); account.placeholder = "e.g. HDFC, Cash"; exRow(F, "Account contains", account);
    const min = el("input"), max = el("input"); min.type = max.type = "number"; min.placeholder = "Min ₹"; max.placeholder = "Max ₹"; const ar = el("div", "row"); ar.append(min, max); F.append(ar);
    const group = el("select");[["date", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"], ["type", "Type"], ["category", "Category"], ["subcategory", "Subcategory"], ["account", "Account"], ["payment_method", "Payment method"], ["merchant", "Merchant"]].forEach(([v, t]) => { const o = el("option", null, t); o.value = v; group.append(o) }); exRow(F, "Group results by", group);
    const sort = el("select");[["transaction_date", "Date"], ["amount", "Amount"], ["name", "Name"], ["category", "Category"]].forEach(([v, t]) => { const o = el("option", null, t); o.value = v; sort.append(o) }); exRow(F, "Sort by", sort);
    const direction = el("select");[["desc", "Descending"], ["asc", "Ascending"]].forEach(([v, t]) => { const o = el("option", null, t); o.value = v; direction.append(o) }); exRow(F, "Sort direction", direction);
    const saved = el("select"); const blank = el("option", null, "Load saved filter…"); blank.value = ""; saved.append(blank); exOpt(saved, savedExpenseFilters, x => x.name, x => x.id); exRow(F, "Saved filters", saved);
    saved.onchange = () => { const f = savedExpenseFilters.find(x => x.id === saved.value); if (!f) return; const q = f.filters || {}; type.value = (q.transaction_type || [])[0] || ""; search.value = q.search || ""; preset.value = q.date_preset || "all"; from.value = q.date_from || ""; to.value = q.date_to || ""; method.value = (q.payment_methods || [])[0] || ""; account.value = (q.accounts || [])[0] || ""; min.value = q.amount_min ?? ""; max.value = q.amount_max ?? "";[...cat.options].forEach(o => o.selected = (q.categories || []).includes(o.value));[...sub.options].forEach(o => o.selected = (q.subcategories || []).includes(o.value)); group.value = f.group_by || "date"; sort.value = f.sort_by || "transaction_date"; direction.value = f.sort_direction || "desc"; renderResults() };
    const save = el("button", "add", "Save current filter"); save.onclick = async () => { if (!canEdit) return; const name = prompt("Name this filter (e.g. Monthly groceries)"); if (!name || !name.trim()) return; const q = exFilterJSON(); const { error } = await sb.from("saved_expense_filters").insert({ user_id: me.id, name: name.trim(), filters: q, group_by: group.value, sort_by: sort.value, sort_direction: direction.value }); if (error) msg(error.message); else { await load(); draw(); msg("Filter saved.") } };
    const fav = el("button", "link", "☆ Toggle favourite for selected filter"); fav.onclick = async () => { const f = savedExpenseFilters.find(x => x.id === saved.value); if (!f) return; const { error } = await sb.from("saved_expense_filters").update({ is_favorite: !f.is_favorite }).eq("id", f.id); if (error) msg(error.message); else { await load(); draw() } };
    const del = el("button", "link", "Delete selected saved filter"); del.onclick = async () => { const f = savedExpenseFilters.find(x => x.id === saved.value); if (!f || !confirm("Delete saved filter " + f.name + "?")) return; const { error } = await sb.from("saved_expense_filters").delete().eq("id", f.id); if (error) msg(error.message); else { await load(); draw() } };
    const actions = el("div", "row"); actions.append(save, fav, del); F.append(actions);
    const results = el("div"); L.append(results);
    function exFilterJSON() { return { transaction_type: type.value ? [type.value] : [], search: search.value.trim(), date_preset: preset.value, date_from: from.value || null, date_to: to.value || null, categories: exSelected(cat), subcategories: exSelected(sub), source: source.value, payment_methods: method.value.trim() ? [method.value.trim()] : [], accounts: account.value.trim() ? [account.value.trim()] : [], amount_min: min.value === "" ? null : Number(min.value), amount_max: max.value === "" ? null : Number(max.value) } }
    function dateBounds() {
        const now = new Date(), today = exToday(), start = new Date(now.getFullYear(), now.getMonth(), 1);
        if (preset.value === "today") return [today, today];
        if (preset.value === "yesterday") { const d = new Date(now); d.setDate(d.getDate() - 1); const v = d.toISOString().slice(0, 10); return [v, v] }
        if (preset.value === "this_week") { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [d.toISOString().slice(0, 10), today] }
        if (preset.value === "this_month") return [start.toISOString().slice(0, 10), today];
        if (preset.value === "last_month") { const a = new Date(now.getFullYear(), now.getMonth() - 1, 1), b = new Date(now.getFullYear(), now.getMonth(), 0); return [a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)] }
        if (preset.value === "this_year") return [new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10), today];
        if (preset.value === "custom") return [from.value, to.value];
        return ["", ""];
    }
    function renderResults() {
        results.textContent = ""; let rows = exActive(); const q = exFilterJSON(), bounds = dateBounds();
        rows = rows.filter(x => (!source.value || (source.value === "ios_messages" ? /message|sms/i.test(x.source_app || "") : source.value === "spending_tracker" ? /spending tracker/i.test(x.source_app || "") : !x.source_app || !/message|sms|spending tracker/i.test(x.source_app))) && (!type.value || x.transaction_type === type.value) && (!bounds[0] || x.transaction_date >= bounds[0]) && (!bounds[1] || x.transaction_date <= bounds[1]) && (!q.categories.length || true) && (!q.subcategories.length || true) && (!method.value || String(x.payment_method || "").toLowerCase().includes(method.value.toLowerCase())) && (!account.value || String(x.account || "").toLowerCase().includes(account.value.toLowerCase())) && (min.value === "" || Number(x.amount) >= Number(min.value)) && (max.value === "" || Number(x.amount) <= Number(max.value)) && (!q.search || [exName(x), x.description, x.merchant, x.user_notes, x.notes].join(" ").toLowerCase().includes(q.search.toLowerCase())));
        // Multi-category filters are evaluated from the normalized link tables fetched for the signed-in user.
        rows = rows.filter(x => { const cids = (x._category_ids || []); const sids = (x._subcategory_ids || []); return (!q.categories.length || q.categories.some(id => cids.includes(id))) && (!q.subcategories.length || q.subcategories.some(id => sids.includes(id))) });
        rows.sort((a, b) => { let av = sort.value === "amount" ? Number(a.amount) : sort.value === "name" ? exName(a).toLowerCase() : sort.value === "category" ? String(a.category || "").toLowerCase() : a.transaction_date; let bv = sort.value === "amount" ? Number(b.amount) : sort.value === "name" ? exName(b).toLowerCase() : sort.value === "category" ? String(b.category || "").toLowerCase() : b.transaction_date; return (av > bv ? 1 : av < bv ? -1 : 0) * (direction.value === "asc" ? 1 : -1) });
        const total = rows.reduce((a, x) => a + (x.transaction_type === "income" ? Number(x.amount) : -Number(x.amount)), 0);
        results.append(el("div", "big", exMoney(total)), el("div", "sub", rows.length + " transactions · net total for current filter"));
        if (!rows.length) { results.append(el("div", "sub", "No matching transactions.")); return }
        const groups = {}; rows.forEach(x => { let key = x.transaction_date; if (group.value === "month") key = x.transaction_date.slice(0, 7); else if (group.value === "year") key = x.transaction_date.slice(0, 4); else if (group.value === "week") { const d = new Date(x.transaction_date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); key = "Week of " + d.toISOString().slice(0, 10) } else if (group.value === "type") key = x.transaction_type; else if (group.value === "account") key = x.account || "No account"; else if (group.value === "payment_method") key = x.payment_method || "No payment method"; else if (group.value === "merchant") key = x.merchant || "No merchant"; else if (group.value === "category") key = x._category_names?.join(", ") || x.category || "Uncategorised"; else if (group.value === "subcategory") key = x._subcategory_names?.join(", ") || "No subcategory"; (groups[key] || (groups[key] = [])).push(x) });
        Object.entries(groups).forEach(([key, list]) => {
            const head = el("div", "item"); head.style.background = "var(--bg)"; head.append(el("b", null, key), el("span", "sub", list.length + " · " + exMoney(list.reduce((a, x) => a + (x.transaction_type === "income" ? 1 : -1) * Number(x.amount), 0)))); results.append(head);
            list.forEach(x => {
                const item = el("div", "item"), left = el("div"), right = el("div"); left.append(el("b", null, exName(x)), el("div", "sub", (x.transaction_date || "") + " · " + (x.transaction_type === "income" ? "Income" : "Expense") + " · " + (x.merchant || x.account || "")));
                if (x._category_names?.length) left.append(el("div", "sub", x._category_names.join(" / ") + (x._subcategory_names?.length ? " · " + x._subcategory_names.join(", ") : "")));
                right.style.cssText = "display:flex;align-items:center;gap:4px;flex-wrap:wrap"; right.append(el("b", x.transaction_type === "income" ? "pos" : "neg", (x.transaction_type === "income" ? "+" : "−") + exMoney(x.amount)));
                if (canEdit) { const edit = el("button", "x", "✎"); edit.title = "Rename / edit transaction"; edit.onclick = () => editExpense(x); const rm = el("button", "x", "✕"); rm.title = "Archive transaction"; rm.onclick = async () => { if (confirm("Archive this transaction?")) { const { error } = await sb.from("expenses").update({ is_deleted: true }).eq("id", x.id); if (error) msg(error.message); else { await load(); draw() } } }; right.append(edit, rm) }
                item.append(left, right); results.append(item)
            });
        });
    }
    async function editExpense(x) {
        const name = prompt("Transaction name", exName(x)); if (name === null) return;
        const date = prompt("Date (YYYY-MM-DD)", x.transaction_date); if (date === null) return;
        const amount = prompt("Amount", x.amount); if (amount === null) return;
        const kind = prompt("Type: expense or income", x.transaction_type); if (kind === null) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(Number(amount) > 0) || !["expense", "income"].includes(kind)) { msg("Invalid date, amount or transaction type."); return }
        const { error } = await sb.from("expenses").update({ custom_name: name.trim() || null, transaction_date: date, amount: Number(amount), transaction_type: kind }).eq("id", x.id);
        if (error) { msg(error.message); return } await load(); draw();
    }
    [search, type, preset, from, to, cat, sub, method, account, min, max, group, sort, direction].forEach(n => n.addEventListener("change", renderResults));
    search.addEventListener("input", renderResults);
    preset.onchange = () => { const custom = preset.value === "custom"; from.style.display = to.style.display = custom ? "" : "none"; renderResults() };
    preset.onchange();
    // Load category/subcategory assignments for current user's transactions.
    Promise.all([
        sb.from("expense_category_links").select("expense_id,category_id").then(r => r.data || []),
        sb.from("expense_subcategory_links").select("expense_id,subcategory_id").then(r => r.data || [])
    ]).then(([cl, sl]) => {
        const cm = new Map(), sm = new Map(); cl.forEach(x => (cm.get(x.expense_id) || cm.set(x.expense_id, []).get(x.expense_id)).push(x.category_id)); sl.forEach(x => (sm.get(x.expense_id) || sm.set(x.expense_id, []).get(x.expense_id)).push(x.subcategory_id));
        expenses.forEach(x => { x._category_ids = cm.get(x.id) || []; x._subcategory_ids = sm.get(x.id) || []; x._category_names = x._category_ids.map(id => expenseCategories.find(c => c.id === id)?.name).filter(Boolean); x._subcategory_names = x._subcategory_ids.map(id => expenseSubcategories.find(c => c.id === id)?.name).filter(Boolean) }); renderResults()
    });
    renderResults();

    if (canEdit) {
        const catBox = el("div"); catBox.append(el("b", null, "Manage categories and subcategories"));
        expenseCategories.forEach(c => {
            const row = el("div", "item"), left = el("div", null, (c.icon || "🏷️") + " " + c.name), right = el("div");
            const addSub = el("button", "x", "+ sub"); addSub.onclick = async () => { const n = prompt("Subcategory name for " + c.name); if (!n?.trim()) return; const { error } = await sb.from("expense_subcategories").insert({ user_id: me.id, category_id: c.id, name: n.trim() }); if (error) msg(error.message); else { await load(); draw() } };
            const rename = el("button", "x", "✎"); rename.onclick = async () => { const n = prompt("Rename category", c.name); if (!n?.trim()) return; const { error } = await sb.from("expense_categories").update({ name: n.trim() }).eq("id", c.id); if (error) msg(error.message); else { await load(); draw() } };
            right.append(addSub, rename); row.append(left, right); catBox.append(row);
            expenseSubcategories.filter(s => s.category_id === c.id).forEach(s => { const sr = el("div", "sub", "↳ " + s.name); sr.style.padding = "4px 12px"; catBox.append(sr) });
        });
        const cr = el("div", "row"), cn = el("input"), ci = el("input"), cc = el("input"); cn.placeholder = "New category"; ci.placeholder = "Icon (optional)"; cc.placeholder = "Colour (optional)"; const cb = el("button", "add", "Add"); cb.onclick = async () => { if (!cn.value.trim()) return; const { error } = await sb.from("expense_categories").insert({ user_id: me.id, name: cn.value.trim(), icon: ci.value.trim() || null, color: cc.value.trim() || null }); if (error) msg(error.message); else { await load(); draw() } }; cr.append(cn, ci, cb); catBox.append(cr); F.append(catBox);
    }
}
function exHash(s) {
    // Stable lightweight browser-side hash; dedupe is scoped by authenticated user in the database.
    let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return "st-" + (h >>> 0).toString(16) + "-" + s.length;
}

