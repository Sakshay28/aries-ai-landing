"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ═══════════════════════════════════════
// 🏢 Admin — All Clients
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
  business_email: string | null;
}

const PLAN_PRICES: Record<string, number> = { starter: 999, growth: 2499, pro: 6999, enterprise: 25000 };

function statusColor(s: string) {
  const m: Record<string, string> = { active: "#00B894", trialing: "#6C5CE7", past_due: "#FDCB6E", cancelled: "#E17055", suspended: "#b2bec3" };
  return m[s] || "#b2bec3";
}

export default function AdminClientsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview");
      if (!res.ok) throw new Error(res.status === 403 ? "Admin access required." : `API error: ${res.status}`);
      const data = await res.json();
      if (data.success) setTenants(data.data.tenants || []);
      else throw new Error(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleActive = async (t: AdminTenant) => {
    setActionLoading(t.id);
    try {
      const res = await fetch("/api/admin/overview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: t.id, is_active: !t.is_active }),
      });
      if (!res.ok) throw new Error("Update failed");
      showToast(`${t.business_name} ${t.is_active ? "suspended" : "activated"}`);
      fetchData();
    } catch { showToast("Action failed"); }
    finally { setActionLoading(null); }
  };

  const filtered = tenants.filter(t => {
    const matchSearch = search === "" || t.business_name.toLowerCase().includes(search.toLowerCase()) || (t.business_email || "").toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === "all" || t.plan === planFilter;
    const matchStatus = statusFilter === "all" || t.plan_status === statusFilter || (statusFilter === "suspended" && !t.is_active);
    return matchSearch && matchPlan && matchStatus;
  });

  const sidebarLinks = [
    { icon: "🏠", label: "Overview", href: "/admin" },
    { icon: "🏢", label: "All Clients", href: "/admin/clients", active: true },
    { icon: "💰", label: "Revenue", href: "/admin/revenue" },
    { icon: "📊", label: "Analytics", href: "/admin/analytics" },
    { icon: "⚙️", label: "Platform Settings", href: "/admin/settings" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{ width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Admin Panel</span>
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {sidebarLinks.map(item => (
            <Link key={item.label} href={item.href} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem", color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none", background: item.active ? "rgba(108,92,231,0.1)" : "transparent", borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent", fontSize: "0.9rem", fontWeight: item.active ? 600 : 400 }}>
              <span>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 50, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>🏢 All Clients</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{filtered.length} of {tenants.length} clients</p>
          </div>
          <button onClick={fetchData} style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.85rem" }}>🔄 Refresh</button>
        </header>

        <div style={{ padding: "2rem" }}>
          {/* Toast */}
          {toast && <div style={{ position: "fixed", bottom: "2rem", right: "2rem", background: "#00B894", color: "white", padding: "0.75rem 1.5rem", borderRadius: "10px", fontWeight: 600, zIndex: 999, boxShadow: "0 4px 20px rgba(0,184,148,0.4)" }}>{toast}</div>}

          {/* Filters */}
          <div className="glass-card" style={{ padding: "1.25rem", marginBottom: "1.5rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              id="client-search"
              type="text"
              placeholder="🔍 Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: "200px", padding: "0.5rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "0.9rem" }}
            />
            <select id="plan-filter" value={planFilter} onChange={e => setPlanFilter(e.target.value)} style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "0.9rem" }}>
              <option value="all">All Plans</option>
              {["starter", "growth", "pro", "enterprise"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)} — ₹{PLAN_PRICES[p]?.toLocaleString()}</option>)}
            </select>
            <select id="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "0.9rem" }}>
              {["all", "active", "trialing", "past_due", "cancelled", "suspended"].map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.replace("_", " ")}</option>)}
            </select>
          </div>

          {error && (
            <div style={{ padding: "1rem 1.5rem", background: "rgba(225,112,85,0.1)", border: "1px solid rgba(225,112,85,0.3)", borderRadius: "8px", marginBottom: "1.5rem", color: "#E17055" }}>❌ {error}</div>
          )}

          {/* Table */}
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            {loading && !tenants.length ? (
              <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem" }}>⏳ Loading clients...</p>
            ) : filtered.length === 0 ? (
              <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "3rem" }}>No clients match your filters.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Client", "Email", "Plan", "Status", "Messages", "WA", "MRR", "Joined", "Actions"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(t => (
                      <tr key={t.id} style={{ borderBottom: "1px solid var(--border)", opacity: t.is_active ? 1 : 0.5 }}>
                        <td style={{ padding: "0.85rem 0.75rem" }}>
                          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{t.business_name}</div>
                          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{t.business_type}</div>
                        </td>
                        <td style={{ padding: "0.85rem 0.75rem", color: "var(--text-secondary)", fontSize: "0.8rem" }}>{t.business_email || "—"}</td>
                        <td style={{ padding: "0.85rem 0.75rem" }}>
                          <span style={{ padding: "0.2rem 0.6rem", background: "rgba(108,92,231,0.15)", color: "#6C5CE7", borderRadius: "10px", fontSize: "0.75rem", fontWeight: 600, textTransform: "capitalize" }}>{t.plan}</span>
                        </td>
                        <td style={{ padding: "0.85rem 0.75rem" }}>
                          <span style={{ padding: "0.2rem 0.6rem", borderRadius: "10px", fontSize: "0.75rem", fontWeight: 600, background: `${statusColor(t.is_active ? t.plan_status : "suspended")}22`, color: statusColor(t.is_active ? t.plan_status : "suspended") }}>
                            {t.is_active ? t.plan_status.replace("_", " ") : "suspended"}
                          </span>
                        </td>
                        <td style={{ padding: "0.85rem 0.75rem", fontSize: "0.85rem" }}>
                          <div>{t.messages_used_this_month.toLocaleString()} / {t.message_limit.toLocaleString()}</div>
                          <div style={{ height: "3px", background: "var(--bg-tertiary)", borderRadius: "2px", marginTop: "4px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, Math.round((t.messages_used_this_month / t.message_limit) * 100))}%`, background: "#00B894", borderRadius: "2px" }} />
                          </div>
                        </td>
                        <td style={{ padding: "0.85rem 0.75rem", fontSize: "0.85rem", color: t.wa_phone_number_id ? "#00B894" : "#E17055" }}>{t.wa_phone_number_id ? "✅" : "❌"}</td>
                        <td style={{ padding: "0.85rem 0.75rem", fontWeight: 600, color: "#00B894", fontSize: "0.85rem" }}>₹{(PLAN_PRICES[t.plan] || 0).toLocaleString()}</td>
                        <td style={{ padding: "0.85rem 0.75rem", color: "var(--text-muted)", fontSize: "0.8rem", whiteSpace: "nowrap" }}>{new Date(t.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: "0.85rem 0.75rem" }}>
                          <button
                            id={`toggle-${t.id}`}
                            onClick={() => toggleActive(t)}
                            disabled={actionLoading === t.id}
                            style={{ padding: "0.35rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border)", background: t.is_active ? "rgba(225,112,85,0.1)" : "rgba(0,184,148,0.1)", color: t.is_active ? "#E17055" : "#00B894", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap" }}
                          >
                            {actionLoading === t.id ? "..." : t.is_active ? "Suspend" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    ))}
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
