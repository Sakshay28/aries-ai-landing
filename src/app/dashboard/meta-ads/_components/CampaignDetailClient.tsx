"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Play, Pause, Trash2, TrendingUp,
  Users, DollarSign, MousePointer, MessageSquare, CheckCircle,
  BarChart3, Target, Globe, AlertCircle, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MetaCampaign, CampaignStatus } from "@/lib/meta-ads/types";

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string }> = {
  draft:          { label: "Draft",          color: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400" },
  pending_review: { label: "Pending Review", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  active:         { label: "Active",         color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  paused:         { label: "Paused",         color: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500" },
  completed:      { label: "Completed",      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  rejected:       { label: "Rejected",       color: "bg-red-500/10 text-red-600 dark:text-red-400" },
  error:          { label: "Error",          color: "bg-red-500/10 text-red-600 dark:text-red-400" },
  archived:       { label: "Archived",       color: "bg-zinc-100 dark:bg-zinc-800 text-zinc-400" },
};

function KpiCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", color)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export function CampaignDetailClient({ id }: { id: string }) {
  const [campaign, setCampaign] = useState<MetaCampaign & { adsets?: any[]; ads?: any[]; lead_count?: number; analytics?: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/meta-ads/campaigns/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setCampaign(d);
      })
      .catch(() => setError("Failed to load campaign"))
      .finally(() => setLoading(false));
  }, [id]);

  const updateStatus = async (status: "ACTIVE" | "PAUSED") => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/meta-ads/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status === "ACTIVE" ? "active" : "paused" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setCampaign((prev) => prev ? { ...prev, status: data.status } : prev);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const publishCampaign = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/meta-ads/campaigns/${id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");
      setCampaign((prev) => prev ? { ...prev, status: data.status } : prev);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="font-semibold text-foreground">{error || "Campaign not found"}</p>
        <Link href="/dashboard/meta-ads" className="text-sm text-blue-600 hover:underline">← Back to campaigns</Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft;
  const fmtCurrency = (v?: number | null) => v != null ? `₹${v.toLocaleString()}` : "—";
  const fmtNum = (v?: number | null) => v != null ? v.toLocaleString() : "—";

  // Aggregate analytics
  const totals = (campaign.analytics || []).reduce(
    (acc: Record<string, number>, row: any) => ({
      impressions: acc.impressions + (row.impressions || 0),
      clicks: acc.clicks + (row.clicks || 0),
      leads: acc.leads + (row.leads || 0),
      conversations: acc.conversations + (row.conversations || 0),
      bookings: acc.bookings + (row.bookings || 0),
      spend: acc.spend + (row.spend || 0),
    }),
    { impressions: 0, clicks: 0, leads: 0, conversations: 0, bookings: 0, spend: 0 },
  );

  const cpl = totals.leads > 0 ? (totals.spend / totals.leads).toFixed(0) : null;
  const cpc = totals.clicks > 0 ? (totals.spend / totals.clicks).toFixed(2) : null;
  const ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      {/* Back + Header */}
      <div>
        <Link href="/dashboard/meta-ads" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Campaigns
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", statusCfg.color)}>
                {statusCfg.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 capitalize">
              {campaign.objective?.replace("_", " ").toLowerCase()} · {campaign.budget_type === "daily" ? "Daily" : "Lifetime"} ₹{campaign.budget_amount?.toLocaleString()} budget
            </p>
          </div>
          <div className="flex items-center gap-2">
            {campaign.status === "draft" && (
              <button
                disabled={actionLoading}
                onClick={publishCampaign}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
                Publish Campaign
              </button>
            )}
            {campaign.status === "active" && (
              <button
                disabled={actionLoading}
                onClick={() => updateStatus("PAUSED")}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-muted px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                Pause
              </button>
            )}
            {campaign.status === "paused" && (
              <button
                disabled={actionLoading}
                onClick={() => updateStatus("ACTIVE")}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Resume
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Meta error banner */}
      {campaign.meta_error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Campaign Error</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">{campaign.meta_error}</p>
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Spend" value={fmtCurrency(totals.spend)} icon={DollarSign} color="bg-blue-500/10 text-blue-600 dark:text-blue-400" />
        <KpiCard label="Impressions" value={fmtNum(totals.impressions)} icon={Globe} color="bg-violet-500/10 text-violet-500" />
        <KpiCard label="Clicks" value={fmtNum(totals.clicks)} sub={ctr ? `CTR ${ctr}%` : undefined} icon={MousePointer} color="bg-amber-500/10 text-amber-600" />
        <KpiCard label="Leads" value={fmtNum(totals.leads)} sub={cpl ? `CPL ₹${cpl}` : undefined} icon={Users} color="bg-emerald-500/10 text-emerald-600" />
        <KpiCard label="Conversations" value={fmtNum(totals.conversations)} icon={MessageSquare} color="bg-blue-500/10 text-blue-500" />
        <KpiCard label="Bookings" value={fmtNum(totals.bookings)} icon={CheckCircle} color="bg-emerald-500/10 text-emerald-600" />
      </div>

      {/* Two-column: Campaign info + Ad Sets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaign details */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-bold text-foreground">Campaign Details</h2>
          <dl className="space-y-2.5 text-sm">
            {[
              { label: "Objective", value: campaign.objective?.replace("_", " ") || "—" },
              { label: "Status", value: statusCfg.label },
              { label: "Budget Type", value: campaign.budget_type === "daily" ? "Daily Budget" : "Lifetime Budget" },
              { label: "Budget", value: fmtCurrency(campaign.budget_amount) },
              { label: "Start Date", value: campaign.start_date ? new Date(campaign.start_date).toLocaleDateString() : "—" },
              { label: "End Date", value: campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : "No end date" },
              { label: "Leads", value: String(campaign.lead_count ?? 0) },
              { label: "Created", value: new Date(campaign.created_at).toLocaleDateString() },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
                <dt className="text-muted-foreground font-medium">{label}</dt>
                <dd className="text-foreground font-semibold capitalize">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Ad Sets */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground mb-3">Ad Sets ({campaign.adsets?.length ?? 0})</h2>
          {!campaign.adsets?.length ? (
            <p className="text-xs text-muted-foreground">No ad sets yet. Publish this campaign to create one.</p>
          ) : (
            <div className="space-y-2">
              {campaign.adsets.map((adset: any) => (
                <div key={adset.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-foreground">{adset.name}</p>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                      adset.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-600" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
                    )}>
                      {adset.status}
                    </span>
                  </div>
                  {adset.targeting && (
                    <p className="text-[11px] text-muted-foreground">
                      Ages {adset.targeting.age_min}–{adset.targeting.age_max}
                      {adset.targeting.genders?.length ? ` · ${adset.targeting.genders[0] === 1 ? "Men" : adset.targeting.genders[0] === 2 ? "Women" : "All genders"}` : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ads */}
      {campaign.ads && campaign.ads.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground mb-3">Ads ({campaign.ads.length})</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {campaign.ads.map((ad: any) => (
              <div key={ad.id} className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
                {ad.creative_image_url && (
                  <img src={ad.creative_image_url} alt="Ad creative" className="w-full h-32 object-cover" />
                )}
                <div className="p-3">
                  <p className="text-xs font-bold text-foreground">{ad.creative_headline || "Untitled Ad"}</p>
                  {ad.creative_body && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{ad.creative_body}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                      ad.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-600" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
                    )}>
                      {ad.status || "Draft"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{ad.creative_cta_type?.replace("_", " ") || ""}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analytics table */}
      {campaign.analytics && campaign.analytics.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground">Daily Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60">
                  {["Date", "Impressions", "Clicks", "Spend", "Leads", "Conversations", "Bookings"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {campaign.analytics.slice().reverse().map((row: any) => (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground">{row.date}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{(row.impressions || 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{(row.clicks || 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">₹{(row.spend || 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.leads || 0}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.conversations || 0}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.bookings || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
