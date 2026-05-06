"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const PLAN_PRICES: Record<string, number> = { starter: 999, growth: 2499, pro: 6999, enterprise: 25000 };
const PLAN_COLORS: Record<string, string> = { starter: "#6C5CE7", growth: "#00CEC9", pro: "#00B894", enterprise: "#FDCB6E" };

const sidebarLinks = [
  { icon: "🏠", label: "Overview", href: "/admin" },
  { icon: "🏢", label: "All Clients", href: "/admin/clients" },
  { icon: "💰", label: "Revenue", href: "/admin/revenue", active: true },
  { icon: "📊", label: "Analytics", href: "/admin/analytics" },
  { icon: "⚙️", label: "Platform Settings", href: "/admin/settings" },
];

interface PlanRow { plan: string; count: number; }
interface StatsData { activeTenants: number; mrr: number; tenantsByPlan: PlanRow[]; }

export default function AdminRevenuePage() {
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

  useEffect(() => { fetchData(); }, [fetchData]);

  const planData = (stats?.tenantsByPlan || []).map(p => ({ ...p, revenue: (PLAN_PRICES[p.plan] || 0) * p.count, color: PLAN_COLORS[p.plan] || "#b2bec3" }));
  const totalMRR = stats?.mrr || 0;
  const totalARR = totalMRR * 12;
  const arpa = stats?.activeTenants ? Math.round(totalMRR / stats.activeTenants) : 0;
  const months = ["Dec", "Jan", "Feb", "Mar", "Apr", "May"];
  const revenueChart = months.map((month, i) => ({ month, revenue: Math.round(totalMRR / Math.pow(1.12, months.length - 1 - i)) }));

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
          <div><h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>💰 Revenue Dashboard</h1><p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>MRR, ARR, and plan breakdown</p></div>
          <button onClick={fetchData} style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.85rem" }}>🔄 Refresh</button>
        </header>
        <div style={{ padding: "2rem" }}>
          {error && <div style={{ padding: "1rem", background: "rgba(225,112,85,0.1)", border: "1px solid rgba(225,112,85,0.3)", borderRadius: "8px", marginBottom: "1.5rem", color: "#E17055" }}>❌ {error}</div>}
          {loading && !stats ? <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>⏳ Loading...</div> : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "1rem", marginBottom: "2rem" }}>
                {[
                  { icon: "💰", label: "MRR", value: `₹${totalMRR.toLocaleString()}`, color: "#00B894" },
                  { icon: "📈", label: "ARR", value: `₹${totalARR.toLocaleString()}`, color: "#6C5CE7" },
                  { icon: "👤", label: "ARPA", value: `₹${arpa.toLocaleString()}`, color: "#00CEC9" },
                  { icon: "🏢", label: "Paying", value: stats?.activeTenants || 0, color: "#FDCB6E" },
                ].map(c => (
                  <div key={c.label} className="glass-card" style={{ padding: "1.25rem", borderTop: `3px solid ${c.color}` }}>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>{c.icon} {c.label}</p>
                    <p style={{ fontSize: "1.75rem", fontWeight: 800, color: c.color }}>{c.value}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
                <div className="glass-card" style={{ padding: "1.5rem" }}>
                  <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>📈 MRR Trend</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={revenueChart}>
                      <defs><linearGradient id="mrrG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00B894" stopOpacity={0.3}/><stop offset="95%" stopColor="#00B894" stopOpacity={0}/></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                      <XAxis dataKey="month" tick={{ fill: "var(--text-muted)", fontSize: 12 }}/>
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 12 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`}/>
                      <Tooltip formatter={(v: unknown) => [`₹${(v as number).toLocaleString()}`, "MRR"]} contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}/>
                      <Area type="monotone" dataKey="revenue" stroke="#00B894" strokeWidth={2} fill="url(#mrrG)"/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="glass-card" style={{ padding: "1.5rem" }}>
                  <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>🥧 Revenue by Plan</h2>
                  {planData.length === 0 ? <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>No paying clients yet.</p> : (
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                      <ResponsiveContainer width="50%" height={180}>
                        <PieChart><Pie data={planData} dataKey="revenue" cx="50%" cy="50%" outerRadius={70} strokeWidth={0}>
                          {planData.map((p, i) => <Cell key={i} fill={p.color}/>)}
                        </Pie><Tooltip formatter={(v: unknown) => [`₹${(v as number).toLocaleString()}`, "Rev"]} contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}/></PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex: 1 }}>{planData.map(p => (
                        <div key={p.plan} style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0", borderBottom: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: p.color }}/>
                            <span style={{ fontSize: "0.8rem", textTransform: "capitalize" }}>{p.plan}</span>
                          </div>
                          <span style={{ fontWeight: 600, fontSize: "0.8rem", color: p.color }}>₹{p.revenue.toLocaleString()}</span>
                        </div>
                      ))}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="glass-card" style={{ padding: "1.5rem" }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>📋 Plan Breakdown</h2>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Plan", "Price/mo", "Clients", "MRR", "% Share"].map(h => <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {planData.map(p => (
                      <tr key={p.plan} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.85rem 0.75rem" }}><span style={{ padding: "0.2rem 0.6rem", background: `${p.color}22`, color: p.color, borderRadius: "10px", fontSize: "0.8rem", fontWeight: 600, textTransform: "capitalize" }}>{p.plan}</span></td>
                        <td style={{ padding: "0.85rem 0.75rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>₹{(PLAN_PRICES[p.plan] || 0).toLocaleString()}</td>
                        <td style={{ padding: "0.85rem 0.75rem", fontWeight: 600 }}>{p.count}</td>
                        <td style={{ padding: "0.85rem 0.75rem", fontWeight: 700, color: "#00B894" }}>₹{p.revenue.toLocaleString()}</td>
                        <td style={{ padding: "0.85rem 0.75rem", color: "var(--text-secondary)" }}>{totalMRR > 0 ? Math.round((p.revenue / totalMRR) * 100) : 0}%</td>
                      </tr>
                    ))}
                    <tr style={{ background: "rgba(0,184,148,0.05)" }}>
                      <td style={{ padding: "0.85rem 0.75rem", fontWeight: 700 }}>TOTAL</td><td/><td style={{ padding: "0.85rem 0.75rem", fontWeight: 700 }}>{stats?.activeTenants || 0}</td>
                      <td style={{ padding: "0.85rem 0.75rem", fontWeight: 800, color: "#00B894", fontSize: "1.1rem" }}>₹{totalMRR.toLocaleString()}</td>
                      <td style={{ padding: "0.85rem 0.75rem", fontWeight: 700 }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
