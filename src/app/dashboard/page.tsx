"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Stats {
  totalLeads: number;
  newLeadsToday: number;
  activeConversations: number;
  confirmedBookings: number;
  conversionRate: string;
  messagesThisMonth: number;
  messageLimit: number;
  leadsByStatus: { status: string; count: number }[];
  dailyLeads: { date: string; count: number }[];
}

function SetupChecklist({ stats }: { stats: Stats | null }) {
  const steps = [
    { label: "Connect WhatsApp Business Account", done: false, href: "/dashboard/whatsapp" },
    { label: "Configure your AI Bot", done: false, href: "/dashboard/settings" },
    { label: "Create a message template", done: false, href: "/dashboard/templates" },
    { label: "Receive your first lead", done: (stats?.totalLeads ?? 0) > 0, href: "/dashboard/leads" },
    { label: "Send your first broadcast", done: false, href: "/dashboard/broadcast" },
  ];
  const done = steps.filter(s => s.done).length;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Setup WhatsApp Automation</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{steps.length - done} steps remaining</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 100, height: 5, background: "#f3f4f6", borderRadius: 100, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#25D366", borderRadius: 100, transition: "width 0.5s" }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#25D366", minWidth: 30 }}>{pct}%</span>
        </div>
      </div>
      {steps.map((s, i) => (
        <Link key={i} href={s.href} style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "13px 20px", textDecoration: "none", color: "inherit",
          borderBottom: i < steps.length - 1 ? "1px solid #f9fafb" : "none",
          background: "white", transition: "background 150ms",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "#fafbfc"}
          onMouseLeave={e => e.currentTarget.style.background = "white"}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
            border: `2px solid ${s.done ? "#25D366" : "#d1d5db"}`,
            background: s.done ? "#25D366" : "white",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {s.done
              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#d1d5db" }} />
            }
          </div>
          <span style={{ fontSize: 14, color: s.done ? "#9ca3af" : "#374151", fontWeight: s.done ? 400 : 500, flex: 1, textDecoration: s.done ? "line-through" : "none" }}>{s.label}</span>
          {!s.done && <span style={{ fontSize: 12, color: "#25D366", fontWeight: 700 }}>Start →</span>}
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      const d = await res.json();
      if (d.success) setStats(d.data);
      else setError(d.error);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 30000); return () => clearInterval(t); }, [fetchData]);

  const usagePct = stats ? Math.min(100, Math.round((stats.messagesThisMonth / stats.messageLimit) * 100)) : 0;
  const statusColors: Record<string, { color: string; bg: string }> = {
    new: { color: "#7c3aed", bg: "#ede9fe" }, hot: { color: "#ea580c", bg: "#fff7ed" },
    warm: { color: "#d97706", bg: "#fffbeb" }, cold: { color: "#6b7280", bg: "#f3f4f6" },
    converted: { color: "#16a34a", bg: "#f0fdf4" }, lost: { color: "#dc2626", bg: "#fef2f2" },
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 288px", gap: 20, alignItems: "start" }}>
      {/* Left column */}
      <div>
        {/* Trial banner */}
        <div style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", border: "1px solid #86efac", borderRadius: 14, padding: "16px 22px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#166534" }}>Unlock Everything for 14 Days — Free!</div>
            <div style={{ fontSize: 12, color: "#16a34a", marginTop: 3 }}>Access all Pro features. No credit card required.</div>
          </div>
          <Link href="/dashboard/billing" style={{ background: "#25D366", color: "white", padding: "10px 22px", borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0, boxShadow: "0 4px 12px rgba(37,211,102,0.3)" }}>
            Start Free Trial →
          </Link>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Total Leads", value: stats?.totalLeads, sub: `+${stats?.newLeadsToday ?? 0} today`, accent: "#25D366" },
            { label: "Live Conversations", value: stats?.activeConversations, sub: "Active now", accent: "#3b82f6" },
            { label: "Messages Used", value: stats?.messagesThisMonth, sub: `${usagePct}% of limit`, accent: "#8b5cf6" },
            { label: "Confirmed Bookings", value: stats?.confirmedBookings, sub: stats?.conversionRate ? `${stats.conversionRate} rate` : "This month", accent: "#f59e0b" },
          ].map(s => (
            <div key={s.label} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: "18px 16px", borderTop: `3px solid ${s.accent}` }}>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", color: "#111827", marginBottom: 6 }}>
                {loading ? "—" : (s.value ?? 0).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>{s.label}</div>
              <div style={{ fontSize: 11, color: s.accent, fontWeight: 600, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Setup checklist */}
        <SetupChecklist stats={stats} />

        {/* Quick Actions */}
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", fontSize: 15, fontWeight: 700 }}>Quick Actions</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {[
              { label: "Send Broadcast", desc: "Message all your leads at once", href: "/dashboard/broadcast", accent: "#25D366" },
              { label: "Create Template", desc: "Submit a new WhatsApp template", href: "/dashboard/templates", accent: "#3b82f6" },
              { label: "Configure AI Bot", desc: "Set personality, FAQs, hours", href: "/dashboard/settings", accent: "#8b5cf6" },
              { label: "View Analytics", desc: "Track leads and conversions", href: "/dashboard/analytics", accent: "#f59e0b" },
            ].map((a, i) => (
              <Link key={a.label} href={a.href} style={{
                display: "flex", flexDirection: "column", gap: 4, padding: "18px 20px",
                textDecoration: "none", color: "inherit",
                borderRight: i % 2 === 0 ? "1px solid #f3f4f6" : "none",
                borderBottom: i < 2 ? "1px solid #f3f4f6" : "none",
                background: "white", transition: "background 150ms",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "#fafbfc"}
                onMouseLeave={e => e.currentTarget.style.background = "white"}>
                <div style={{ width: 3, height: 3, borderRadius: "50%", background: a.accent }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{a.label}</div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>{a.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Credits */}
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 14 }}>Message Credits</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: "#111827" }}>{(stats?.messagesThisMonth ?? 0).toLocaleString()}</span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>/ {(stats?.messageLimit ?? 1000).toLocaleString()}</span>
          </div>
          <div style={{ height: 6, background: "#f3f4f6", borderRadius: 100, marginBottom: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${usagePct}%`, background: usagePct > 80 ? "linear-gradient(90deg,#f59e0b,#ef4444)" : "#25D366", borderRadius: 100, transition: "width 0.5s" }} />
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 16 }}>Used this month — {usagePct}%</div>
          <Link href="/dashboard/billing" style={{ display: "block", textAlign: "center", background: "#25D366", color: "white", padding: "10px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
            Upgrade Plan
          </Link>
        </div>

        {/* Lead Pipeline */}
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 14 }}>Lead Pipeline</div>
          {stats && stats.leadsByStatus.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stats.leadsByStatus.map(({ status, count }) => {
                const c = statusColors[status] || { color: "#6b7280", bg: "#f3f4f6" };
                return (
                  <div key={status} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 100, fontSize: 11, fontWeight: 700, textTransform: "capitalize", background: c.bg, color: c.color }}>{status}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "16px 0" }}>No leads yet</div>
          )}
        </div>

        {/* Daily trend */}
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 14 }}>Leads — Last 7 Days</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 56 }}>
            {(stats?.dailyLeads ?? Array(7).fill({ count: 0 })).map((d: { count: number }, i: number) => {
              const max = Math.max(...(stats?.dailyLeads ?? []).map((x: { count: number }) => x.count), 1);
              const h = Math.max((d.count / max) * 56, 4);
              return (
                <div key={i} title={`${d.count} leads`} style={{ flex: 1, height: h, background: "#25D366", borderRadius: "4px 4px 0 0", opacity: i === 6 ? 1 : 0.5 + (i / 12), transition: "all 0.5s" }} />
              );
            })}
          </div>
        </div>

        {/* Conversion rate */}
        {error && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, fontSize: 13, color: "#dc2626" }}>
            {error} <button onClick={fetchData} style={{ background: "none", border: "none", color: "#dc2626", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Retry</button>
          </div>
        )}
      </div>
    </div>
  );
}
