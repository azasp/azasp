-- MyTracker credit-card bill reconciliation
-- Apply in Supabase SQL Editor. All records are private to their owner.
create table if not exists public.credit_card_bills (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    issuer text not null,
    card_last4 text not null check (card_last4 ~ '^[0-9]{4}$'),
    statement_amount numeric(14,2) not null check (statement_amount > 0),
    due_date date not null,
    statement_date date,
    payment_expense_id uuid references public.expenses(id) on delete set null,
    payment_amount numeric(14,2),
    payment_date date,
    payment_reference text,
    settlement_confirmed boolean not null default false,
    settlement_confirmed_at timestamptz,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint ck_cc_bill_payment_nonnegative check (payment_amount is null or payment_amount >= 0),
    constraint ck_cc_bill_confirmed_has_payment check (not settlement_confirmed or payment_expense_id is not null)
);
create index if not exists ix_credit_card_bills_user_due on public.credit_card_bills(user_id, due_date desc);
create unique index if not exists uq_credit_card_bill_expense on public.credit_card_bills(user_id, payment_expense_id) where payment_expense_id is not null;
alter table public.credit_card_bills enable row level security;
drop policy if exists credit_card_bills_select_own on public.credit_card_bills;
create policy credit_card_bills_select_own on public.credit_card_bills for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists credit_card_bills_insert_own on public.credit_card_bills;
create policy credit_card_bills_insert_own on public.credit_card_bills for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists credit_card_bills_update_own on public.credit_card_bills;
create policy credit_card_bills_update_own on public.credit_card_bills for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists credit_card_bills_delete_own on public.credit_card_bills;
create policy credit_card_bills_delete_own on public.credit_card_bills for delete to authenticated using (user_id = auth.uid());

-- Explicit Data API privileges; RLS still restricts every row to its owner.
grant select, insert, update, delete on public.credit_card_bills to authenticated;
revoke all on public.credit_card_bills from anon;
