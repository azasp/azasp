-- PR #5 corrective migration: SMS event kinds, retry-safe materialization, atomic pairing.
alter table public.sms_import_events drop constraint if exists sms_import_events_event_kind_check;
alter table public.sms_import_events add constraint sms_import_events_event_kind_check
  check (event_kind in ('expense_debit','income_credit','card_payment_bank_debit','card_payment_processed','card_payment_credited','unclassified'));

-- Pairing is claimed and the pending device inserted in one transaction.
create or replace function public.register_paired_device(
  p_code_hash text, p_device_identifier text, p_device_secret_hash text
) returns table(device_id uuid, device_identifier text, status text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare pairing public.device_pairing_codes%rowtype; inserted public.family_devices%rowtype;
begin
  if length(coalesce(p_code_hash,'')) <> 64 or length(coalesce(p_device_secret_hash,'')) <> 64
     or length(trim(coalesce(p_device_identifier,''))) not between 1 and 80 then
    raise exception 'Invalid pairing request' using errcode='22023';
  end if;
  update public.device_pairing_codes
     set used_at=now()
   where code_hash=p_code_hash and used_at is null and expires_at>now()
   returning * into pairing;
  if not found then raise exception 'Pairing code is invalid, expired or already used' using errcode='P0001'; end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.id=pairing.family_member_id and fm.family_id=pairing.family_id and fm.status='active'
  ) then
    raise exception 'Family member is not active' using errcode='P0001';
  end if;

  insert into public.family_devices(
    family_id,family_member_id,device_identifier,device_type,status,registered_by,
    device_secret_hash,device_secret_created_at
  ) values (
    pairing.family_id,pairing.family_member_id,trim(p_device_identifier),'iphone','pending_approval',
    pairing.created_by,p_device_secret_hash,now()
  ) returning * into inserted;

  insert into public.family_device_audit(family_id,device_id,actor_user_id,action,details)
  values(pairing.family_id,inserted.id,pairing.created_by,'registered',
    jsonb_build_object('device_identifier',trim(p_device_identifier),'registration_method','ios_shortcut'));
  return query select inserted.id,inserted.device_identifier,inserted.status;
end; $$;
revoke all on function public.register_paired_device(text,text,text) from public, anon, authenticated;
grant execute on function public.register_paired_device(text,text,text) to service_role;

-- One authoritative allocation API. It serializes updates by locking the repayment and bill,
-- validates credited state and both remaining balances, then recalculates settlement atomically.
create or replace function public.allocate_credit_card_repayment(
  p_repayment_id uuid, p_bill_id uuid, p_amount numeric
) returns table(allocation_id uuid, bill_settled boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.credit_card_repayments%rowtype; b public.credit_card_bills%rowtype;
  used_r numeric(14,2); used_b numeric(14,2); aid uuid; settled boolean;
begin
  if p_amount is null or p_amount<=0 then raise exception 'Allocation must be positive'; end if;
  select * into r from public.credit_card_repayments where id=p_repayment_id and user_id=auth.uid() for update;
  if not found then raise exception 'Repayment not found'; end if;
  if r.status <> 'credited' then raise exception 'Repayment must be issuer-credited before allocation'; end if;
  select * into b from public.credit_card_bills where id=p_bill_id and user_id=auth.uid() for update;
  if not found then raise exception 'Bill not found'; end if;
  if r.card_account_id is not null and b.card_account_id is not null and r.card_account_id<>b.card_account_id then
    raise exception 'Repayment and bill belong to different cards';
  end if;
  select coalesce(sum(allocated_amount),0) into used_r from public.credit_card_payment_allocations where repayment_id=r.id;
  select coalesce(sum(allocated_amount),0) into used_b from public.credit_card_payment_allocations where bill_id=b.id;
  if used_r+p_amount>r.amount or used_b+p_amount>b.statement_amount then raise exception 'Allocation exceeds remaining repayment or bill amount'; end if;
  insert into public.credit_card_payment_allocations(user_id,repayment_id,bill_id,allocated_amount)
  values(auth.uid(),r.id,b.id,p_amount)
  on conflict(repayment_id,bill_id) do update
    set allocated_amount=public.credit_card_payment_allocations.allocated_amount+excluded.allocated_amount
  returning id into aid;
  select coalesce(sum(a.allocated_amount),0) into used_b from public.credit_card_payment_allocations a where a.bill_id=b.id;
  select used_b>=b.statement_amount
    and not exists (
      select 1 from public.credit_card_payment_allocations a
      join public.credit_card_repayments rp on rp.id=a.repayment_id
      where a.bill_id=b.id and rp.status<>'credited'
    ) into settled;
  update public.credit_card_bills
     set settlement_confirmed=settled,
         settlement_confirmed_at=case when settled then coalesce(settlement_confirmed_at,now()) else null end
   where id=b.id and user_id=auth.uid();
  return query select aid,settled;
end; $$;
revoke all on function public.allocate_credit_card_repayment(uuid,uuid,numeric) from public, anon;
grant execute on function public.allocate_credit_card_repayment(uuid,uuid,numeric) to authenticated;
