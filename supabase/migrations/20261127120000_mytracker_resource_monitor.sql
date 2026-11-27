-- MyTracker: admin-only PostgreSQL resource metrics.
-- Reports database and public-table storage plus observed connection counts.
-- Does not claim to report host RAM, CPU, billing quota, or network egress.
create or replace function public.get_mytracker_resource_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
    v_uid uuid := auth.uid();
    v_database_bytes bigint;
    v_connections integer;
    v_max_connections integer;
    v_tables jsonb;
begin
    if v_uid is null or not exists (
        select 1
        from public.profiles p
        where p.id = v_uid
          and p.role = 'admin'
    ) then
        raise exception 'Administrator access required'
            using errcode = '42501';
    end if;

    select pg_catalog.pg_database_size(current_database())
      into v_database_bytes;

    select count(*)::integer
      into v_connections
      from pg_catalog.pg_stat_activity
     where datname = current_database();

    v_max_connections := current_setting('max_connections')::integer;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'table_name', table_name,
                'total_bytes', total_bytes
            )
            order by total_bytes desc
        ),
        '[]'::jsonb
    )
      into v_tables
      from (
          select
              c.relname as table_name,
              pg_catalog.pg_total_relation_size(c.oid)::bigint as total_bytes
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relkind in ('r', 'm', 'p')
          order by pg_catalog.pg_total_relation_size(c.oid) desc
          limit 20
      ) sized_tables;

    return jsonb_build_object(
        'database_size_bytes', v_database_bytes,
        'active_connections', v_connections,
        'max_connections', v_max_connections,
        'table_sizes', v_tables,
        'collected_at', now()
    );
end;
$$;

revoke all on function public.get_mytracker_resource_metrics() from public;
revoke all on function public.get_mytracker_resource_metrics() from anon;
grant execute on function public.get_mytracker_resource_metrics() to authenticated;

comment on function public.get_mytracker_resource_metrics() is
'Returns PostgreSQL database/table storage and connection metrics to MyTracker administrators. Does not expose host RAM, CPU, quotas, or network usage.';
