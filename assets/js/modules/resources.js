// Admin-only Supabase resource monitor.
// Database figures come from a restricted SQL RPC. Platform RAM/CPU and plan quotas
// are intentionally reported as unavailable until a server-side Management API
// integration is configured; browser code must never contain an access token.
function resourceBytes(value) {
    const n = Number(value || 0);
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
async function resourcesTab(S, F, L) {
    S.append(el("b", null, "🖥️ Supabase resource monitor"));
    S.append(el("div", "sub", "Live PostgreSQL measurements. Platform quotas and host RAM are shown separately because SQL cannot report them reliably."));
    const status = el("div", "sub", "Loading database metrics…");
    S.append(status);
    const refresh = el("button", "add", "Refresh metrics");
    refresh.onclick = () => { tab = "resources"; draw(); };
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
    const { data, error } = await sb.rpc("get_mytracker_resource_metrics");
    if (error) {
        status.textContent = "Database metrics could not be loaded: " + error.message;
        L.append(el("div", "sub", "Apply the resource-monitor SQL migration, then refresh. No database changes are made by this screen."));
        return;
    }
    const quotaBytes = Number(data.database_quota_bytes || 524288000);
    const usedBytes = Number(data.database_size_bytes || 0);
    const usagePercent = Math.max(0, Number(data.database_usage_percent ?? (usedBytes / quotaBytes * 100)));
    const remainingBytes = Math.max(0, Number(data.database_remaining_bytes ?? (quotaBytes - usedBytes)));
    const threshold = usagePercent >= 95 ? "critical" : usagePercent >= 85 ? "high" : usagePercent >= 70 ? "caution" : "healthy";
    const warningText = threshold === "critical"
        ? "Critical: database storage has reached " + usagePercent.toFixed(1) + "% of the 500 MB free-tier quota. Clean up data or review your plan immediately."
        : threshold === "high"
            ? "High usage: database storage has reached " + usagePercent.toFixed(1) + "%. Review large tables and remove unnecessary data."
            : threshold === "caution"
                ? "Storage caution: database usage has reached " + usagePercent.toFixed(1) + "% of the 500 MB quota."
                : "Database storage is healthy (" + usagePercent.toFixed(1) + "% used).";
    const warning = el("div", "resource-warning " + threshold, warningText);
    S.append(warning);
    const usage = el("div", "resource-usage");
    const usageHead = el("div", "resource-usage-head");
    usageHead.append(el("b", null, "500 MB database quota"), el("b", null, usagePercent.toFixed(1) + "%"));
    const track = el("div", "resource-progress");
    const fill = el("div", "resource-progress-fill " + threshold);
    fill.style.width = Math.min(100, usagePercent) + "%";
    track.append(fill);
    usage.append(usageHead, track);
    usage.append(el("div", "sub", resourceBytes(usedBytes) + " used · " + resourceBytes(remainingBytes) + " remaining"));
    S.append(usage);

    const grid = el("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px";
    grid.append(
        resourceMetricCard("Database storage used", resourceBytes(usedBytes), "PostgreSQL database total"),
        resourceMetricCard("Active connections", String(data.active_connections ?? "—"), "Observed by PostgreSQL"),
        resourceMetricCard("Connection limit", String(data.max_connections ?? "—"), "PostgreSQL max_connections"),
        resourceMetricCard("Tables measured", String((data.table_sizes || []).length), "Public schema")
    );
    S.append(grid);
    status.textContent = "Database metrics updated " + new Date(data.collected_at || Date.now()).toLocaleString();
    const platform = el("div", "card");
    platform.append(el("b", null, "Platform resources"));
    const pgrid = el("div");
    pgrid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-top:10px";
    pgrid.append(
        resourceMetricCard("RAM usage", data.platform_metrics?.ram_used_bytes != null ? resourceBytes(data.platform_metrics.ram_used_bytes) : "Not connected", data.platform_metrics?.ram_total_bytes != null ? "of " + resourceBytes(data.platform_metrics.ram_total_bytes) : "Requires server-side Supabase platform metrics"),
        resourceMetricCard("CPU usage", data.platform_metrics?.cpu_percent != null ? Number(data.platform_metrics.cpu_percent).toFixed(1) + "%" : "Not connected", "Supabase platform metric"),
        resourceMetricCard("Storage quota", resourceBytes(quotaBytes), "Configured Free plan database quota"),
        resourceMetricCard("Network egress", "Not connected", "Requires platform usage metrics")
    );
    platform.append(pgrid);
    platform.append(el("div", "sub", "Host RAM and CPU are displayed only when supplied by a trusted server-side platform-metrics integration. They are never estimated from PostgreSQL."));
    L.append(platform);
    const tableTitle = el("b", null, "Largest public tables");
    L.append(tableTitle);
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
