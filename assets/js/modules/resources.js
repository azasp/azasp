// Admin-only resource monitor for PostgreSQL storage and Supabase host metrics.
const RESOURCE_QUOTA_BYTES = 500 * 1024 * 1024;
let resourceMetricsCache = null;
let resourceMetricsCacheAt = 0;
let resourceMetricsLoading = false;
const RESOURCE_METRICS_TTL_MS = 5 * 60 * 1000;

function resourceBytes(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "—";
    if (n < 1024) return n + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2) + " " + units[i];
}

function resourceMetricCard(title, value, note) {
    const box = el("div");
    box.style.cssText = "border:1px solid var(--bd);border-radius:10px;padding:12px;min-width:0";
    box.append(el("div", "sub", title));
    const big = el("div", "big", value);
    big.style.fontSize = "clamp(20px,5vw,28px)";
    box.append(big);
    if (note) box.append(el("div", "sub", note));
    return box;
}

function resourceUsageState(data) {
    const quotaBytes = Number(data?.database_quota_bytes || RESOURCE_QUOTA_BYTES);
    const usedBytes = Number(data?.database_size_bytes || 0);
    const percent = Math.max(0, Number(data?.database_usage_percent ?? (usedBytes / quotaBytes * 100)));
    const remainingBytes = Math.max(0, Number(data?.database_remaining_bytes ?? (quotaBytes - usedBytes)));
    const level = percent >= 95 ? "critical" : percent >= 85 ? "high" : percent >= 70 ? "caution" : "healthy";
    const message = level === "critical"
        ? "Critical: database storage is at " + percent.toFixed(1) + "% of the 500 MB quota. Review storage immediately."
        : level === "high"
            ? "High database usage: " + percent.toFixed(1) + "% of the 500 MB quota. Review large tables and unnecessary data."
            : level === "caution"
                ? "Database storage warning: " + percent.toFixed(1) + "% of the 500 MB quota is used."
                : "Database storage healthy: " + percent.toFixed(1) + "% of the 500 MB quota is used.";
    return { quotaBytes, usedBytes, percent, remainingBytes, level, message };
}

// Render on every authenticated admin page, not only inside Resources.
function renderGlobalResourceNotice(host) {
    if (role() !== "admin") return;
    const wrap = el("div", "resource-global-notice");
    if (!resourceMetricsCache?.database_size_bytes && resourceMetricsCache?.database_size_bytes !== 0) {
        wrap.classList.add("loading");
        wrap.textContent = "Checking live database storage against the 500 MB free-tier quota…";
    } else {
        const state = resourceUsageState(resourceMetricsCache);
        wrap.classList.add(state.level);
        wrap.append(el("span", null, state.message));
        const details = el("span", "resource-global-detail",
            resourceBytes(state.usedBytes) + " / " + resourceBytes(state.quotaBytes));
        wrap.append(details);
    }
    host.append(wrap);
}

async function refreshResourceMetrics(force) {
    if (role() !== "admin") return null;
    if (!force && resourceMetricsCache && Date.now() - resourceMetricsCacheAt < RESOURCE_METRICS_TTL_MS) return resourceMetricsCache;
    if (resourceMetricsLoading) return null;
    resourceMetricsLoading = true;
    try {
        const { data, error } = await sb.functions.invoke("resource-metrics", { body: {} });
        if (error) throw error;
        if (!data?.database_metrics) throw new Error(data?.error || "Resource metrics response was incomplete.");
        resourceMetricsCache = data;
        resourceMetricsCacheAt = Date.now();
        return data;
    } catch (error) {
        console.warn("MyTracker resource metrics unavailable:", error?.message || error);
        // Keep the previous known-good snapshot visible if a refresh fails.
        return resourceMetricsCache;
    } finally {
        resourceMetricsLoading = false;
    }
}

async function resourcesTab(S, F, L) {
    S.append(el("b", null, "🖥️ Supabase resource monitor"));
    S.append(el("div", "sub", "Live PostgreSQL measurements and host telemetry. Database storage is compared with the configured 500 MB Free-tier quota."));
    const status = el("div", "sub", "Loading resource metrics…");
    S.append(status);
    const refresh = el("button", "add", "Refresh metrics");
    refresh.onclick = async () => {
        refresh.disabled = true;
        await refreshResourceMetrics(true);
        draw();
    };
    F.append(refresh);
    const dashboard = el("a", "link", "Open Supabase project dashboard");
    dashboard.href = "https://supabase.com/dashboard/project/flkbctstpgsllyvunihm";
    dashboard.target = "_blank";
    dashboard.rel = "noopener noreferrer";
    F.append(dashboard);

    if (role() !== "admin") {
        status.textContent = "Administrator access is required to view project-wide resource metrics.";
        return;
    }

    const payload = await refreshResourceMetrics(false);
    if (!payload?.database_metrics) {
        status.textContent = "Resource metrics could not be loaded. Check the resource-metrics Edge Function deployment and database migration.";
        return;
    }

    const data = payload.database_metrics;
    const state = resourceUsageState(data);
    const platformMetrics = payload.platform_metrics || {};
    const usage = el("div", "resource-usage");
    const usageHead = el("div", "resource-usage-head");
    usageHead.append(el("b", null, "Database storage · 500 MB quota"), el("b", null, state.percent.toFixed(1) + "%"));
    const track = el("div", "resource-progress");
    const fill = el("div", "resource-progress-fill " + state.level);
    fill.style.width = Math.min(100, state.percent) + "%";
    track.append(fill);
    usage.append(usageHead, track);
    usage.append(el("div", "sub", resourceBytes(state.usedBytes) + " used · " + resourceBytes(state.remainingBytes) + " remaining"));
    S.append(usage);

    const grid = el("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px";
    grid.append(
        resourceMetricCard("Database storage used", resourceBytes(state.usedBytes), "Actual PostgreSQL database size"),
        resourceMetricCard("Storage remaining", resourceBytes(state.remainingBytes), "Against 500 MB quota"),
        resourceMetricCard("Active connections", String(data.active_connections ?? "—"), "Observed by PostgreSQL"),
        resourceMetricCard("Connection limit", String(data.max_connections ?? "—"), "PostgreSQL max_connections")
    );
    S.append(grid);
    status.textContent = "Metrics updated " + new Date(data.collected_at || Date.now()).toLocaleString();

    const platform = el("div", "card");
    platform.append(el("b", null, "Platform resources"));
    const pgrid = el("div");
    pgrid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-top:10px";
    const ram = platformMetrics.ram || null;
    pgrid.append(
        resourceMetricCard("Database host RAM used", ram ? resourceBytes(ram.used_bytes) : "Not connected",
            ram ? resourceBytes(ram.available_bytes) + " available of " + resourceBytes(ram.total_bytes) : (platformMetrics.message || "Configure SUPABASE_METRICS_SECRET_KEY in Edge Function secrets")),
        resourceMetricCard("RAM utilization", ram ? Number(ram.used_percent).toFixed(1) + "%" : "Not available",
            "Supabase database host telemetry"),
        resourceMetricCard("CPU usage", "Not available", "CPU utilization requires interval-based counter sampling"),
        resourceMetricCard("Metrics source", platformMetrics.status === "connected" ? "Connected" : "Not connected",
            platformMetrics.collected_at ? "Collected " + new Date(platformMetrics.collected_at).toLocaleString() : "Supabase Prometheus Metrics API")
    );
    platform.append(pgrid);
    platform.append(el("div", "sub", "RAM is read from Supabase's privileged Prometheus Metrics API on the database host. CPU percentage is intentionally not guessed from a single cumulative counter sample."));
    L.append(platform);

    L.append(el("b", null, "Largest public tables"));
    const rows = Array.isArray(data.table_sizes) ? data.table_sizes : [];
    if (!rows.length) L.append(el("div", "sub", "No public tables were returned."));
    rows.forEach(row => {
        const item = el("div", "item");
        item.append(el("span", null, row.table_name || "Unknown table"));
        item.append(el("b", null, resourceBytes(row.total_bytes)));
        L.append(item);
    });
    L.append(el("div", "sub", "Table sizes include indexes and TOAST data. Database total also includes PostgreSQL system/catalog data, so table totals will not necessarily add up to the database total."));
}
