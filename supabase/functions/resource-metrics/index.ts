import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function parsePrometheusMetric(text: string, metricName: string): number | null {
  const values: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|NaN|\+Inf|-Inf)(?:\s|$)/);
    if (!match || match[1] !== metricName) continue;
    const labels = match[2] || "";
    // These are the database host's node-exporter metrics, not unrelated services.
    if (labels && !/(?:^|,)\s*service_type="db"(?:,|$)/.test(labels)) continue;
    const value = Number(match[3]);
    if (Number.isFinite(value)) values.push(value);
  }
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json(500, { error: "Supabase Edge Function configuration is incomplete" });

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json(401, { error: "Authentication required" });

  // Forward the caller's JWT. The database RPC independently enforces the admin role.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userResult, error: userError } = await userClient.auth.getUser();
  if (userError || !userResult?.user) return json(401, { error: "Invalid or expired session" });

  const { data: databaseMetrics, error: databaseError } =
    await userClient.rpc("get_mytracker_resource_metrics");
  if (databaseError) {
    const status = databaseError.code === "42501" ? 403 : 500;
    return json(status, { error: databaseError.message });
  }

  const metricsSecret = Deno.env.get("SUPABASE_METRICS_SECRET_KEY");
  if (!metricsSecret) {
    return json(200, {
      database_metrics: databaseMetrics,
      platform_metrics: {
        status: "not_configured",
        message: "Add SUPABASE_METRICS_SECRET_KEY to the resource-metrics Edge Function secrets to enable live host RAM metrics."
      }
    });
  }

  try {
    const credentials = btoa("service_role:" + metricsSecret);
    const response = await fetch(
      supabaseUrl + "/customer/v1/privileged/metrics",
      {
        method: "GET",
        headers: { Authorization: "Basic " + credentials },
        signal: AbortSignal.timeout(10000)
      }
    );
    if (!response.ok) {
      return json(200, {
        database_metrics: databaseMetrics,
        platform_metrics: {
          status: "error",
          message: "Supabase Metrics API returned HTTP " + response.status + ". Verify the metrics secret and project API key."
        }
      });
    }

    const prometheus = await response.text();
    const totalBytes = parsePrometheusMetric(prometheus, "node_memory_MemTotal_bytes");
    const availableBytes = parsePrometheusMetric(prometheus, "node_memory_MemAvailable_bytes");
    if (totalBytes == null || availableBytes == null || totalBytes <= 0) {
      return json(200, {
        database_metrics: databaseMetrics,
        platform_metrics: {
          status: "unavailable",
          message: "RAM series were not present in the Supabase Metrics API response."
        }
      });
    }

    const usedBytes = Math.max(0, totalBytes - availableBytes);
    return json(200, {
      database_metrics: databaseMetrics,
      platform_metrics: {
        status: "connected",
        ram: {
          total_bytes: totalBytes,
          available_bytes: availableBytes,
          used_bytes: usedBytes,
          used_percent: Math.round((usedBytes / totalBytes) * 10000) / 100
        },
        collected_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Supabase platform metrics request failed:", error);
    return json(200, {
      database_metrics: databaseMetrics,
      platform_metrics: {
        status: "error",
        message: "Unable to fetch Supabase platform metrics. Check the Edge Function logs."
      }
    });
  }
});
