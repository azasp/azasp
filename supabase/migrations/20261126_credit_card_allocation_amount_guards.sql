create or replace function public.enforce_credit_card_allocation_limits()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare repayment_amount numeric(14,2); bill_amount numeric(14,2); repayment_used numeric(14,2); bill_used numeric(14,2);
begin
 perform 1 from public.credit_card_repayments where id=new.repayment_id and user_id=new.user_id for update;
 select amount into repayment_amount from public.credit_card_repayments where id=new.repayment_id and user_id=new.user_id;
 if repayment_amount is null then raise exception 'Repayment not found'; end if;
 perform 1 from public.credit_card_bills where id=new.bill_id and user_id=new.user_id for update;
 select statement_amount into bill_amount from public.credit_card_bills where id=new.bill_id and user_id=new.user_id;
 if bill_amount is null then raise exception 'Credit-card bill not found'; end if;
 select coalesce(sum(allocated_amount),0) into repayment_used from public.credit_card_payment_allocations
 where repayment_id=new.repayment_id and user_id=new.user_id and (tg_op='INSERT' or id<>new.id);
 select coalesce(sum(allocated_amount),0) into bill_used from public.credit_card_payment_allocations
 where bill_id=new.bill_id and user_id=new.user_id and (tg_op='INSERT' or id<>new.id);
 if repayment_used+new.allocated_amount>repayment_amount then raise exception 'Allocations exceed repayment amount'; end if;
 if bill_used+new.allocated_amount>bill_amount then raise exception 'Allocations exceed bill amount'; end if;
 return new;
end; $$;
drop trigger if exists trg_enforce_cc_allocation_limits on public.credit_card_payment_allocations;
create trigger trg_enforce_cc_allocation_limits before insert or update on public.credit_card_payment_allocations
for each row execute function public.enforce_credit_card_allocation_limits();
revoke all on function public.enforce_credit_card_allocation_limits() from public,anon,authenticated;