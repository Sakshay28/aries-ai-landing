"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const sidebarLinks = [
  { icon: "🏠", label: "Overview", href: "/admin" },
  { icon: "🏢", label: "All Clients", href: "/admin/clients" },
  { icon: "💰", label: "Revenue", href: "/admin/revenue" },
  { icon: "📊", label: "Analytics", href: "/admin/analytics", active: true },
  { icon: "⚙️", label: "Platform Settings", href: "/admin/settings" },
];

interface StatsData {
  totalTenants: number;
  activeTenants: number;
  totalLeads: number;
  totalMessages: number;
  mrr: number;
  tenantsByPlan: { plan: string; count: number }[];
}

export default function AdminAnalyticsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/overview");
      if (!res.ok) throw new Error(res.status === 403 ? "Admin access required." : `API error: ${res.status}`);
      const data = await res.json();
      if (data.success) setStats(data.data.stats);
      else throw new Error(data.error);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void (async () => { await fetchData(); })(); }, [fetchData]);

  // Derived metrics
  const planData = (stats?.tenantsByPlan || []).map(p => ({ plan: p.plan.charAt(0).toUpperCase() + p.plan.slice(1), count: p.count }));
  const conversionRate = stats?.totalTenants ? Math.round((stats.activeTenants / stats.totalTenants) * 100) : 0;
  const avgMessagesPerClient = stats?.activeTenants && stats.totalMessages ? Math.round(stats.totalMessages / stats.activeTenants) : 0;
  const avgLeadsPerClient = stats?.activeTenants && stats.totalLeads ? Math.round(stats.totalLeads / stats.activeTenants) : 0;

  // Simulated weekly signups (replace with real DB query once analytics_events is wired)
  const weeklySignups = [
    { week: "W1 Apr", signups: 2 }, { week: "W2 Apr", signups: 4 }, { week: "W3 Apr", signups: 3 },
    { week: "W4 Apr", signups: 6 }, { week: "W1 May", signups: 5 }, { week: "W2 May", signups: 8 },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <aside style={{ width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", padding: "1.5rem 0", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Admin Panel</span>
          </Link>
        </div>
        <nav>{sidebarLinks.map(item => (
          <Link key={item.label} href={item.href} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem", color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none", background: item.active ? "rgba(108,92,231,0.1)" : "transparent", borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent", fontSize: "0.9rem", fontWeight: item.active ? 600 : 400 }}>
            <span>{item.icon}</span><span>{item.label}</span>
          </Link>
        ))}</nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 50, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>📊 Platform Analytics</h1><p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Messages, leads, conversions, growth</p></div>
          <button onClick={fetchData} style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.85rem" }}>🔄 Refresh</button>
        </header>

        <div style={{ padding: "2rem" }}>
          {error && <div style={{ padding: "1rem", background: "rgba(225,112,85,0.1)", border: "1px solid rgba(225,112,85,0.3)", borderRadius: "8px", marginBottom: "1.5rem", color: "#E17055" }}>❌ {error}</div>}

          {loading && !stats ? <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>⏳ Loading analytics...</div> : (
            <>
              {/* KPI cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "1rem", marginBottom: "2rem" }}>
                {[
                  { icon: "🏢", label: "Total Tenants", value: stats?.totalTenants || 0, color: "#6C5CE7" },
                  { icon: "✅", label: "Active Tenants", value: stats?.activeTenants || 0, color: "#00B894" },
                  { icon: "🔄", label: "Trial → Paid", value: `${conversionRate}%`, color: "#00CEC9" },
                  { icon: "📩", label: "Total Messages", value: (stats?.totalMessages || 0).toLocaleString(), color: "#FDCB6E" },
                  { icon: "👥", label: "Total Leads", value: (stats?.totalLeads || 0).toLocaleString(), color: "#A29BFE" },
                  { icon: "💬", label: "Msgs / Client", value: avgMessagesPerClient, color: "#E17055" },
                  { icon: "🎯", label: "Leads / Client", value: avgLeadsPerClient, color: "#74B9FF" },
                ].map(c => (
                  <div key={c.label} className="glass-card" style={{ padding: "1.1rem", borderTop: `3px solid ${c.color}` }}>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.4rem" }}>{c.icon} {c.label}</p>
                    <p style={{ fontSize: "1.5rem", fontWeight: 800, color: c.color }}>{c.value}</p>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
                {/* Clients by Plan */}
                <div className="glass-card" style={{ padding: "1.5rem" }}>
                  <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>🏆 Clients by Plan</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={planData} barSize={36}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="plan" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }} />
                      <Bar dataKey="count" fill="#6C5CE7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Weekly Signups */}
                <div className="glass-card" style={{ padding: "1.5rem" }}>
                  <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>📅 Weekly Signups</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "1rem" }}>Simulated — wire analytics_events for live data</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={weeklySignups}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="week" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }} />
                      <Line type="monotone" dataKey="signups" stroke="#00CEC9" strokeWidth={2} dot={{ fill: "#00CEC9", r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Summary table */}
              <div className="glass-card" style={{ padding: "1.5rem" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>📋 Platform Health Summary</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: "1rem" }}>
                  {[
                    { label: "Active / Total Tenants", value: `${stats?.activeTenants || 0} / ${stats?.totalTenants || 0}`, ok: (stats?.activeTenants || 0) > 0 },
                    { label: "Trial → Paid Conversion", value: `${conversionRate}%`, ok: conversionRate >= 30 },
                    { label: "Messages per Active Client", value: avgMessagesPerClient.toLocaleString(), ok: avgMessagesPerClient >= 100 },
                    { label: "Leads per Active Client", value: avgLeadsPerClient.toLocaleString(), ok: avgLeadsPerClient >= 10 },
                    { label: "MRR", value: `₹${(stats?.mrr || 0).toLocaleString()}`, ok: (stats?.mrr || 0) > 0 },
                  ].map(row => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", background: "var(--bg-tertiary)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{row.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{row.value}</span>
                        <span style={{ color: row.ok ? "#00B894" : "#FDCB6E" }}>{row.ok ? "✅" : "⚠️"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
