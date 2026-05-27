"use client";

import React, { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  X, TrendingUp, Clock, CheckCircle2, AlertTriangle,
  Users, Zap, BarChart2, RefreshCw,
} from "lucide-react";

// ── Recharts loaded client-only (per project safety rules) ──────────────────
const AreaChart    = dynamic(() => import("recharts").then(m => m.AreaChart),    { ssr: false });
const Area         = dynamic(() => import("recharts").then(m => m.Area),         { ssr: false });
const BarChart     = dynamic(() => import("recharts").then(m => m.BarChart),     { ssr: false });
const Bar          = dynamic(() => import("recharts").then(m => m.Bar),          { ssr: false });
const XAxis        = dynamic(() => import("recharts").then(m => m.XAxis),        { ssr: false });
const YAxis        = dynamic(() => import("recharts").then(m => m.YAxis),        { ssr: false });
const Tooltip      = dynamic(() => import("recharts").then(m => m.Tooltip),      { ssr: false });
const ResponsiveContainer = dynamic(
  () => import("recharts").then(m => m.ResponsiveContainer), { ssr: false }
);

// ── Types ────────────────────────────────────────────────────────────────────
interface AnalyticsData {
  totalRuns:      number;
  completionRate: number;
  avgDuration:    number;
  outcomes:       { completed: number; handoff: number; errors: number; waiting: number };
  dailyRuns:      { date: string; count: number }[];
  nodeStats:      { nodeId: string; nodeType: string; count: number; pct: number }[];
  mostFailedNodeId: string | null;
}

interface Props {
  flowId:   string;
  flowName: string;
  onClose:  () => void;
  /** Optional: node label map for displaying names in funnel */
  nodeLabels?: Record<string, string>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function StatCard({
  icon: Icon, label, value, sub, color = "#10b981",
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={15} color={color} />
        </div>
        <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#f1f5f9", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#475569" }}>{sub}</div>}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function FlowAnalytics({ flowId, flowName, onClose, nodeLabels = {} }: Props) {
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays]       = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/flows/${flowId}/analytics?days=${days}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [flowId, days]);

  useEffect(() => { load(); }, [load]);

  const dropoffColor = (pct: number) =>
    pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60,
      background: "rgba(3,3,3,0.88)", backdropFilter: "blur(16px)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        height: 56, flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", padding: "0 24px", gap: 16,
        background: "rgba(10,12,18,0.95)",
      }}>
        <BarChart2 size={18} color="#10b981" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>Flow Analytics</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{flowName}</div>
        </div>

        {/* Day range selector */}
        <div style={{ display: "flex", gap: 4 }}>
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600,
              border: "1px solid",
              borderColor: days === d ? "#10b981" : "rgba(255,255,255,0.08)",
              background: days === d ? "rgba(16,185,129,0.12)" : "transparent",
              color: days === d ? "#10b981" : "#64748b",
              cursor: "pointer",
            }}>{d}d</button>
          ))}
        </div>

        <button onClick={load} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4 }}>
          <RefreshCw size={15} />
        </button>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4 }}>
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px 48px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "#475569", fontSize: 14 }}>
            Loading analytics…
          </div>
        ) : !data || data.totalRuns === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: 320, gap: 12,
          }}>
            <BarChart2 size={40} color="#1e293b" />
            <div style={{ fontSize: 15, fontWeight: 600, color: "#334155" }}>No data yet</div>
            <div style={{ fontSize: 13, color: "#1e293b", textAlign: "center", maxWidth: 320 }}>
              Analytics will appear once this flow has been triggered by real conversations.
            </div>
          </div>
        ) : (
          <>
            {/* ── Stat cards ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginBottom: 32 }}>
              <StatCard icon={Users}       label="Total Runs"       value={data.totalRuns.toLocaleString()} color="#6366f1" />
              <StatCard icon={CheckCircle2} label="Completion Rate" value={`${data.completionRate}%`}       color="#10b981"
                sub={`${data.outcomes.completed} completed`} />
              <StatCard icon={Clock}        label="Avg Duration"    value={fmtDuration(data.avgDuration)}   color="#f59e0b" />
              <StatCard icon={AlertTriangle} label="Errors"         value={data.outcomes.errors}             color="#ef4444"
                sub={data.mostFailedNodeId ? `Node: ${nodeLabels[data.mostFailedNodeId] ?? data.mostFailedNodeId}` : undefined} />
              <StatCard icon={Zap}          label="Handoffs"        value={data.outcomes.handoff}            color="#8b5cf6" />
              <StatCard icon={TrendingUp}   label="Waiting"         value={data.outcomes.waiting}            color="#06b6d4" />
            </div>

            {/* ── Daily runs chart ── */}
            <div style={{
              background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16, padding: "20px 24px", marginBottom: 24,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 16 }}>Daily Runs — last {days} days</div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={data.dailyRuns} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "rgba(10,12,18,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#94a3b8" }} itemStyle={{ color: "#10b981" }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} fill="url(#areaGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* ── Node funnel ── */}
            {data.nodeStats.length > 0 && (
              <div style={{
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 16, padding: "20px 24px", marginBottom: 24,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 16 }}>Node Funnel — drop-off analysis</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.nodeStats.slice(0, 12).map(n => {
                    const label = nodeLabels[n.nodeId] ?? n.nodeType ?? n.nodeId;
                    const color = dropoffColor(n.pct);
                    return (
                      <div key={n.nodeId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 160, fontSize: 12, color: "#94a3b8", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={label}>{label}</div>
                        <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                          <div style={{
                            width: `${n.pct}%`, height: "100%", borderRadius: 4,
                            background: `linear-gradient(90deg, ${color}, ${color}99)`,
                            transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
                          }} />
                        </div>
                        <div style={{ width: 42, textAlign: "right", fontSize: 12, fontWeight: 700, color, flexShrink: 0 }}>{n.pct}%</div>
                        <div style={{ width: 52, textAlign: "right", fontSize: 11, color: "#475569", flexShrink: 0 }}>{n.count.toLocaleString()}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Outcome bar chart ── */}
            <div style={{
              background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16, padding: "20px 24px",
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 16 }}>Outcome Distribution</div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={[data.outcomes]} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} layout="horizontal">
                  <XAxis type="category" dataKey="name" hide />
                  <YAxis type="number" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "rgba(10,12,18,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: "#94a3b8" }}
                  />
                  <Bar dataKey="completed" fill="#10b981" radius={[4,4,0,0]} name="Completed" />
                  <Bar dataKey="handoff"   fill="#8b5cf6" radius={[4,4,0,0]} name="Handoff"   />
                  <Bar dataKey="errors"    fill="#ef4444" radius={[4,4,0,0]} name="Errors"    />
                  <Bar dataKey="waiting"   fill="#06b6d4" radius={[4,4,0,0]} name="Waiting"   />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
