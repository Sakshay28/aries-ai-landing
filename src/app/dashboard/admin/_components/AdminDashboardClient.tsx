"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw,
  TrendingUp,
  Building2,
  Zap,
  MessageSquare,
  Users,
  ExternalLink,
  UserPlus,
  ShieldCheck,
} from "lucide-react";

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

function getStatus(t: AdminTenant): string {
  if (!t.is_active) return "suspended";
  if (t.plan_status === "trialing") return "trial";
  if (t.plan_status === "cancelled") return "churned";
  if (t.plan_status === "active") return "active";
  return t.plan_status;
}

function statusClasses(s: string) {
  const m: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-500",
    trial: "bg-violet-500/10 text-violet-500",
    trialing: "bg-violet-500/10 text-violet-500",
    churned: "bg-red-400/10 text-red-400",
    cancelled: "bg-red-400/10 text-red-400",
    suspended: "bg-amber-400/10 text-amber-400",
    past_due: "bg-amber-400/10 text-amber-400",
  };
  return m[s] || m.active;
}

function healthScore(t: AdminTenant): number {
  let score = 0;
  if (t.is_active) score += 30;
  if (t.wa_phone_number_id) score += 30;
  if (t.messages_used_this_month > 0) score += 20;
  if (t.plan_status === "active") score += 20;
  return score;
}

function healthColor(score: number) {
  if (score >= 80) return "text-emerald-500";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function healthBarColor(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-400";
  return "bg-red-400";
}

export function AdminDashboardClient() {
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
        if (res.status === 403) throw new Error("Admin access required.");
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
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filtered =
    filter === "all" ? tenants : tenants.filter((t) => getStatus(t) === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Platform overview &middot; {tenants.length} tenants
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/admin/approvals"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Approvals
          </Link>
          <Link
            href="/dashboard/admin/onboard"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" /> Onboard Client
          </Link>
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-400/30 bg-red-400/5 px-4 py-3">
          <span className="text-sm text-red-400">{error}</span>
          <button
            onClick={fetchData}
            className="rounded-md bg-red-500 px-3 py-1 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            {
              icon: TrendingUp,
              label: "Monthly Revenue",
              value: `₹${stats.mrr.toLocaleString()}`,
              color: "text-emerald-500",
              bg: "bg-emerald-500/10",
            },
            {
              icon: Building2,
              label: "Active Clients",
              value: stats.activeTenants,
              color: "text-violet-500",
              bg: "bg-violet-500/10",
            },
            {
              icon: Zap,
              label: "On Trial",
              value: tenants.filter((t) => t.plan_status === "trialing").length,
              color: "text-amber-400",
              bg: "bg-amber-400/10",
            },
            {
              icon: MessageSquare,
              label: "Total Messages",
              value: stats.totalMessages.toLocaleString(),
              color: "text-cyan-400",
              bg: "bg-cyan-400/10",
            },
            {
              icon: Users,
              label: "Total Leads",
              value: stats.totalLeads.toLocaleString(),
              color: "text-indigo-400",
              bg: "bg-indigo-400/10",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`rounded-lg p-1.5 ${s.bg}`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Client table */}
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="text-sm font-semibold">
            All Clients ({filtered.length})
          </h2>
          <div className="flex gap-1.5">
            {["all", "active", "trial", "churned", "suspended"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {loading ? "Loading..." : "No clients found."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                  {["Client", "Plan", "Status", "Messages", "WA", "Health", "Joined"].map(
                    (h) => (
                      <th key={h} className="px-5 py-3 text-left font-medium">
                        {h}
                      </th>
                    )
                  )}
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const status = getStatus(t);
                  const health = healthScore(t);
                  return (
                    <tr
                      key={t.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-medium">{t.business_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.business_type}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 capitalize text-muted-foreground">
                        {t.plan}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusClasses(status)}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {t.messages_used_this_month.toLocaleString()} /{" "}
                        {t.message_limit.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5">
                        {t.wa_phone_number_id ? (
                          <span className="text-emerald-500 text-xs font-medium">
                            Connected
                          </span>
                        ) : (
                          <span className="text-red-400 text-xs font-medium">
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${healthBarColor(health)}`}
                              style={{ width: `${health}%` }}
                            />
                          </div>
                          <span
                            className={`text-xs font-semibold ${healthColor(health)}`}
                          >
                            {health}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/dashboard/admin/onboard?tenant=${t.id}`}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="View tenant"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
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
  );
}
