# Supabase Resource Monitor

## What this adds
- Admin-only MyTracker **Resources** tab.
- PostgreSQL database size in bytes (formatted in the UI).
- Largest 20 public tables, including indexes and TOAST storage.
- Current observed connections and PostgreSQL `max_connections`.
- Explicit unavailable states for host RAM, CPU, plan storage quota, and network egress.

## Apply the migration
Apply `supabase/migrations/20261127120000_mytracker_resource_monitor.sql` to the connected Supabase project, then sign in to MyTracker as an administrator and open **Resources**.

The migration creates `public.get_mytracker_resource_metrics()`. It checks the caller's authenticated user ID against `public.profiles.role = 'admin'`, runs as a tightly scoped definer function, revokes execution from `PUBLIC` and `anon`, and grants execution only to `authenticated`.

## Important metric boundaries
- Database size and relation sizes are PostgreSQL measurements.
- Connection count is the number of sessions visible to the function at collection time; it is a point-in-time value.
- `max_connections` is PostgreSQL's configured connection ceiling, not a Supabase plan quota.
- PostgreSQL shared buffers are not total host RAM usage. This dashboard deliberately does not mislabel them as RAM.
- Supabase plan quotas, host RAM/CPU, and egress require Supabase platform metrics/billing data. A future server-side Edge Function can use a Supabase Management API access token stored as an Edge Function secret. Never place that token or a service-role key in `config.js` or browser code.

## Validation
The PR includes the SQL migration and browser integration. Apply the migration in a non-production/test environment first, verify a non-admin receives SQLSTATE `42501`, and verify an admin sees database and table sizes. Platform metrics remain explicitly marked as not connected until the server-side integration is implemented.
