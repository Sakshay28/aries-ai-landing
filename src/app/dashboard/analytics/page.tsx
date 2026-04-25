"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell 
} from "recharts";

// ═══════════════════════════════════════
// 📈 Analytics Dashboard
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

const COLORS = ["#6C5CE7", "#00B894", "#FDCB6E", "#E17055", "#00CEC9", "#A29BFE"];

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !stats) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", color: "var(--text-muted)" }}>
        <span style={{ fontSize: "1.5rem", marginRight: "10px", animation: "pulse 1.5s infinite" }}>⏳</span> Loading Analytics...
      </div>
    );
  }

  // Format Daily Leads Data
  const dailyLeadsData = (stats?.dailyLeads || []).map(d => ({
    name: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    leads: d.count
  })).reverse(); // Oldest to newest if they came in newest to oldest? Wait, stats API created them ascending implicitly by how we looped it. Actually let's assume they are correct. Wait, API loops from i=6 to 0, which is oldest to newest. Good.

  // Format Leads by Status
  const statusData = (stats?.leadsByStatus || []).map((s, i) => ({
    name: s.status.toUpperCase(),
    value: s.count,
    color: COLORS[i % COLORS.length]
  }));

  // Format Leads by Channel
  const channelData = (stats?.leadsByChannel || []).map((c, i) => ({
    name: c.channel,
    value: c.count,
    color: COLORS[(i + 2) % COLORS.length] // offset colors
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{
        width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)",
        padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
      }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <img src="/logo.png" alt="Aries AI" style={{ height: "36px" }} />
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📈", label: "Analytics", href: "/dashboard/analytics", active: true },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 50 }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>📈 Analytics</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Monitor your lead generation and engagement trends.</p>
          </div>
          <button onClick={fetchData} style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.85rem" }}>
            🔄 Refresh Data
          </button>
        </header>

        <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
          {error && <div style={{ color: "#E17055", background: "rgba(225,112,85,0.1)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(225,112,85,0.3)" }}>❌ {error}</div>}

          {/* Top Key Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
            <div className="glass-card" style={{ padding: "1.5rem", borderTop: "3px solid #6C5CE7" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>Conversion Rate</p>
              <p style={{ fontSize: "2rem", fontWeight: 800, color: "#6C5CE7" }}>{stats?.conversionRate || "0%"}</p>
            </div>
            <div className="glass-card" style={{ padding: "1.5rem", borderTop: "3px solid #00B894" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>Peak Engagement Hour</p>
              <p style={{ fontSize: "2rem", fontWeight: 800, color: "#00B894" }}>{stats?.peakHour || "N/A"}</p>
            </div>
            <div className="glass-card" style={{ padding: "1.5rem", borderTop: "3px solid #FDCB6E" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>Active Conversations</p>
              <p style={{ fontSize: "2rem", fontWeight: 800, color: "#FDCB6E" }}>{stats?.activeConversations || 0}</p>
            </div>
          </div>

          {/* Main Charts Area */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "2rem" }}>
            
            {/* Daily Leads Trend */}
            <div className="glass-card" style={{ padding: "2rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>Daily Lead Volume (Last 7 Days)</h2>
              <div style={{ height: "300px", width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyLeadsData}>
                    <defs>
                      <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6C5CE7" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#6C5CE7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}
                      itemStyle={{ color: "#6C5CE7", fontWeight: 700 }}
                    />
                    <Area type="monotone" dataKey="leads" stroke="#6C5CE7" strokeWidth={3} fillOpacity={1} fill="url(#colorLeads)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Leads by Status */}
            <div className="glass-card" style={{ padding: "2rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>Lead Status Breakdown</h2>
              {statusData.length > 0 ? (
                <div style={{ height: "300px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Legend */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center", marginTop: "1rem" }}>
                    {statusData.map((entry, index) => (
                      <div key={index} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: entry.color }} />
                        {entry.name} ({entry.value})
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ height: "300px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                  No lead data available yet
                </div>
              )}
            </div>

          </div>

          {/* Bottom Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
            
            {/* Lead Sources / Channels */}
            <div className="glass-card" style={{ padding: "2rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>Lead Sources (Channels)</h2>
              {channelData.length > 0 ? (
                <div style={{ height: "250px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelData} layout="vertical" margin={{ top: 0, right: 0, left: 20, bottom: 0 }}>
                      <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" stroke="var(--text-primary)" fontSize={12} tickLine={false} axisLine={false} width={80} />
                      <Tooltip 
                        contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                        {channelData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height: "250px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                  No channel data available yet
                </div>
              )}
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
