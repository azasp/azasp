// Credit-card bill reconciliation. A tolerance match never confirms settlement.
function renderCreditCardReconciliation(host, canEdit) {
    const box = el("div", "card");
    box.append(el("b", null, "💳 Credit-card bill reconciliation"));
    box.append(el("div", "sub", "Match a bank payment to a card bill. Differences up to ₹1 are within tolerance; settlement still requires your confirmation."));
    const accountsBox = el("div", "card");
    accountsBox.append(el("b", null, "🏦 Financial accounts"));
    const accountsList = el("div", "sub", "Loading accounts…"); accountsBox.append(accountsList);
    if (canEdit) {
        const accountForm = el("div");
        const accountType = el("select");
        [["bank","Bank account"],["credit_card","Credit card"]].forEach(([v,t]) => { const o=el("option",null,t); o.value=v; accountType.append(o) });
        const institution = el("input"); institution.placeholder = "Bank / card issuer";
        const nickname = el("input"); nickname.placeholder = "Nickname (e.g. Salary account)";
        const accountLast4 = el("input"); accountLast4.placeholder = "Last 4 digits"; accountLast4.maxLength=4; accountLast4.inputMode="numeric";
        const saveAccount = el("button","add","Add account");
        const accountRow = el("div","row"); accountRow.append(accountType,institution,nickname,accountLast4,saveAccount); accountForm.append(accountRow); accountsBox.append(accountForm);
        saveAccount.onclick = async () => {
            if (!institution.value.trim() || !nickname.value.trim() || !/^[0-9]{4}$/.test(accountLast4.value.trim())) { msg("Enter institution, nickname and four digits."); return }
            saveAccount.disabled=true;
            const {error}=await sb.from("financial_accounts").insert({user_id:me.id,account_type:accountType.value,institution:institution.value.trim(),nickname:nickname.value.trim(),account_last4:accountLast4.value.trim()});
            saveAccount.disabled=false;
            if(error){msg("Could not add account: "+error.message);return}
            institution.value=nickname.value=accountLast4.value="";
            host.replaceChildren(); renderCreditCardReconciliation(host,canEdit);
        };
    }
    box.append(accountsBox);
    drawFinancialAccounts(accountsList);
    const list = el("div", "sub", "Loading bills…"); box.append(list);
    if (canEdit) {
        const form = el("div");
        const cardAccount = el("select"); cardAccount.setAttribute("aria-label","Credit card account");
        const cardPlaceholder=el("option",null,"Select credit card…"); cardPlaceholder.value=""; cardAccount.append(cardPlaceholder);
        sb.from("financial_accounts").select("id,institution,nickname,account_last4").eq("account_type","credit_card").eq("is_active",true).order("institution").then(({data}) => (data||[]).forEach(a=>{const o=el("option",null,a.institution+" · "+a.nickname+" · •••• "+a.account_last4);o.value=a.id;cardAccount.append(o)}));
        const issuer = el("input"); issuer.placeholder = "Card issuer (legacy/manual)";
        const last4 = el("input"); last4.placeholder = "Card last 4 digits (legacy/manual)"; last4.maxLength = 4; last4.inputMode = "numeric";
        const amount = el("input"); amount.type = "number"; amount.step = "0.01"; amount.min = "0.01"; amount.placeholder = "Statement amount ₹";
        const due = el("input"); due.type = "date";
        const add = el("button", "add", "Add bill");
        const fields = el("div", "row"); fields.append(cardAccount, issuer, last4, amount, due, add); form.append(fields); box.append(form);
        cardAccount.onchange = async () => { const {data}=await sb.from("financial_accounts").select("institution,account_last4").eq("id",cardAccount.value).maybeSingle(); if(data){issuer.value=data.institution;last4.value=data.account_last4} };
        add.onclick = async () => {
            const card = last4.value.trim();
            if (!issuer.value.trim() || !/^\d{4}$/.test(card) || !(Number(amount.value) > 0) || !due.value) { msg("Enter issuer, four card digits, statement amount and due date."); return }
            add.disabled = true;
            const { error } = await sb.from("credit_card_bills").insert({ user_id: me.id, issuer: issuer.value.trim(), card_last4: card, card_account_id: cardAccount.value || null, statement_amount: Number(amount.value), due_date: due.value });
            add.disabled = false;
            if (error) { msg("Could not save bill: " + error.message); return }
            issuer.value = last4.value = amount.value = due.value = ""; cardAccount.value=""; await drawCreditCardBills(list, canEdit);
        };
    }
    host.append(box);
    drawCreditCardBills(list, canEdit);
}
async function drawFinancialAccounts(host) {
    host.textContent="Loading accounts…";
    const {data,error}=await sb.from("financial_accounts").select("*").eq("is_active",true).order("institution").order("nickname");
    if(error){host.textContent="Accounts unavailable: "+error.message;return}
    host.textContent="";
    if(!data?.length){host.textContent="No accounts registered yet. Add each bank account and credit card above.";return}
    data.forEach(a=>{
        const row=el("div","item"),left=el("div"),right=el("div");
        left.append(el("b",null,a.institution+" · "+a.nickname),el("div","sub",(a.account_type==="bank"?"Bank account":"Credit card")+" · •••• "+a.account_last4));
        const toggle=el("button","x","Deactivate");
        toggle.onclick=async()=>{if(!window.confirm("Deactivate "+a.nickname+"? Historical transactions and bills will be retained."))return;const {error}=await sb.from("financial_accounts").update({is_active:false}).eq("id",a.id);if(error){msg(error.message);return}await drawFinancialAccounts(host)};
        right.append(toggle);row.append(left,right);host.append(row);
    });
}
async function drawCreditCardBills(list, canEdit) {
    list.textContent = "Loading bills…";
    const { data: bills, error } = await sb.from("credit_card_bills").select("*").order("due_date", { ascending: false }).limit(50);
    if (error) { list.textContent = "Reconciliation is not available yet. Apply supabase/migrations/20261126_credit_card_bill_reconciliation.sql. Details: " + error.message; return }
    list.textContent = "";
    if (!bills?.length) { list.textContent = "No credit-card bills added yet."; return }
    for (const bill of bills) {
        const row = el("div", "card");
        const delta = bill.payment_amount == null ? null : Math.abs(Number(bill.statement_amount) - Number(bill.payment_amount));
        const within = delta != null && delta <= 1;
        row.append(el("b", null, bill.issuer + " · card •••• " + bill.card_last4));
        row.append(el("div", "sub", "Bill " + exMoney(bill.statement_amount) + " · due " + bill.due_date));
        if (delta != null) {
            row.append(el("div", "sub", "Payment " + exMoney(bill.payment_amount) + (bill.payment_date ? " · " + bill.payment_date : "")));
            row.append(el("div", "sub", "Difference: " + exMoney(delta)));
            const status = el("div", "sub", within ? "✓ Matched — within ₹1 tolerance" : "⚠ Discrepancy — difference exceeds ₹1");
            status.style.fontWeight = "700"; status.style.color = within ? "var(--pos, #16803c)" : "var(--neg, #c62828)"; row.append(status);
            if (bill.payment_reference) row.append(el("div", "sub", "Bank reference: " + bill.payment_reference));
        } else row.append(el("div", "sub", "No payment linked yet."));
        if (bill.settlement_confirmed) row.append(el("div", "sub", "✓ Settlement manually confirmed"));
        if (canEdit && !bill.settlement_confirmed) {
            const candidates = expenses.filter(x => !x.is_deleted && x.transaction_type === "expense" && x.transaction_date <= bill.due_date && Math.abs(new Date(bill.due_date) - new Date(x.transaction_date)) <= 14 * 86400000 && /upi|bank|transfer/i.test([x.payment_method, x.description, x.merchant, x.account].join(" ")));
            const select = el("select"); const empty = el("option", null, "Select bank payment transaction…"); empty.value = ""; select.append(empty);
            candidates.forEach(x => { const o = el("option", null, (x.transaction_date || "") + " · " + exMoney(x.amount) + " · " + (x.description || x.merchant || x.account || "Bank payment")); o.value = x.id; select.append(o) });
            const link = el("button", "x", "Match payment"); link.disabled = !candidates.length;
            link.onclick = async () => {
                const payment = candidates.find(x => x.id === select.value); if (!payment) { msg("Select a bank payment first."); return }
                const reference = payment.external_id || payment.source_message_hash || "";
                const { error: saveError } = await sb.from("credit_card_bills").update({ payment_expense_id: payment.id, payment_amount: Number(payment.amount), payment_date: payment.transaction_date, payment_reference: reference || null }).eq("id", bill.id);
                if (saveError) { msg("Could not match payment: " + saveError.message); return }
                await drawCreditCardBills(list, canEdit);
            };
            const controls = el("div", "row"); controls.append(select, link); row.append(controls);
            if (bill.payment_expense_id) {
                const confirm = el("button", "add", "Confirm card issuer received payment");
                confirm.onclick = async () => {
                    const warning = within ? "" : " The amount differs from the statement by more than ₹1; confirm only after checking the discrepancy.";
                    if (!window.confirm("Confirm that the card issuer has credited this payment?" + warning)) return;
                    const { error: confirmError } = await sb.from("credit_card_bills").update({ settlement_confirmed: true, settlement_confirmed_at: new Date().toISOString() }).eq("id", bill.id);
                    if (confirmError) { msg("Could not confirm settlement: " + confirmError.message); return }
                    await drawCreditCardBills(list, canEdit);
                };
                row.append(confirm);
            }
        }
        list.append(row);
    }
}
