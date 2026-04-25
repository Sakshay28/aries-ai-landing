"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ═══════════════════════════════════════
// 📊 Client Dashboard — Stats & Overview
// ═══════════════════════════════════════
// Now fetches REAL data from API endpoints.
// No more mock data — all Supabase-backed.
// ═══════════════════════════════════════

interface DashboardStats {
  totalLeads: number;
  newLeadsToday: number;
  activeConversations: number;
  confirmedBookings: number;
  conversionRate: string;
  messagesThisMonth: number;
  messageLimit: number;
  topChannel: string;
  peakHour: string;
  leadsByStatus: { status: string; count: number }[];
  leadsByChannel: { channel: string; count: number }[];
  dailyLeads: { date: string; count: number }[];
}

interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  lead_status: string;
  lead_score: number;
  channel: string;
  enquiry_type: string | null;
  last_message_at: string;
  created_at: string;
}

interface Conversation {
  id: string;
  sender_name: string | null;
  sender_id: string;
  current_step: string;
  is_active: boolean;
  escalated: boolean;
  last_message_at: string;
  channel: string;
  message_count: number;
}

function StatCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="glass-card" style={{ padding: "1.5rem", borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>{label}</p>
          <p style={{ fontSize: "2rem", fontWeight: 800, color }}>{value}</p>
          {sub && <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem" }}>{sub}</p>}
        </div>
        <span style={{ fontSize: "2rem" }}>{icon}</span>
      </div>
    </div>
  );
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    new: "#6C5CE7", hot: "#E17055", warm: "#FDCB6E", cold: "#636E72", converted: "#00CEC9", lost: "#E17055",
    active: "#00B894", resolved: "#636E72", escalated: "#E17055",
  };
  return colors[status] || "#636E72";
}

function getScoreColor(score: number) {
  if (score >= 80) return "#00B894";
  if (score >= 50) return "#FDCB6E";
  return "#E17055";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function LoadingPulse() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--text-muted)" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span style={{ animation: "pulse 1.5s infinite", fontSize: "1.5rem" }}>⏳</span>
        <span>Loading data...</span>
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ padding: "1rem 1.5rem", background: "rgba(225, 112, 85, 0.1)", border: "1px solid rgba(225, 112, 85, 0.3)", borderRadius: "8px", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "#E17055", fontSize: "0.9rem" }}>❌ {message}</span>
      <button onClick={onRetry} style={{ padding: "0.4rem 1rem", background: "#E17055", border: "none", borderRadius: "6px", color: "white", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>Retry</button>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "leads" | "conversations">("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadFilter, setLeadFilter] = useState("all");

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, leadsRes, convsRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/dashboard/leads?limit=50"),
        fetch("/api/dashboard/conversations?limit=20"),
      ]);

      if (!statsRes.ok) throw new Error(`Stats API error: ${statsRes.status}`);
      if (!leadsRes.ok) throw new Error(`Leads API error: ${leadsRes.status}`);

      const statsData = await statsRes.json();
      const leadsData = await leadsRes.json();

      if (statsData.success) setStats(statsData.data);
      else throw new Error(statsData.error || "Failed to fetch stats");

      if (leadsData.success) setLeads(leadsData.data || []);
      else throw new Error(leadsData.error || "Failed to fetch leads");

      // Conversations endpoint might not exist yet — handle gracefully
      if (convsRes.ok) {
        const convsData = await convsRes.json();
        if (convsData.success) setConversations(convsData.data || []);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const usagePercent = stats ? Math.round((stats.messagesThisMonth / stats.messageLimit) * 100) : 0;

  const filteredLeads = leadFilter === "all"
    ? leads
    : leads.filter((l) => l.lead_status === leadFilter);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? "260px" : "70px",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
        padding: "1.5rem 0",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.3s ease",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 100,
      }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {sidebarOpen && (
            <Link href="/" style={{ textDecoration: "none" }}>
              <img src="/logo.png" alt="Aries AI" style={{ height: "36px" }} />
            </Link>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.25rem" }}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard", active: true },
            { icon: "👥", label: "Leads", href: "/dashboard/leads", active: false },
            { icon: "💬", label: "Conversations", href: "/dashboard/conversations", active: false },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast", active: false },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings", active: false },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp", active: false },
            { icon: "📈", label: "Analytics", href: "/dashboard/analytics", active: false },
            { icon: "💳", label: "Billing", href: "/dashboard/billing", active: false },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)",
              textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem",
              fontWeight: item.active ? 600 : 400,
              transition: "all 0.2s ease",
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {sidebarOpen && stats && (
          <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--border)" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.5rem" }}>Messages: {stats.messagesThisMonth.toLocaleString()} / {stats.messageLimit.toLocaleString()}</p>
            <div style={{ width: "100%", height: "6px", background: "var(--bg-tertiary)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${usagePercent}%`, height: "100%", background: usagePercent > 80 ? "#E17055" : "var(--gradient-primary)", borderRadius: "3px", transition: "width 0.5s ease" }} />
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, marginLeft: sidebarOpen ? "260px" : "70px", transition: "margin-left 0.3s ease" }}>
        {/* Top Header */}
        <header style={{
          padding: "1rem 2rem",
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>Dashboard</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Welcome back! Here&apos;s your business overview.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button onClick={fetchDashboardData} style={{
              padding: "0.5rem 1rem",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}>
              🔄 Refresh
            </button>
            <div style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: "var(--gradient-primary)", display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: "0.85rem", color: "white",
            }}>S</div>
          </div>
        </header>

        {stats && (
          <div style={{ padding: "0 2rem", marginTop: "1.5rem" }}>
            {usagePercent >= 100 ? (
              <div style={{ background: "rgba(225, 112, 85, 0.1)", border: "1px solid #E17055", padding: "1rem 1.5rem", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ color: "#E17055", margin: 0, fontSize: "1rem" }}>⚠️ Message Limit Reached</h3>
                  <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0", fontSize: "0.85rem" }}>You have used {stats.messagesThisMonth} of your {stats.messageLimit} monthly messages. Your bot is currently paused.</p>
                </div>
                <Link href="/dashboard/billing" style={{ padding: "0.5rem 1rem", background: "#E17055", color: "white", textDecoration: "none", borderRadius: "6px", fontWeight: 600, fontSize: "0.85rem" }}>Upgrade Plan</Link>
              </div>
            ) : usagePercent >= 80 ? (
              <div style={{ background: "rgba(253, 203, 110, 0.1)", border: "1px solid #FDCB6E", padding: "1rem 1.5rem", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ color: "#FDCB6E", margin: 0, fontSize: "1rem" }}>⚠️ Approaching Limit</h3>
                  <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0", fontSize: "0.85rem" }}>You have used {usagePercent}% of your monthly AI messages ({stats.messagesThisMonth} / {stats.messageLimit}).</p>
                </div>
                <Link href="/dashboard/billing" style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", color: "var(--text-primary)", textDecoration: "none", borderRadius: "6px", fontWeight: 600, fontSize: "0.85rem", border: "1px solid var(--border)" }}>View Upgrade Options</Link>
              </div>
            ) : null}
          </div>
        )}

        <div style={{ padding: "2rem" }}>
          {/* Error Banner */}
          {error && <ErrorBanner message={error} onRetry={fetchDashboardData} />}

          {/* Tab Switcher */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem" }}>
            {(["overview", "leads", "conversations"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: "0.6rem 1.5rem",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                background: activeTab === tab ? "var(--primary)" : "transparent",
                color: activeTab === tab ? "white" : "var(--text-secondary)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.85rem",
                textTransform: "capitalize",
                transition: "all 0.2s ease",
              }}>{tab}</button>
            ))}
          </div>

          {/* Loading State */}
          {loading && !stats && <LoadingPulse />}

          {/* Overview Tab */}
          {activeTab === "overview" && stats && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
                <StatCard icon="👥" label="Total Leads" value={stats.totalLeads} sub={`${stats.newLeadsToday} new today`} color="#6C5CE7" />
                <StatCard icon="💬" label="Active Conversations" value={stats.activeConversations} sub="Currently active" color="#00B894" />
                <StatCard icon="📩" label="Messages This Month" value={stats.messagesThisMonth.toLocaleString()} sub={`${usagePercent}% of limit used`} color="#00CEC9" />
                <StatCard icon="📅" label="Bookings" value={stats.confirmedBookings} sub={`${stats.conversionRate} conversion`} color="#FDCB6E" />
                <StatCard icon="📡" label="Top Channel" value={stats.topChannel} sub="Most leads from" color="#A29BFE" />
                <StatCard icon="📊" label="Leads by Status" value={stats.leadsByStatus.length} sub="Categories tracked" color="#FD79A8" />
              </div>

              {/* Recent Leads */}
              <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Recent Leads</h2>
                  <button onClick={() => setActiveTab("leads")} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}>View All →</button>
                </div>
                {leads.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>No leads yet. Leads will appear here when customers message your WhatsApp.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["Name", "Status", "Score", "Channel", "Activity"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leads.slice(0, 5).map((lead) => (
                          <tr key={lead.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.75rem" }}>
                              <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{lead.name || "Unknown"}</div>
                              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{lead.phone}</div>
                            </td>
                            <td style={{ padding: "0.75rem" }}>
                              <span style={{ padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: `${getStatusColor(lead.lead_status)}22`, color: getStatusColor(lead.lead_status) }}>{lead.lead_status}</span>
                            </td>
                            <td style={{ padding: "0.75rem" }}>
                              <span style={{ fontWeight: 700, color: getScoreColor(lead.lead_score) }}>{lead.lead_score}</span>
                            </td>
                            <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{lead.channel}</td>
                            <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>{timeAgo(lead.last_message_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Leads by Status Breakdown */}
              {stats.leadsByStatus.length > 0 && (
                <div className="glass-card" style={{ padding: "1.5rem" }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>Lead Status Breakdown</h2>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    {stats.leadsByStatus.map(({ status, count }) => (
                      <div key={status} style={{ padding: "0.75rem 1.25rem", background: `${getStatusColor(status)}15`, borderRadius: "8px", border: `1px solid ${getStatusColor(status)}33` }}>
                        <span style={{ color: getStatusColor(status), fontWeight: 700, fontSize: "1.2rem" }}>{count}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "0.5rem", textTransform: "capitalize" }}>{status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Leads Tab */}
          {activeTab === "leads" && (
            <div className="glass-card" style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>All Leads ({filteredLeads.length})</h2>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {["all", "new", "hot", "warm", "converted"].map((f) => (
                    <button key={f} onClick={() => setLeadFilter(f)} style={{ padding: "0.4rem 1rem", border: "1px solid var(--border)", borderRadius: "6px", background: leadFilter === f ? "var(--primary)" : "transparent", color: leadFilter === f ? "white" : "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem", textTransform: "capitalize" }}>{f}</button>
                  ))}
                </div>
              </div>
              {filteredLeads.length === 0 ? (
                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>No leads found for this filter.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Name", "Status", "Score", "Channel", "Type", "Activity"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }} onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(108, 92, 231, 0.05)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                        <td style={{ padding: "0.75rem" }}>
                          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{lead.name || "Unknown"}</div>
                          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{lead.phone}</div>
                        </td>
                        <td style={{ padding: "0.75rem" }}>
                          <span style={{ padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: `${getStatusColor(lead.lead_status)}22`, color: getStatusColor(lead.lead_status) }}>{lead.lead_status}</span>
                        </td>
                        <td style={{ padding: "0.75rem" }}><span style={{ fontWeight: 700, color: getScoreColor(lead.lead_score) }}>{lead.lead_score}</span></td>
                        <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{lead.channel}</td>
                        <td style={{ padding: "0.75rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>{lead.enquiry_type || "—"}</td>
                        <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>{timeAgo(lead.last_message_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Conversations Tab */}
          {activeTab === "conversations" && (
            <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "1rem", height: "calc(100vh - 220px)" }}>
              {/* Conversation List */}
              <div className="glass-card" style={{ padding: "0", overflow: "hidden" }}>
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                  <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Conversations</h2>
                  <input type="text" placeholder="Search conversations..." style={{ width: "100%", padding: "0.5rem 0.75rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-primary)", fontSize: "0.85rem" }} />
                </div>
                <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 320px)" }}>
                  {conversations.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem", fontSize: "0.85rem" }}>No active conversations.</p>
                  ) : (
                    conversations.map((conv, i) => (
                      <div key={conv.id} style={{
                        padding: "1rem 1.25rem",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        background: i === 0 ? "rgba(108, 92, 231, 0.08)" : "transparent",
                        borderLeft: i === 0 ? "3px solid var(--primary)" : "3px solid transparent",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{conv.sender_name || conv.sender_id}</span>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{timeAgo(conv.last_message_at)}</span>
                        </div>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Step: {conv.current_step} · {conv.message_count} msgs</p>
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                          <span style={{ fontSize: "0.7rem", padding: "0.1rem 0.5rem", borderRadius: "4px", background: conv.is_active ? "#00B89422" : "#636E7222", color: conv.is_active ? "#00B894" : "#636E72" }}>{conv.is_active ? "active" : "closed"}</span>
                          {conv.escalated && <span style={{ fontSize: "0.7rem", padding: "0.1rem 0.5rem", borderRadius: "4px", background: "#E1705522", color: "#E17055" }}>escalated</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chat View Placeholder */}
              <div className="glass-card" style={{ padding: "0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>💬 Select a conversation to view messages</p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.5rem" }}>Messages are handled by the AI bot in real-time</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
