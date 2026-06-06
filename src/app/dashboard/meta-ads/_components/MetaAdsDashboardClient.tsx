"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Search, Filter, MoreVertical, Play, Pause,
  Trash2, Eye, TrendingUp, Users, DollarSign, MessageSquare,
  Loader2, AlertTriangle, RefreshCw, Settings, BarChart2,
  ChevronLeft, ChevronRight, Clock, CheckCircle, XCircle,
  ArrowUpDown, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MetaCampaign, CampaignStatus } from "@/lib/meta-ads/types";
import { CampaignWizardModal } from "./CampaignWizardModal";

const STATUS_CONFIG: Record<CampaignStatus | string, { label: string; color: string; dot: string }> = {
  draft:          { label: "Draft",          color: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",           dot: "bg-zinc-400" },
  pending_review: { label: "In Review",      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",   dot: "bg-amber-500 animate-pulse" },
  active:         { label: "Active",         color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500 animate-pulse" },
  paused:         { label: "Paused",         color: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",           dot: "bg-zinc-400" },
  completed:      { label: "Completed",      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",      dot: "bg-blue-500" },
  rejected:       { label: "Rejected",       color: "bg-red-500/10 text-red-600 dark:text-red-400",         dot: "bg-red-500" },
  error:          { label: "Error",          color: "bg-red-500/10 text-red-600 dark:text-red-400",         dot: "bg-red-500" },
  archived:       { label: "Archived",       color: "bg-zinc-100 dark:bg-zinc-800 text-zinc-400",           dot: "bg-zinc-300" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", cfg.color)}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function MetricCell({ value, label, format = "number" }: { value: number; label: string; format?: "number" | "currency" | "pct" }) {
  const fmt = (v: number) => {
    if (format === "currency") return v === 0 ? "₹0" : `₹${v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(0)}`;
    if (format === "pct") return `${v.toFixed(2)}x`;
    return v >= 10000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString();
  };
  return (
    <div>
      <p className="text-sm font-semibold text-foreground tabular-nums">{fmt(value)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

const DATE_FILTERS = [
  { label: "Today",       value: "today" },
  { label: "Yesterday",   value: "yesterday" },
  { label: "Last 7 days", value: "last_7_days" },
  { label: "Last 30 days",value: "last_30_days" },
];

type SortField = "created_at" | "name" | "status" | "total_spend" | "total_leads";

export function MetaAdsDashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [campaigns, setCampaigns] = useState<(MetaCampaign & { cost_per_lead: number; cost_per_conversation: number; roas: number })[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState("last_7_days");
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(searchParams.get("new") === "1");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        sort_by: sortBy,
        sort_order: sortOrder,
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      });
      const res = await fetch(`/api/meta-ads/campaigns?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
        setPagination(data.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sortBy, sortOrder]);

  useEffect(() => { load(1); }, [load]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) setSortOrder(o => o === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder("desc"); }
  };

  const handleStatusChange = async (id: string, status: "active" | "paused" | "archived") => {
    setActionLoading(id);
    try {
      await fetch(`/api/meta-ads/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load(pagination.page);
    } finally {
      setActionLoading(null);
      setOpenMenuId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    setActionLoading(id);
    try {
      await fetch(`/api/meta-ads/campaigns/${id}`, { method: "DELETE" });
      await load(pagination.page);
    } finally {
      setActionLoading(null);
    }
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={cn("h-3 w-3", sortBy === field ? "text-foreground" : "opacity-40")} />
    </button>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Meta Ads</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Click-to-WhatsApp campaigns · {pagination.total} campaigns</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/meta-ads/analytics"
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
          >
            <BarChart2 className="h-4 w-4" />
            Analytics
          </a>
          <a
            href="/dashboard/meta-ads/settings"
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
          >
            <Settings className="h-4 w-4" />
            Connection
          </a>
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Campaign
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search campaigns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {/* Status filter */}
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background p-1">
          {[{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "draft", label: "Draft" }].map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                statusFilter === f.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Date filter */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setDateFilter(f.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                dateFilter === f.value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => load(1)} className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-all">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* Campaign table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 mb-4">
              <TrendingUp className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold text-foreground">No campaigns yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create your first Click-to-WhatsApp campaign to start generating leads.</p>
            <button
              onClick={() => setShowWizard(true)}
              className="mt-4 flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background"
            >
              <Plus className="h-4 w-4" /> Create Campaign
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-10">
              <tr>
                <th className="px-6 py-3 text-left"><SortButton field="name" label="Campaign" /></th>
                <th className="px-4 py-3 text-left"><SortButton field="status" label="Status" /></th>
                <th className="px-4 py-3 text-right"><SortButton field="total_spend" label="Spend" /></th>
                <th className="px-4 py-3 text-right"><SortButton field="total_leads" label="Leads" /></th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Conv.</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">CPL</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">CPC</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">ROAS</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Budget</th>
                <th className="px-4 py-3 text-right"><SortButton field="created_at" label="Created" /></th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {campaigns.map((c) => (
                <tr key={c.id} className="group hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-3">
                    <div>
                      <p className="font-semibold text-foreground truncate max-w-[200px]">{c.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{c.objective.replace("_", " ").toLowerCase()}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MetricCell value={c.total_spend} label="" format="currency" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MetricCell value={c.total_leads} label="" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold tabular-nums">{c.total_conversations.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("text-sm font-semibold tabular-nums", c.cost_per_lead > 0 ? "text-foreground" : "text-muted-foreground")}>
                      {c.cost_per_lead > 0 ? `₹${c.cost_per_lead.toFixed(0)}` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("text-sm font-semibold tabular-nums", c.cost_per_conversation > 0 ? "text-foreground" : "text-muted-foreground")}>
                      {c.cost_per_conversation > 0 ? `₹${c.cost_per_conversation.toFixed(0)}` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("text-sm font-semibold tabular-nums", c.roas >= 1 ? "text-emerald-600 dark:text-emerald-400" : c.roas > 0 ? "text-amber-600" : "text-muted-foreground")}>
                      {c.roas > 0 ? `${c.roas.toFixed(2)}x` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-right">
                      <p className="text-sm font-semibold">₹{Number(c.budget_amount).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{c.budget_type}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</span>
                  </td>
                  <td className="px-4 py-3 relative">
                    {actionLoading === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)}
                          className="p-1 rounded-md hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>
                        {openMenuId === c.id && (
                          <div className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-border bg-popover shadow-xl p-1.5 animate-fade-in">
                            <button onClick={() => router.push(`/dashboard/meta-ads/campaigns/${c.id}`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                              <Eye className="h-3.5 w-3.5" /> View Details
                            </button>
                            {c.status === "draft" && (
                              <button onClick={async () => { setActionLoading(c.id); await fetch(`/api/meta-ads/campaigns/${c.id}/publish`, { method: "POST" }); await load(pagination.page); setActionLoading(null); setOpenMenuId(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                                <Play className="h-3.5 w-3.5 text-emerald-500" /> Publish
                              </button>
                            )}
                            {c.status === "active" && (
                              <button onClick={() => handleStatusChange(c.id, "paused")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                                <Pause className="h-3.5 w-3.5 text-amber-500" /> Pause
                              </button>
                            )}
                            {c.status === "paused" && (
                              <button onClick={() => handleStatusChange(c.id, "active")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                                <Play className="h-3.5 w-3.5 text-emerald-500" /> Resume
                              </button>
                            )}
                            <div className="my-1 border-t border-border/50" />
                            <button onClick={() => handleDelete(c.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <p className="text-xs text-muted-foreground">
            {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </p>
          <div className="flex items-center gap-1">
            <button
              disabled={pagination.page <= 1}
              onClick={() => load(pagination.page - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-3 text-xs text-muted-foreground">
              {pagination.page} / {pagination.total_pages}
            </span>
            <button
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => load(pagination.page + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Campaign wizard */}
      {showWizard && <CampaignWizardModal onClose={() => { setShowWizard(false); load(1); }} />}
    </div>
  );
}
