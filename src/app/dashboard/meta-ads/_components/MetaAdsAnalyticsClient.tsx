"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign, Users, MessageSquare, Calendar, TrendingUp,
  TrendingDown, BarChart2, ArrowRight, Loader2, RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, BarChart, Bar, FunnelChart, Funnel, LabelList,
} from "recharts";
import { cn } from "@/lib/utils";
import type { ROIDashboard } from "@/lib/meta-ads/types";

const DATE_FILTERS = [
  { label: "Today",       value: "today" },
  { label: "Yesterday",   value: "yesterday" },
  { label: "Last 7 days", value: "last_7_days" },
  { label: "Last 30 days",value: "last_30_days" },
];

// ─── KPI Card ───
function KpiCard({
  title, value, sub, icon: Icon, color = "text-foreground",
  bg = "bg-muted/40", trend,
}: {
  title: string; value: string; sub?: string;
  icon: React.ElementType; color?: string; bg?: string;
  trend?: { value: number; label: string };
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl", bg)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
      </div>
      <div>
        <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {trend && (
        <div className={cn("flex items-center gap-1 text-xs font-medium", trend.value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
          {trend.value >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(trend.value)}% {trend.label}
        </div>
      )}
    </div>
  );
}

// ─── Funnel bar ───
function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const convPct = max > 0 && label !== "Impressions" ? ((value / max) * 100).toFixed(1) : null;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 text-right">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {convPct && <p className="text-[10px] text-muted-foreground">{convPct}% conv.</p>}
      </div>
      <div className="flex-1 rounded-full bg-muted h-4 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-20 text-right">
        <p className="text-sm font-bold text-foreground tabular-nums">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2.5 shadow-xl text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">
            {p.name === "Spend" ? `₹${Number(p.value).toFixed(0)}` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export function MetaAdsAnalyticsClient() {
  const [data, setData] = useState<ROIDashboard | null>(null);
  const [filter, setFilter] = useState("last_7_days");
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState<"spend" | "leads" | "conversations">("spend");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meta-ads/analytics?filter=${filter}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const fmt = (n: number, currency = false) =>
    currency
      ? n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n.toFixed(0)}`
      : n >= 10000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString();

  const chartData = (data?.daily_metrics || []).map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    Spend: d.spend,
    Leads: d.leads,
    Conversations: d.conversations,
    Bookings: d.bookings,
  }));

  const funnelMax = data?.funnel.impressions || 1;
  const funnelSteps = data ? [
    { label: "Impressions",    value: data.funnel.impressions,    color: "bg-violet-500" },
    { label: "Clicks",         value: data.funnel.clicks,         color: "bg-blue-500" },
    { label: "WA Opens",       value: data.funnel.whatsapp_opens, color: "bg-sky-500" },
    { label: "Conversations",  value: data.funnel.conversations,  color: "bg-emerald-500" },
    { label: "Bookings",       value: data.funnel.bookings,       color: "bg-orange-500" },
  ] : [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">ROI Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Meta Ads performance across all campaigns</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
              {DATE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    filter === f.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button onClick={load} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border hover:bg-muted transition-colors">
              <RefreshCw className={cn("h-4 w-4 text-muted-foreground", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Total Spend"
                value={fmt(data?.total_spend || 0, true)}
                sub={`${filter.replace(/_/g, " ")}`}
                icon={DollarSign}
                color="text-orange-500"
                bg="bg-orange-500/10"
              />
              <KpiCard
                title="Total Leads"
                value={fmt(data?.total_leads || 0)}
                sub={data?.cost_per_lead ? `₹${data.cost_per_lead} CPL` : "—"}
                icon={Users}
                color="text-blue-500"
                bg="bg-blue-500/10"
              />
              <KpiCard
                title="Conversations"
                value={fmt(data?.total_conversations || 0)}
                sub={data?.cost_per_lead ? `₹${((data.total_spend || 0) / Math.max(1, data.total_conversations)).toFixed(0)} CPC` : "—"}
                icon={MessageSquare}
                color="text-violet-500"
                bg="bg-violet-500/10"
              />
              <KpiCard
                title="ROAS"
                value={data?.roas ? `${data.roas.toFixed(2)}x` : "—"}
                sub={`${data?.total_bookings || 0} bookings`}
                icon={TrendingUp}
                color={!data?.roas ? "text-muted-foreground" : data.roas >= 2 ? "text-emerald-500" : data.roas >= 1 ? "text-amber-500" : "text-red-500"}
                bg={!data?.roas ? "bg-muted/40" : data.roas >= 2 ? "bg-emerald-500/10" : data.roas >= 1 ? "bg-amber-500/10" : "bg-red-500/10"}
              />
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Cost Per Lead",    value: data?.cost_per_lead ? `₹${data.cost_per_lead.toFixed(0)}` : "—" },
                { label: "Cost Per Booking", value: data?.cost_per_booking ? `₹${data.cost_per_booking.toFixed(0)}` : "—" },
                { label: "Total Bookings",   value: data?.total_bookings?.toLocaleString() || "0" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-2xl border border-border/60 bg-card p-4">
                  <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold text-foreground mt-1">{value}</p>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold text-foreground">Daily Performance</h2>
                <div className="flex items-center gap-1 rounded-lg border border-border p-1">
                  {(["spend", "leads", "conversations"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setActiveChart(t)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-all",
                        activeChart === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {chartData.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                  No data for this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    {activeChart === "spend" && (
                      <Area type="monotone" dataKey="Spend" stroke="#f97316" strokeWidth={2} fill="url(#spendGrad)" dot={false} />
                    )}
                    {activeChart === "leads" && (
                      <Area type="monotone" dataKey="Leads" stroke="#3b82f6" strokeWidth={2} fill="url(#leadsGrad)" dot={false} />
                    )}
                    {activeChart === "conversations" && (
                      <Area type="monotone" dataKey="Conversations" stroke="#8b5cf6" strokeWidth={2} fill="url(#convGrad)" dot={false} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Conversion Funnel */}
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <h2 className="text-sm font-bold text-foreground mb-5">Conversion Funnel</h2>
              {funnelSteps.every((s) => s.value === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-6">No funnel data for this period</p>
              ) : (
                <div className="space-y-3">
                  {funnelSteps.map((s, i) => (
                    <div key={s.label}>
                      <FunnelBar label={s.label} value={s.value} max={funnelMax} color={s.color} />
                      {i < funnelSteps.length - 1 && (
                        <div className="flex items-center justify-center my-1">
                          <div className="h-3 w-px bg-border" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Conversion rates */}
              {data && (data.funnel.impressions > 0 || data.funnel.clicks > 0) && (
                <div className="mt-5 grid grid-cols-4 gap-3 pt-4 border-t border-border/40">
                  {[
                    { label: "Click Rate",     value: data.funnel.impressions > 0 ? ((data.funnel.clicks / data.funnel.impressions) * 100).toFixed(2) + "%" : "—" },
                    { label: "WA Open Rate",   value: data.funnel.clicks > 0 ? ((data.funnel.whatsapp_opens / data.funnel.clicks) * 100).toFixed(1) + "%" : "—" },
                    { label: "Conv. Rate",     value: data.funnel.whatsapp_opens > 0 ? ((data.funnel.conversations / data.funnel.whatsapp_opens) * 100).toFixed(1) + "%" : "—" },
                    { label: "Booking Rate",   value: data.funnel.conversations > 0 ? ((data.funnel.bookings / data.funnel.conversations) * 100).toFixed(1) + "%" : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <p className="text-lg font-bold text-foreground">{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bookings vs Spend bar chart */}
            {chartData.length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <h2 className="text-sm font-bold text-foreground mb-5">Bookings Generated</h2>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Bookings" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
