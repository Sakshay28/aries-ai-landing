"use client";

// ═══════════════════════════════════════════════════════════
// 🏠 Aries AI Dashboard — Production Premium Home
// ═══════════════════════════════════════════════════════════
// Mirrors LeadLogic reference: 3 KPIs, donut + success-rate
// area chart, client activity + premium CTA, right-rail All
// Tasks panel with progress bars and avatar stacks.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

// ─── Tokens ────────────────────────────────
const LIME = "#C6F955";
const LIME_DARK = "#1f2937";
const PURPLE = "#7C3AED";
const PURPLE_LIGHT = "#A78BFA";
const PURPLE_TINT = "#EDE9FE";

const INK = "#0a0a0a";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const LINE = "#ececec";
const SOFT = "#f4f4f5";
const SURFACE = "#ffffff";

// ─── Utility ───────────────────────────────
const card: React.CSSProperties = {
  background: SURFACE,
  border: `1px solid ${LINE}`,
  borderRadius: 16,
  padding: 22,
};

const kCardHeading: React.CSSProperties = {
  fontSize: 13, color: MUTED, fontWeight: 500,
  display: "flex", alignItems: "center", gap: 6,
};

// ─── Mock seed data (will be replaced with API) ────
interface DashStats {
  totalLeads: number;
  newLeadsToday: number;
  activeConversations: number;
  messagesThisMonth: number;
  messageLimit: number;
}

const SUCCESS_DATA = [
  { m: "May", v: 78 }, { m: "Jun", v: 82 }, { m: "Jul", v: 85 },
  { m: "Aug", v: 92 }, { m: "Sep", v: 95 }, { m: "Oct", v: 97.3 },
];

const CLIENT_DATA = [
  { m: "May", new: 1.2, returning: 0.6 },
  { m: "Jun", new: 1.6, returning: 0.9 },
  { m: "Jul", new: 1.4, returning: 1.1 },
  { m: "Aug", new: 2.2, returning: 1.5 },
  { m: "Sep", new: 1.9, returning: 1.7 },
  { m: "Oct", new: 2.6, returning: 2.1 },
];

const DONUT_DATA = [
  { name: "Data Sync", value: 12400, color: PURPLE },
  { name: "Email Automation", value: 8200, color: PURPLE_LIGHT },
  { name: "Reporting", value: 3100, color: LIME },
  { name: "API Triggers", value: 5600, color: "#5EEAD4" },
];

const TASKS = [
  {
    id: "t1", category: "Workflow", catColor: PURPLE,
    title: "Update Automation Report",
    updated: "Today, 15:15", progress: 97, progressColor: "#22c55e",
    due: "Today", dueUrgent: true,
    avatars: [{ initials: "PK", color: "#fda4af" }, { initials: "SA", color: "#a78bfa" }],
  },
  {
    id: "t2", category: "Client", catColor: "#0ea5e9",
    title: "Review API Logs",
    updated: "Today, 12:16", progress: 10, progressColor: "#3b82f6",
    due: "01 Nov", dueUrgent: false,
    avatars: [{ initials: "AM", color: "#fcd34d" }, { initials: "VS", color: "#86efac" }],
  },
  {
    id: "t3", category: "Meeting", catColor: PURPLE,
    title: "Client Onboarding Call",
    updated: "Today, 09:15", progress: 72, progressColor: LIME,
    due: "01 Nov", dueUrgent: false,
    avatars: [{ initials: "RJ", color: "#f0abfc" }, { initials: "GH", color: "#67e8f9" }, { initials: "+1", color: "#e5e7eb" }],
  },
];

// ═══════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════
export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<"All" | "Reports" | "Meetings" | "Sales">("All");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      const d = await res.json();
      if (d.success) setStats(d.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void (async () => { await fetchData(); })();
    const t = setInterval(() => { void (async () => { await fetchData(); })(); }, 30000);
    return () => clearInterval(t);
  }, [fetchData]);

  const totalDonut = useMemo(() => DONUT_DATA.reduce((a, b) => a + b.value, 0), []);

  const filteredTasks = useMemo(() => {
    if (taskFilter === "All") return TASKS;
    if (taskFilter === "Reports") return TASKS.filter(t => t.category === "Workflow");
    if (taskFilter === "Meetings") return TASKS.filter(t => t.category === "Meeting");
    return TASKS.filter(t => t.category === "Client");
  }, [taskFilter]);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 320px",
      gap: 16,
      alignItems: "start",
    }}>
      {/* ═══════ MAIN COLUMN ═══════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Row 1 — KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            {
              label: "Total Automations Run",
              value: 48320,
              trend: "+12%", trendLabel: "vs last month",
              positive: true,
            },
            {
              label: "Messages Sent",
              value: stats?.messagesThisMonth ?? 24108,
              trend: "+5%", trendLabel: "vs last month",
              positive: true,
            },
            {
              label: "Time Saved (hrs)",
              value: 9210,
              trend: "+23%", trendLabel: "vs last quarter",
              positive: true,
            },
          ].map((k, i) => (
            <div key={i} className="kpi-card anim-fade-up" style={{
              ...card,
              animationDelay: `${i * 70}ms`,
            }}>
              <div style={kCardHeading}>
                <span>{k.label}</span>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: FAINT }} />
              </div>
              <div className="heading-syne" style={{
                fontSize: 36, fontWeight: 700,
                color: INK, lineHeight: 1.05,
                margin: "12px 0 8px",
                fontFeatureSettings: '"tnum" 1',
              }}>
                {loading ? "—" : k.value.toLocaleString()}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  color: "#16a34a", fontWeight: 600,
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                  {k.trend}
                </span>
                <span style={{ color: MUTED }}>{k.trendLabel}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Row 2 — Donut + Success Rate */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16 }}>
          {/* Workflow Overview / Donut */}
          <div className="anim-fade-up" style={{ ...card, animationDelay: "200ms" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 className="heading-syne" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: INK }}>
                Workflow Overview
              </h3>
              <button style={{
                fontSize: 12, fontWeight: 500, color: MUTED,
                background: "white", border: `1px solid ${LINE}`,
                padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                Month
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "180px 1fr",
              gap: 18, alignItems: "center",
            }}>
              {/* Donut */}
              <div style={{ position: "relative", height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={DONUT_DATA}
                      cx="50%" cy="50%"
                      innerRadius={56} outerRadius={84}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                      animationDuration={800}
                    >
                      {DONUT_DATA.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: INK, border: "none", borderRadius: 8,
                        fontSize: 12, padding: "6px 10px",
                      }}
                      itemStyle={{ color: "white" }}
                      formatter={(v, n) => [`$${Number(v).toLocaleString()}`, String(n)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: "absolute", top: "50%", left: "50%",
                  transform: "translate(-50%, -50%)",
                  textAlign: "center", pointerEvents: "none",
                }}>
                  <div className="heading-syne" style={{
                    fontSize: 20, fontWeight: 700, color: INK,
                  }}>
                    76k
                  </div>
                  <div style={{ fontSize: 10.5, color: MUTED, marginTop: 1 }}>Tasks / Weekly</div>
                </div>
              </div>

              {/* Legend rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {DONUT_DATA.map(d => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: "50%",
                      background: d.color, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>{d.name}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, fontFeatureSettings: '"tnum" 1' }}>
                        ${d.value.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Automation Success Rate */}
          <div className="anim-fade-up" style={{ ...card, animationDelay: "260ms" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <h3 className="heading-syne" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: INK }}>
                  Automation Success Rate
                </h3>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={PURPLE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  Success Trend
                  <span style={{ color: "#16a34a", fontWeight: 600, marginLeft: 4 }}>↑ 14.2% Growth</span>
                </div>
              </div>
              <button style={{
                fontSize: 12, fontWeight: 500, color: MUTED,
                background: "white", border: `1px solid ${LINE}`,
                padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                Month
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>

            <div style={{ height: 200, marginTop: 14 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={SUCCESS_DATA} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="succGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PURPLE} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={PURPLE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: MUTED }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: MUTED }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: INK, border: "none", borderRadius: 8, fontSize: 12, padding: "8px 12px" }}
                    itemStyle={{ color: "white" }}
                    labelStyle={{ color: "#cbd5e1", fontSize: 11, marginBottom: 2 }}
                    formatter={(v) => [`${v}% Success`, ""]}
                    labelFormatter={(l) => `${String(l)} 2026`}
                  />
                  <Area type="monotone" dataKey="v"
                    stroke={PURPLE} strokeWidth={2.5}
                    fill="url(#succGrad)"
                    animationDuration={900}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Row 3 — Client activity + Premium CTA */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
          {/* Client Activity */}
          <div className="anim-fade-up" style={{ ...card, animationDelay: "340ms" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div>
                <h3 className="heading-syne" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: INK }}>
                  Client Automation Activity
                </h3>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                  Monthly breakdown of new vs returning clients running automations
                </div>
              </div>
              <button style={{
                fontSize: 12, fontWeight: 500, color: MUTED,
                background: "white", border: `1px solid ${LINE}`,
                padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                Month
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>

            <div style={{ height: 200, marginTop: 14 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={CLIENT_DATA} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="newGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PURPLE} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={PURPLE} stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PURPLE_LIGHT} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={PURPLE_LIGHT} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: MUTED }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: MUTED }} tickFormatter={(v) => `${v}k`} />
                  <Tooltip
                    contentStyle={{ background: INK, border: "none", borderRadius: 8, fontSize: 12, padding: "8px 12px" }}
                    itemStyle={{ color: "white" }}
                    labelStyle={{ color: "#cbd5e1", fontSize: 11, marginBottom: 2 }}
                    formatter={(v, n) => [`${v}k`, n === "new" ? "New clients" : "Returning"]}
                  />
                  <Area type="monotone" dataKey="returning" stackId="1"
                    stroke={PURPLE_LIGHT} strokeWidth={2}
                    fill="url(#retGrad)"
                    animationDuration={900}
                  />
                  <Area type="monotone" dataKey="new" stackId="1"
                    stroke={PURPLE} strokeWidth={2.5}
                    fill="url(#newGrad)"
                    animationDuration={900}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Premium CTA Card */}
          <div className="anim-fade-up" style={{
            position: "relative",
            borderRadius: 16,
            padding: 22,
            background: `linear-gradient(135deg, #6D28D9 0%, ${PURPLE} 60%, #8B5CF6 100%)`,
            color: "white",
            overflow: "hidden",
            animationDelay: "400ms",
            minHeight: 200,
            display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            {/* Decorative blob 1 */}
            <div style={{
              position: "absolute", top: -40, right: -30,
              width: 180, height: 180, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(167,139,250,0.5), transparent 70%)",
              filter: "blur(20px)",
            }} />
            {/* Decorative blob 2 */}
            <div style={{
              position: "absolute", bottom: -50, left: -30,
              width: 140, height: 140, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(198,249,85,0.18), transparent 70%)",
              filter: "blur(22px)",
            }} />

            <div style={{ position: "relative", zIndex: 2 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 100,
                background: "rgba(255,255,255,0.18)",
                fontSize: 11, fontWeight: 600,
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill={LIME} stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                Pro Plan
              </span>
            </div>

            <div style={{ position: "relative", zIndex: 2 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                <span className="heading-syne" style={{ fontSize: 38, fontWeight: 700, lineHeight: 1 }}>$49</span>
                <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.3, marginLeft: 6 }}>
                  <div>Per Month</div>
                  <div>Per User</div>
                </div>
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, opacity: 0.9, marginBottom: 16 }}>
                Unlock unlimited workflows, AI triggers, and advanced analytics.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "10px 22px", borderRadius: 100,
                  background: LIME, color: LIME_DARK,
                  border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 700,
                  fontFamily: "inherit",
                  boxShadow: `0 6px 18px rgba(198,249,85,0.4)`,
                  transition: "transform 180ms ease",
                }}
                  onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "none")}
                >
                  Get Started
                </button>
                <button style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "white", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backdropFilter: "blur(10px)",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ RIGHT RAIL — All Tasks ═══════ */}
      <aside className="anim-fade-up" style={{
        ...card,
        position: "sticky", top: 80,
        padding: 20,
        animationDelay: "150ms",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span className="heading-syne" style={{ fontSize: 16, fontWeight: 700, color: INK }}>
              All tasks
            </span>
            <span style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>(12)</span>
          </div>
          <button title="Expand" style={{
            width: 28, height: 28, borderRadius: 8,
            background: SOFT, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: MUTED,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px",
          background: SOFT, borderRadius: 9,
          marginBottom: 14,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input placeholder="Search" style={{
            flex: 1, border: "none", outline: "none", background: "transparent",
            fontSize: 12.5, color: INK, fontFamily: "inherit",
          }} />
          <kbd style={{
            fontSize: 9.5, fontWeight: 600,
            padding: "1px 5px", borderRadius: 4,
            background: "white", border: `1px solid ${LINE}`,
            color: MUTED, fontFamily: "inherit",
          }}>⌘K</kbd>
        </div>

        {/* Filter tabs */}
        <div style={{
          display: "flex", gap: 2,
          background: SOFT, borderRadius: 9, padding: 3,
          marginBottom: 16,
        }}>
          {(["All", "Reports", "Meetings", "Sales"] as const).map(t => (
            <button key={t} onClick={() => setTaskFilter(t)} style={{
              flex: 1,
              padding: "6px 0", borderRadius: 7,
              background: taskFilter === t ? "white" : "transparent",
              border: "none", cursor: "pointer",
              fontSize: 11.5, fontWeight: 600,
              color: taskFilter === t ? INK : MUTED,
              boxShadow: taskFilter === t ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              fontFamily: "inherit",
              transition: "all 150ms ease",
            }}>
              {t}
            </button>
          ))}
        </div>

        {/* Task cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filteredTasks.map((t, i) => (
            <div key={t.id} style={{
              padding: "12px 0",
              borderTop: i > 0 ? `1px solid ${SOFT}` : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 600,
                  padding: "2px 8px", borderRadius: 5,
                  background: `${t.catColor}1A`,
                  color: t.catColor,
                }}>
                  {t.category}
                </span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 4 }}>
                {t.title}
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>
                Last update: {t.updated}
              </div>

              {/* Progress bar + percent */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                marginBottom: 10,
              }}>
                <div style={{
                  flex: 1, height: 6,
                  background: SOFT, borderRadius: 100,
                  overflow: "hidden",
                }}>
                  <div className="anim-grow-bar" style={{
                    height: "100%", width: `${t.progress}%`,
                    background: t.progressColor,
                    borderRadius: 100,
                    boxShadow: t.progressColor === LIME ? `0 0 8px ${t.progressColor}` : "none",
                  }} />
                </div>
                <span style={{
                  fontSize: 11.5, fontWeight: 700, color: INK,
                  fontFeatureSettings: '"tnum" 1', minWidth: 32, textAlign: "right",
                }}>
                  {t.progress}%
                </span>
              </div>

              {/* Due + Avatars */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                  <span style={{ color: MUTED }}>Due:</span>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    color: t.dueUrgent ? "#dc2626" : INK, fontWeight: 600,
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M4 2v20l4-3 4 3 4-3 4 3V2z"/></svg>
                    {t.due}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  {t.avatars.map((a, idx) => (
                    <div key={idx} style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: a.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9.5, fontWeight: 700, color: LIME_DARK,
                      border: "2px solid white",
                      marginLeft: idx > 0 ? -8 : 0,
                    }}>
                      {a.initials}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
