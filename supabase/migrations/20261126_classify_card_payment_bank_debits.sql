alter table public.sms_import_events drop constraint if exists sms_import_events_event_kind_check;
alter table public.sms_import_events add constraint sms_import_events_event_kind_check
check (event_kind in ('expense_debit','income_credit','card_payment_bank_debit','card_payment_processed','card_payment_credited','unclassified'));