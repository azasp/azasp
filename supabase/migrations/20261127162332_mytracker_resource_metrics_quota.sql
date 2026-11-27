-- MyTracker resource quota reporting.
-- Admin-only; host RAM telemetry is retrieved by the resource-metrics Edge Function.
create or replace function public.get_mytracker_resource_metrics()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_size_bytes bigint;
  v_active_connections integer;
  v_max_connections integer;
  v_tables jsonb;
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select pg_database_size(current_database()) into v_size_bytes;
  select count(*)::integer into v_active_connections
    from pg_stat_activity
    where datname = current_database() and state = 'active';
  select setting::integer into v_max_connections
    from pg_settings where name = 'max_connections';

  select coalesce(jsonb_agg(jsonb_build_object(
    'table_name', schemaname || '.' || relname,
    'total_bytes', pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)
  ) order by pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass) desc), '[]'::jsonb)
  into v_tables
  from pg_stat_user_tables
  where schemaname = 'public';

  return jsonb_build_object(
    'database_size_bytes', v_size_bytes,
    'database_quota_bytes', 524288000,
    'database_usage_percent', round((v_size_bytes::numeric / 524288000) * 100, 2),
    'database_remaining_bytes', greatest(524288000 - v_size_bytes, 0),
    'active_connections', v_active_connections,
    'max_connections', v_max_connections,
    'table_sizes', v_tables,
    'collected_at', now()
  );
end;
$$;

revoke all on function public.get_mytracker_resource_metrics() from public, anon;
grant execute on function public.get_mytracker_resource_metrics() to authenticated;

comment on function public.get_mytracker_resource_metrics() is
'Returns database storage usage against the configured 500 MB MyTracker quota, largest public table sizes, and PostgreSQL active/max connections for administrators. Host RAM is served separately by the resource-metrics Edge Function; CPU percentage is not inferred from a single counter sample.';
