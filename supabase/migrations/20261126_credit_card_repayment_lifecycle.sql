-- Credit-card repayment lifecycle: bank debit -> processor accepted -> card credited.
-- Supports split payments and multiple partial payments per bill.
alter table public.expenses
  add constraint uq_expenses_id_user_repayment unique (id, user_id);

alter table public.credit_card_bills
  add constraint uq_credit_card_bills_id_user_repayment unique (id, user_id);

create table public.credit_card_repayments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_account_id uuid,
  bank_debit_expense_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  processor text,
  payment_reference text,
  payment_date date,
  status text not null default 'initiated'
    check (status in ('initiated','bank_debited','processed','credited','needs_review','cancelled')),
  bank_debited_at timestamptz,
  processed_at timestamptz,
  credited_at timestamptz,
  bank_message_hash text,
  processor_message_hash text,
  credit_message_hash text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_credit_card_repayments_id_user unique (id,user_id),
  constraint fk_cc_repayments_card_owner
    foreign key (card_account_id,user_id)
    references public.financial_accounts(id,user_id)
    on delete set null (card_account_id),
  constraint fk_cc_repayments_bank_expense_owner
    foreign key (bank_debit_expense_id,user_id)
    references public.expenses(id,user_id)
    on delete set null (bank_debit_expense_id),
  constraint ck_cc_repayments_stage_timestamps check (
    (status not in ('bank_debited','processed','credited') or bank_debited_at is not null)
    and (status not in ('processed','credited') or processed_at is not null)
    and (status <> 'credited' or credited_at is not null)
  )
);

create unique index uq_cc_repayments_reference
  on public.credit_card_repayments(user_id, lower(processor), payment_reference)
  where payment_reference is not null;
create unique index uq_cc_repayments_bank_message
  on public.credit_card_repayments(user_id, bank_message_hash)
  where bank_message_hash is not null;
create unique index uq_cc_repayments_processor_message
  on public.credit_card_repayments(user_id, processor_message_hash)
  where processor_message_hash is not null;
create unique index uq_cc_repayments_credit_message
  on public.credit_card_repayments(user_id, credit_message_hash)
  where credit_message_hash is not null;
create index ix_cc_repayments_user_status_date
  on public.credit_card_repayments(user_id,status,payment_date desc);
create index ix_cc_repayments_bank_expense
  on public.credit_card_repayments(bank_debit_expense_id,user_id)
  where bank_debit_expense_id is not null;
create index ix_cc_repayments_card_account
  on public.credit_card_repayments(card_account_id,user_id)
  where card_account_id is not null;

alter table public.credit_card_repayments enable row level security;
create policy cc_repayments_select_own on public.credit_card_repayments
  for select to authenticated using (user_id = (select auth.uid()));
create policy cc_repayments_insert_own on public.credit_card_repayments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy cc_repayments_update_own on public.credit_card_repayments
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy cc_repayments_delete_own on public.credit_card_repayments
  for delete to authenticated using (user_id = (select auth.uid()));
grant select,insert,update,delete on public.credit_card_repayments to authenticated;
revoke all on public.credit_card_repayments from anon;

create table public.credit_card_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  repayment_id uuid not null,
  bill_id uuid not null,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  created_at timestamptz not null default now(),
  constraint fk_cc_alloc_repayment_owner
    foreign key (repayment_id,user_id)
    references public.credit_card_repayments(id,user_id) on delete cascade,
  constraint fk_cc_alloc_bill_owner
    foreign key (bill_id,user_id)
    references public.credit_card_bills(id,user_id) on delete cascade,
  constraint uq_cc_alloc_repayment_bill unique (repayment_id,bill_id)
);

create index ix_cc_alloc_user_bill on public.credit_card_payment_allocations(user_id,bill_id);
create index ix_cc_alloc_repayment on public.credit_card_payment_allocations(repayment_id,user_id);

alter table public.credit_card_payment_allocations enable row level security;
create policy cc_allocations_select_own on public.credit_card_payment_allocations
  for select to authenticated using (user_id = (select auth.uid()));
create policy cc_allocations_insert_own on public.credit_card_payment_allocations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy cc_allocations_update_own on public.credit_card_payment_allocations
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy cc_allocations_delete_own on public.credit_card_payment_allocations
  for delete to authenticated using (user_id = (select auth.uid()));
grant select,insert,update,delete on public.credit_card_payment_allocations to authenticated;
revoke all on public.credit_card_payment_allocations from anon;
