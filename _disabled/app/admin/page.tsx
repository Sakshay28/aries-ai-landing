"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ═══════════════════════════════════════
// 🛡️ Admin Panel — Platform Overview
// ═══════════════════════════════════════
// Now fetches REAL data from /api/admin/overview.
// No more mock tenants — all Supabase-backed.
// ═══════════════════════════════════════

interface AdminTenant {
  id: string;
  business_name: string;
  business_type: string;
  plan: string;
  plan_status: string;
  messages_used_this_month: number;
  message_limit: number;
  is_active: boolean;
  created_at: string;
  wa_phone_number_id: string | null;
}

interface AdminStats {
  totalTenants: number;
  activeTenants: number;
  totalLeads: number;
  totalMessages: number;
  mrr: number;
  tenantsByPlan: { plan: string; count: number }[];
}

function getStatusFromTenant(t: AdminTenant): string {
  if (!t.is_active) return "suspended";
  if (t.plan_status === "trialing") return "trial";
  if (t.plan_status === "cancelled") return "churned";
  if (t.plan_status === "active") return "active";
  return t.plan_status;
}

function getStatusStyle(s: string) {
  const m: Record<string, { bg: string; color: string }> = {
    active: { bg: "#00B89422", color: "#00B894" },
    trial: { bg: "#6C5CE722", color: "#6C5CE7" },
    trialing: { bg: "#6C5CE722", color: "#6C5CE7" },
    churned: { bg: "#E1705522", color: "#E17055" },
    cancelled: { bg: "#E1705522", color: "#E17055" },
    suspended: { bg: "#FDCB6E22", color: "#FDCB6E" },
    past_due: { bg: "#FDCB6E22", color: "#FDCB6E" },
  };
  return m[s] || m.active;
}

function getHealthScore(t: AdminTenant): number {
  let score = 0;
  if (t.is_active) score += 30;
  if (t.wa_phone_number_id) score += 30;
  if (t.messages_used_this_month > 0) score += 20;
  if (t.plan_status === "active") score += 20;
  return score;
}

function getHealthColor(score: number) {
  if (score >= 80) return "#00B894";
  if (score >= 50) return "#FDCB6E";
  return "#E17055";
}

export default function AdminDashboardPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview");
      if (!res.ok) {
        if (res.status === 403) throw new Error("Admin access required. You must be a platform admin.");
        throw new Error(`API error: ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setStats(data.data.stats);
        setTenants(data.data.tenants || []);
      } else {
        throw new Error(data.error || "Failed to load admin data");
      }
    } catch (err) {
      console.error("Admin fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => { await fetchData(); })();
  }, [fetchData]);

  const totalMRR = stats?.mrr || 0;
  const activeCount = stats?.activeTenants || 0;
  const trialCount = tenants.filter(t => t.plan_status === "trialing").length;
  const totalMessages = stats?.totalMessages || 0;
  const totalLeads = stats?.totalLeads || 0;

  const filtered = filter === "all"
    ? tenants
    : tenants.filter(t => getStatusFromTenant(t) === filter);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <aside style={{
        width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)",
        padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
      }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Admin Panel</span>
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "🏠", label: "Overview", href: "/admin", active: true },
            { icon: "🏢", label: "All Clients", href: "/admin/clients" },
            { icon: "💰", label: "Revenue", href: "/admin/revenue" },
            { icon: "📊", label: "Analytics", href: "/admin/analytics" },
            { icon: "⚙️", label: "Platform Settings", href: "/admin/settings" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 50, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>🛡️ Platform Admin</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Overview of all clients and platform health.</p>
          </div>
          <button onClick={fetchData} style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.85rem" }}>🔄 Refresh</button>
        </header>

        <div style={{ padding: "2rem" }}>
          {/* Error */}
          {error && (
            <div style={{ padding: "1rem 1.5rem", background: "rgba(225, 112, 85, 0.1)", border: "1px solid rgba(225, 112, 85, 0.3)", borderRadius: "8px", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#E17055", fontSize: "0.9rem" }}>❌ {error}</span>
              <button onClick={fetchData} style={{ padding: "0.4rem 1rem", background: "#E17055", border: "none", borderRadius: "6px", color: "white", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>Retry</button>
            </div>
          )}

          {/* Loading */}
          {loading && !stats && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--text-muted)" }}>
              <span style={{ fontSize: "1.5rem", marginRight: "0.5rem" }}>⏳</span> Loading admin data...
            </div>
          )}

          {/* Stats Grid */}
          {stats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
              {[
                { icon: "💰", label: "Monthly Revenue", value: `₹${(totalMRR).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`, color: "#00B894" },
                { icon: "🏢", label: "Active Clients", value: activeCount, color: "#6C5CE7" },
                { icon: "🆓", label: "On Trial", value: trialCount, color: "#FDCB6E" },
                { icon: "📩", label: "Total Messages", value: totalMessages.toLocaleString(), color: "#00CEC9" },
                { icon: "👥", label: "Total Leads", value: totalLeads.toLocaleString(), color: "#A29BFE" },
              ].map((s) => (
                <div key={s.label} className="glass-card" style={{ padding: "1.25rem", borderTop: `3px solid ${s.color}` }}>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>{s.icon} {s.label}</p>
                  <p style={{ fontSize: "1.75rem", fontWeight: 800, color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Client Table */}
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>All Clients ({filtered.length})</h2>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {["all", "active", "trial", "churned"].map((f) => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: "0.4rem 1rem", border: "1px solid var(--border)", borderRadius: "6px",
                    background: filter === f ? "var(--primary)" : "transparent",
                    color: filter === f ? "white" : "var(--text-secondary)",
                    cursor: "pointer", fontSize: "0.8rem", textTransform: "capitalize",
                  }}>{f}</button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>
                {loading ? "Loading..." : "No clients found. They'll appear here after sign-up."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Client", "Plan", "Status", "Messages", "WA Connected", "Health", "Since"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => {
                      const status = getStatusFromTenant(t);
                      const st = getStatusStyle(status);
                      const health = getHealthScore(t);
                      return (
                        <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.75rem" }}>
                            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{t.business_name}</div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{t.business_type}</div>
                          </td>
                          <td style={{ padding: "0.75rem", color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "capitalize" }}>{t.plan}</td>
                          <td style={{ padding: "0.75rem" }}>
                            <span style={{ padding: "0.2rem 0.6rem", borderRadius: "10px", fontSize: "0.75rem", fontWeight: 600, background: st.bg, color: st.color }}>{status}</span>
                          </td>
                          <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>
                            {t.messages_used_this_month.toLocaleString()} / {t.message_limit.toLocaleString()}
                          </td>
                          <td style={{ padding: "0.75rem" }}>
                            <span style={{ color: t.wa_phone_number_id ? "#00B894" : "#E17055", fontSize: "0.85rem" }}>
                              {t.wa_phone_number_id ? "✅ Yes" : "❌ No"}
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <div style={{ width: "40px", height: "6px", background: "var(--bg-tertiary)", borderRadius: "3px", overflow: "hidden" }}>
                                <div style={{ width: `${health}%`, height: "100%", background: getHealthColor(health), borderRadius: "3px" }} />
                              </div>
                              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: getHealthColor(health) }}>{health}</span>
                            </div>
                          </td>
                          <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                            {new Date(t.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
