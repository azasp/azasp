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
    const grid = el("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px";
    grid.append(
        resourceMetricCard("Database storage used", resourceBytes(data.database_size_bytes), "PostgreSQL database total"),
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
        resourceMetricCard("RAM usage", "Not connected", "Requires server-side Supabase platform metrics"),
        resourceMetricCard("CPU usage", "Not connected", "Requires server-side Supabase platform metrics"),
        resourceMetricCard("Storage quota", "Not available", "Plan quota must come from project billing/metrics"),
        resourceMetricCard("Network egress", "Not connected", "Requires platform usage metrics")
    );
    platform.append(pgrid);
    platform.append(el("div", "sub", "No service-role key or Supabase Management API token is used in this browser module. A future server-side integration can populate these figures securely."));
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
