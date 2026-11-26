-- Make iPhone enrollment atomic: pairing-code consumption, device creation,
-- and audit insertion either all commit or all roll back.
create or replace function public.register_iphone_device(
  p_pairing_code_hash text,
  p_device_identifier text,
  p_device_secret_hash text
)
returns table (
  device_id uuid,
  device_status text,
  device_identifier text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pairing public.device_pairing_codes%rowtype;
  v_device public.family_devices%rowtype;
begin
  if p_pairing_code_hash is null or length(p_pairing_code_hash) <> 64
     or p_device_secret_hash is null or length(p_device_secret_hash) <> 64
     or p_device_identifier is null
     or length(btrim(p_device_identifier)) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'Invalid enrollment input';
  end if;

  select * into v_pairing
  from public.device_pairing_codes
  where code_hash = p_pairing_code_hash
  for update;

  if not found or v_pairing.used_at is not null or v_pairing.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'PAIRING_CODE_INVALID_OR_USED';
  end if;

  if not exists (
    select 1
    from public.family_members fm
    where fm.id = v_pairing.family_member_id
      and fm.family_id = v_pairing.family_id
      and fm.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'FAMILY_MEMBER_NOT_ACTIVE';
  end if;

  update public.device_pairing_codes
  set used_at = now()
  where id = v_pairing.id;

  insert into public.family_devices (
    family_id, family_member_id, device_identifier, device_type,
    status, registered_by, device_secret_hash, device_secret_created_at
  ) values (
    v_pairing.family_id, v_pairing.family_member_id, btrim(p_device_identifier),
    'iphone', 'pending_approval', v_pairing.created_by,
    p_device_secret_hash, now()
  )
  returning * into v_device;

  insert into public.family_device_audit (
    family_id, device_id, actor_user_id, action, details
  ) values (
    v_device.family_id, v_device.id, v_pairing.created_by, 'registered',
    jsonb_build_object(
      'device_identifier', v_device.device_identifier,
      'registration_method', 'ios_shortcut'
    )
  );

  return query select v_device.id, v_device.status, v_device.device_identifier;
end;
$$;

revoke all on function public.register_iphone_device(text, text, text) from public, anon, authenticated;
grant execute on function public.register_iphone_device(text, text, text) to service_role;
