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
    const repaymentBox = el("div", "card");
    renderRepaymentLifecycle(repaymentBox);
    box.append(repaymentBox);
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

async function renderRepaymentLifecycle(host) {
    host.append(el("b", null, "🔁 Credit-card repayment lifecycle"));
    host.append(el("div", "sub", "A bank debit is recorded once. Processor acceptance and issuer credit are separate stages; only issuer credit completes settlement."));
    const [cardsResult, bankResult, repaymentsResult, billsResult] = await Promise.all([
        sb.from("financial_accounts").select("id,institution,nickname,account_last4").eq("account_type","credit_card").eq("is_active",true),
        sb.from("financial_accounts").select("id,institution,nickname,account_last4").eq("account_type","bank").eq("is_active",true),
        sb.from("credit_card_repayments").select("*").order("payment_date",{ascending:false}).limit(50),
        sb.from("credit_card_bills").select("*").order("due_date",{ascending:false}).limit(100)
    ]);
    for (const x of [cardsResult,bankResult,repaymentsResult,billsResult]) if(x.error){host.append(el("div","sub","Repayment lifecycle unavailable: "+x.error.message));return}
    const cards=cardsResult.data||[], banks=bankResult.data||[], repayments=repaymentsResult.data||[], bills=billsResult.data||[];
    const candidates=expenses.filter(x=>!x.is_deleted&&x.transaction_type==="expense"&&Number(x.amount)>0);
    if (["admin","parent"].includes(role())) {
        const card=el("select"), bank=el("select"), amount=el("input"), processor=el("input"), reference=el("input"), add=el("button","add","Record bank debit");
        card.append(el("option",null,"Select credit card…")); card.firstChild.value="";
        cards.forEach(a=>{const o=el("option",null,a.institution+" · "+a.nickname+" · •••• "+a.account_last4);o.value=a.id;card.append(o)});
        bank.append(el("option",null,"Select bank debit transaction…")); bank.firstChild.value="";
        candidates.forEach(x=>{const o=el("option",null,(x.transaction_date||"")+" · "+exMoney(x.amount)+" · "+(x.description||x.merchant||x.account||"Debit"));o.value=x.id;bank.append(o)});
        amount.type="number";amount.step="0.01";amount.min="0.01";amount.placeholder="Payment amount ₹";
        bank.onchange=()=>{const x=candidates.find(y=>y.id===bank.value);if(x)amount.value=Number(x.amount).toFixed(2)};
        processor.placeholder="Processor (e.g. BillDesk)";reference.placeholder="Processor reference (optional)";
        const fields=el("div","row");fields.append(card,bank,amount,processor,reference,add);host.append(fields);
        add.onclick=async()=>{
            const tx=candidates.find(x=>x.id===bank.value),value=Number(amount.value);
            if(!tx||!card.value||!(value>0)){msg("Select a card, bank debit and valid amount.");return}
            if(value>Number(tx.amount)+0.01){msg("Repayment amount cannot exceed the linked bank debit.");return}
            add.disabled=true;
            const {error}=await sb.from("credit_card_repayments").insert({user_id:me.id,card_account_id:card.value,bank_debit_expense_id:tx.id,amount:value,processor:processor.value.trim()||null,payment_reference:reference.value.trim()||null,payment_date:tx.transaction_date,status:"bank_debited",bank_debited_at:new Date().toISOString()});
            if(error){add.disabled=false;msg(error.message);return}
            msg("Bank debit linked. The processor and issuer stages remain unconfirmed.");host.replaceChildren();renderRepaymentLifecycle(host);
        };
    }
    const accountLabel=id=>{const a=cards.find(x=>x.id===id);return a?a.institution+" · "+a.nickname+" ·•••• "+a.account_last4:"Card account"};
    if(!repayments.length){host.append(el("div","sub","No repayments recorded yet."));return}
    for(const p of repayments){
        const box=el("div","item"),left=el("div"),controls=el("div","row");
        left.append(el("b",null,accountLabel(p.card_account_id)+" · "+exMoney(p.amount)),el("div","sub",(p.payment_date||"")+" · "+(p.processor||"Processor not set")+" · "+(p.payment_reference||"No reference")+" · "+p.status));
        if(p.status==="bank_debited"){
            const b=el("button","add","Confirm processor processed");
            b.onclick=async()=>{if(!confirm("Confirm that the processor accepted/processed this payment (for example, BillDesk confirmation)?"))return;const z=await sb.from("credit_card_repayments").update({status:"processed",processed_at:new Date().toISOString()}).eq("id",p.id);if(z.error)return msg(z.error.message);msg("Processor stage recorded; card credit is still pending.");host.replaceChildren();renderRepaymentLifecycle(host)};
            controls.append(b);
        }
        if(p.status==="processed"){
            const b=el("button","add","Confirm card issuer credited");
            b.onclick=async()=>{if(!confirm("Confirm only after an issuer credit SMS or your direct verification that the card account was credited."))return;const z=await sb.from("credit_card_repayments").update({status:"credited",credited_at:new Date().toISOString()}).eq("id",p.id);if(z.error)return msg(z.error.message);msg("Issuer credit confirmed.");host.replaceChildren();renderRepaymentLifecycle(host)};
            controls.append(b);
        }
        box.append(left,controls);
        if(p.status==="credited"){
            const alloc=await sb.from("credit_card_payment_allocations").select("*").eq("repayment_id",p.id);
            if(alloc.error){box.append(el("div","sub",alloc.error.message))}
            else{
                const allocated=(alloc.data||[]).reduce((s,x)=>s+Number(x.allocated_amount),0);
                box.append(el("div","sub","Allocated "+exMoney(allocated)+" of "+exMoney(p.amount)+" · Remaining "+exMoney(Number(p.amount)-allocated)));
                const billSelect=el("select");billSelect.append(el("option",null,"Select bill…"));billSelect.firstChild.value="";
                const eligible=[];
                for(const b of bills){
                    if(p.card_account_id&&b.card_account_id&&p.card_account_id!==b.card_account_id)continue;
                    const used=await sb.from("credit_card_payment_allocations").select("allocated_amount").eq("bill_id",b.id);
                    if(used.error)continue;
                    const remaining=Number(b.statement_amount)-(used.data||[]).reduce((s,x)=>s+Number(x.allocated_amount),0);
                    if(remaining>0.009){eligible.push({bill:b,remaining});const o=el("option",null,b.issuer+" · •••• "+b.card_last4+" · remaining "+exMoney(remaining));o.value=b.id;billSelect.append(o)}
                }
                const allocation=el("input");allocation.type="number";allocation.step="0.01";allocation.min="0.01";allocation.placeholder="Allocate ₹";
                const save=el("button","add","Allocate to bill");save.disabled=!eligible.length;
                save.onclick=async()=>{
                    const chosen=eligible.find(x=>x.bill.id===billSelect.value),v=Number(allocation.value);
                    if(!chosen||!(v>0)){msg("Select a bill and enter an allocation.");return}
                    if(v>Number(p.amount)-allocated+0.001||v>chosen.remaining+0.001){msg("Allocation exceeds the remaining repayment or bill amount.");return}
                    const existing=(alloc.data||[]).find(x=>x.bill_id===chosen.bill.id);
                    const z=existing
                      ? await sb.from("credit_card_payment_allocations").update({allocated_amount:Number(existing.allocated_amount)+v}).eq("id",existing.id)
                      : await sb.from("credit_card_payment_allocations").insert({user_id:me.id,repayment_id:p.id,bill_id:chosen.bill.id,allocated_amount:v});
                    if(z.error)return msg(z.error.message);
                    const allAlloc=await sb.from("credit_card_payment_allocations").select("allocated_amount,repayment_id").eq("bill_id",chosen.bill.id);
                    if(!allAlloc.error){
                        const paid=allAlloc.data.reduce((s,x)=>s+Number(x.allocated_amount),0);
                        const ids=[...new Set(allAlloc.data.map(x=>x.repayment_id))];
                        const stages=ids.length?await sb.from("credit_card_repayments").select("id,status").in("id",ids):{data:[]};
                        if(paid+0.001>=Number(chosen.bill.statement_amount)&&!stages.error&&(stages.data||[]).every(x=>x.status==="credited")){
                            await sb.from("credit_card_bills").update({settlement_confirmed:true,settlement_confirmed_at:new Date().toISOString()}).eq("id",chosen.bill.id);
                        }
                    }
                    msg("Bill allocation saved.");host.replaceChildren();renderRepaymentLifecycle(host);
                };
                const r=el("div","row");r.append(billSelect,allocation,save);box.append(r);
                (alloc.data||[]).forEach(x=>{const b=bills.find(y=>y.id===x.bill_id);box.append(el("div","sub",(b?b.issuer+" bill":"Bill")+" · allocated "+exMoney(x.allocated_amount)))});
            }
        }
        host.append(box);
    }
}
