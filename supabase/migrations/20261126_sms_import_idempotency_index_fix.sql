drop index if exists public.uq_expenses_device_message;
create unique index uq_expenses_device_message on public.expenses(source_family_device_id,source_message_hash);