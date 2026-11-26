-- Bind imported transactions and privacy-preserving SMS event metadata to approved devices.
alter table public.expenses add column if not exists family_id uuid;
alter table public.expenses add column if not exists source_family_device_id uuid;
alter table public.expenses add constraint fk_expenses_family_device foreign key (source_family_device_id,family_id) references public.family_devices(id,family_id) on delete set null (source_family_device_id,family_id);
create unique index uq_expenses_device_message on public.expenses(source_family_device_id,source_message_hash);
create index ix_expenses_family_device_date on public.expenses(family_id,source_family_device_id,transaction_date desc) where family_id is not null;
alter table public.expense_import_batches add column if not exists family_id uuid;
alter table public.expense_import_batches add column if not exists source_family_device_id uuid;
alter table public.expense_import_batches add constraint fk_expense_batches_family_device foreign key (source_family_device_id,family_id) references public.family_devices(id,family_id) on delete set null (source_family_device_id,family_id);
create table public.sms_import_events (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id) on delete cascade,
 device_id uuid not null, message_hash text not null, sender text, received_at timestamptz not null,
 event_kind text not null check(event_kind in ('expense_debit','income_credit','card_payment_processed','card_payment_credited','unclassified')),
 amount numeric(14,2), currency text not null default 'INR' check(currency='INR'),
 account_last4 text check(account_last4 is null or account_last4 ~ '^[0-9]{4}$'), payment_reference text,
 linked_expense_id uuid references public.expenses(id) on delete set null, created_at timestamptz not null default now(),
 constraint fk_sms_import_event_device foreign key(device_id,family_id) references public.family_devices(id,family_id) on delete cascade,
 constraint uq_sms_import_event_device_hash unique(device_id,message_hash)
);
create index ix_sms_import_events_family_date on public.sms_import_events(family_id,received_at desc);
alter table public.sms_import_events enable row level security;
create policy sms_import_events_select_family on public.sms_import_events for select to authenticated using (
 exists(select 1 from public.families f where f.id=sms_import_events.family_id and f.owner_user_id=(select auth.uid()))
 or exists(select 1 from public.family_members fm where fm.family_id=sms_import_events.family_id and fm.auth_user_id=(select auth.uid()) and fm.status='active'));
grant select on public.sms_import_events to authenticated;
revoke all on public.sms_import_events from anon;
grant all on public.sms_import_events to service_role;
drop policy if exists expenses_select_family on public.expenses;
create policy expenses_select_family on public.expenses for select to authenticated using (
 exists(select 1 from public.families f where f.id=expenses.family_id and f.owner_user_id=(select auth.uid()))
 or exists(select 1 from public.family_members fm where fm.family_id=expenses.family_id and fm.auth_user_id=(select auth.uid()) and fm.status='active'));
drop policy if exists expense_import_batches_select_family on public.expense_import_batches;
create policy expense_import_batches_select_family on public.expense_import_batches for select to authenticated using (
 exists(select 1 from public.families f where f.id=expense_import_batches.family_id and f.owner_user_id=(select auth.uid()))
 or exists(select 1 from public.family_members fm where fm.family_id=expense_import_batches.family_id and fm.auth_user_id=(select auth.uid()) and fm.status='active'));
