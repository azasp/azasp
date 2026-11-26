-- Multiple bank accounts and credit cards for MyTracker.
-- Keep expenses.account text for backward compatibility.
create table if not exists public.financial_accounts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    account_type text not null check (account_type in ('bank','credit_card')),
    institution text not null check (length(trim(institution)) > 0),
    nickname text not null check (length(trim(nickname)) > 0),
    account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
    is_active boolean not null default true,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint uq_financial_accounts_id_user unique (id,user_id)
);
create index if not exists ix_financial_accounts_user_type on public.financial_accounts(user_id,account_type,is_active,institution);
alter table public.financial_accounts enable row level security;
drop policy if exists financial_accounts_select_own on public.financial_accounts;
create policy financial_accounts_select_own on public.financial_accounts for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists financial_accounts_insert_own on public.financial_accounts;
create policy financial_accounts_insert_own on public.financial_accounts for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists financial_accounts_update_own on public.financial_accounts;
create policy financial_accounts_update_own on public.financial_accounts for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists financial_accounts_delete_own on public.financial_accounts;
create policy financial_accounts_delete_own on public.financial_accounts for delete to authenticated using (user_id=(select auth.uid()));
grant select,insert,update,delete on public.financial_accounts to authenticated;
revoke all on public.financial_accounts from anon;

alter table public.expenses add column if not exists financial_account_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname='fk_expenses_financial_account_owner') then
    alter table public.expenses add constraint fk_expenses_financial_account_owner
      foreign key (financial_account_id,user_id) references public.financial_accounts(id,user_id) on delete set null (financial_account_id);
  end if;
end $$;
create index if not exists ix_expenses_financial_account on public.expenses(user_id,financial_account_id) where financial_account_id is not null;

alter table public.credit_card_bills add column if not exists card_account_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname='fk_credit_card_bills_card_account_owner') then
    alter table public.credit_card_bills add constraint fk_credit_card_bills_card_account_owner
      foreign key (card_account_id,user_id) references public.financial_accounts(id,user_id) on delete set null (card_account_id);
  end if;
end $$;
create index if not exists ix_credit_card_bills_card_account on public.credit_card_bills(user_id,card_account_id,due_date desc);
