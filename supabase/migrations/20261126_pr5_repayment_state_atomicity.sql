create or replace function public.set_credit_card_repayment_status(
  p_repayment_id uuid, p_next_status text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.credit_card_repayments%rowtype; bill record;
begin
  if p_next_status not in ('processed','credited') then raise exception 'Unsupported repayment transition'; end if;
  select * into r from public.credit_card_repayments
   where id=p_repayment_id and user_id=auth.uid() for update;
  if not found then raise exception 'Repayment not found'; end if;
  if (r.status='bank_debited' and p_next_status<>'processed')
     or (r.status='processed' and p_next_status<>'credited') then
    raise exception 'Invalid repayment state transition from % to %',r.status,p_next_status;
  end if;
  update public.credit_card_repayments
     set status=p_next_status,
         processed_at=case when p_next_status='processed' then coalesce(processed_at,now()) else processed_at end,
         credited_at=case when p_next_status='credited' then now() else credited_at end,
         updated_at=now()
   where id=r.id;

  for bill in
    select b.id,b.statement_amount
      from public.credit_card_bills b
     where b.user_id=auth.uid()
       and exists (select 1 from public.credit_card_payment_allocations a where a.bill_id=b.id and a.repayment_id=r.id)
     for update of b
  loop
    update public.credit_card_bills b
       set settlement_confirmed=(
         (select coalesce(sum(a.allocated_amount),0)
            from public.credit_card_payment_allocations a where a.bill_id=bill.id) >= bill.statement_amount
         and not exists (
           select 1 from public.credit_card_payment_allocations a
           join public.credit_card_repayments rp on rp.id=a.repayment_id
           where a.bill_id=bill.id and rp.status<>'credited'
         )
       ),
       settlement_confirmed_at=case when (
         (select coalesce(sum(a.allocated_amount),0)
            from public.credit_card_payment_allocations a where a.bill_id=bill.id) >= bill.statement_amount
         and not exists (
           select 1 from public.credit_card_payment_allocations a
           join public.credit_card_repayments rp on rp.id=a.repayment_id
           where a.bill_id=bill.id and rp.status<>'credited'
         )
       ) then coalesce(b.settlement_confirmed_at,now()) else null end
     where b.id=bill.id and b.user_id=auth.uid();
  end loop;
end; $$;
revoke all on function public.set_credit_card_repayment_status(uuid,text) from public,anon;
grant execute on function public.set_credit_card_repayment_status(uuid,text) to authenticated;

-- Reconcile legacy manual settlement flags against the canonical repayment ledger.
update public.credit_card_bills b
set settlement_confirmed=(
  coalesce((select sum(a.allocated_amount) from public.credit_card_payment_allocations a where a.bill_id=b.id),0) >= b.statement_amount
  and exists(select 1 from public.credit_card_payment_allocations a where a.bill_id=b.id)
  and not exists(
    select 1 from public.credit_card_payment_allocations a
    join public.credit_card_repayments r on r.id=a.repayment_id
    where a.bill_id=b.id and r.status<>'credited'
  )
),
settlement_confirmed_at=case when (
  coalesce((select sum(a.allocated_amount) from public.credit_card_payment_allocations a where a.bill_id=b.id),0) >= b.statement_amount
  and exists(select 1 from public.credit_card_payment_allocations a where a.bill_id=b.id)
  and not exists(
    select 1 from public.credit_card_payment_allocations a
    join public.credit_card_repayments r on r.id=a.repayment_id
    where a.bill_id=b.id and r.status<>'credited'
  )
) then coalesce(b.settlement_confirmed_at,now()) else null end;

-- Prevent clients from bypassing the authoritative RPCs with direct Data API writes.
revoke update on public.credit_card_repayments from authenticated;
revoke insert,update,delete on public.credit_card_payment_allocations from authenticated;
revoke update on public.credit_card_bills from authenticated;
grant select on public.credit_card_repayments, public.credit_card_payment_allocations, public.credit_card_bills to authenticated;
