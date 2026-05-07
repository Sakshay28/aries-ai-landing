"use client";

import { useState, useEffect, useCallback } from "react";
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

const COLORS = ["#25D366", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#10b981"];

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
      if (data.success) setStats(data.data);
      else throw new Error(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void (async () => { await fetchData(); })(); }, [fetchData]);

  if (loading && !stats) {
    return <div style={{ padding: "48px", textAlign: "center", color: "#9ca3af" }}>⏳ Loading Analytics...</div>;
  }

  const dailyLeadsData = (stats?.dailyLeads || []).map(d => ({
    name: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    leads: d.count
  }));

  const statusData = (stats?.leadsByStatus || []).map((s, i) => ({
    name: s.status.toUpperCase(),
    value: s.count,
    color: COLORS[i % COLORS.length]
  }));

  const channelData = (stats?.leadsByChannel || []).map((c, i) => ({
    name: c.channel,
    value: c.count,
    color: COLORS[(i + 2) % COLORS.length]
  }));

  const tooltipStyle = { background: "white", border: "1px solid #e5e7eb", borderRadius: "10px", color: "#111827", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" };

  return (
    <>
      {error && <div style={{ color: "#dc2626", background: "#fef2f2", padding: "12px 16px", borderRadius: "10px", border: "1px solid #fca5a5", marginBottom: "20px" }}>❌ {error}</div>}

      {/* Key Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {[
          { label: "Conversion Rate", value: stats?.conversionRate || "0%", color: "#25D366", bg: "#f0fdf4" },
          { label: "Peak Engagement", value: stats?.peakHour || "N/A", color: "#3b82f6", bg: "#eff6ff" },
          { label: "Active Conversations", value: String(stats?.activeConversations || 0), color: "#f59e0b", bg: "#fffbeb" },
        ].map(m => (
          <div key={m.label} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "24px", borderTop: `3px solid ${m.color}` }}>
            <p style={{ color: "#9ca3af", fontSize: "13px", marginBottom: "8px", fontWeight: 500 }}>{m.label}</p>
            <p style={{ fontSize: "28px", fontWeight: 800, color: m.color, letterSpacing: "-0.5px" }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "20px", marginBottom: "24px" }}>
        {/* Daily Leads Trend */}
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "24px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "20px" }}>Daily Lead Volume (Last 7 Days)</h2>
          <div style={{ height: "300px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyLeadsData}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#25D366" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#25D366" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#25D366", fontWeight: 700 }} />
                <Area type="monotone" dataKey="leads" stroke="#25D366" strokeWidth={3} fillOpacity={1} fill="url(#colorLeads)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Leads by Status */}
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "24px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "20px" }}>Lead Status Breakdown</h2>
          {statusData.length > 0 ? (
            <>
              <div style={{ height: "250px", width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} innerRadius={60} outerRadius={95} paddingAngle={5} dataKey="value">
                      {statusData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center", marginTop: "12px" }}>
                {statusData.map((entry, index) => (
                  <div key={index} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#6b7280" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: entry.color }} />
                    {entry.name} ({entry.value})
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: "250px", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>No lead data available yet</div>
          )}
        </div>
      </div>

      {/* Lead Sources */}
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "24px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "20px" }}>Lead Sources (Channels)</h2>
        {channelData.length > 0 ? (
          <div style={{ height: "250px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData} layout="vertical" margin={{ top: 0, right: 0, left: 20, bottom: 0 }}>
                <XAxis type="number" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis dataKey="name" type="category" stroke="#111827" fontSize={12} tickLine={false} axisLine={false} width={80} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(0,0,0,0.02)" }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={30}>
                  {channelData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ height: "250px", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>No channel data available yet</div>
        )}
      </div>
    </>
  );
}
