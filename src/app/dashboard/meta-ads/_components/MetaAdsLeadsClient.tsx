"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Phone, Search, Loader2, ChevronRight,
  ChevronLeft, Tag, Calendar, Target, MessageSquare,
  CheckCircle, XCircle, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CampaignLead, LeadSource } from "@/lib/meta-ads/types";

const STATUS_COLOR: Record<string, string> = {
  new:       "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  contacted: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  qualified: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  converted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  lost:      "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
};

const SOURCE_LABEL: Record<LeadSource, string> = {
  ctwa:               "Click-to-WhatsApp",
  lead_form:          "Lead Form",
  sponsored_message:  "Sponsored Message",
  manual:             "Manual",
};

function AttributionTimeline({ leadId }: { leadId: string }) {
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/meta-ads/leads/${leadId}`)
      .then((r) => r.json())
      .then((d) => { setTimeline(d.timeline || []); })
      .finally(() => setLoading(false));
  }, [leadId]);

  const EVENT_ICON: Record<string, React.ReactNode> = {
    ad_click:          <Target className="h-3 w-3 text-blue-500" />,
    whatsapp_open:     <MessageSquare className="h-3 w-3 text-emerald-500" />,
    message_sent:      <MessageSquare className="h-3 w-3 text-violet-500" />,
    booking_confirmed: <CheckCircle className="h-3 w-3 text-emerald-500" />,
    lead_qualified:    <CheckCircle className="h-3 w-3 text-amber-500" />,
    ai_response:       <MessageSquare className="h-3 w-3 text-muted-foreground" />,
  };
  const EVENT_LABEL: Record<string, string> = {
    ad_impression:      "Viewed Ad",
    ad_click:           "Clicked Ad",
    whatsapp_open:      "Opened WhatsApp",
    message_sent:       "Sent First Message",
    message_received:   "Received Reply",
    ai_response:        "AI Responded",
    booking_started:    "Started Booking",
    booking_confirmed:  "Booking Confirmed 🎉",
    payment_made:       "Payment Made",
    lead_qualified:     "Lead Qualified",
    lead_converted:     "Converted",
    custom:             "Event",
  };

  if (loading) return <div className="py-3 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>;
  if (timeline.length === 0) return <p className="text-xs text-muted-foreground py-3">No attribution events yet.</p>;

  return (
    <div className="space-y-2 py-2">
      {timeline.map((event, i) => (
        <div key={event.id} className="flex items-start gap-2.5">
          <div className="relative mt-0.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted border border-border">
              {EVENT_ICON[event.event_type] || <Clock className="h-3 w-3 text-muted-foreground" />}
            </div>
            {i < timeline.length - 1 && (
              <div className="absolute left-1/2 top-5 -translate-x-1/2 h-3 w-px bg-border" />
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">{EVENT_LABEL[event.event_type] || event.event_type}</p>
            <p className="text-[10px] text-muted-foreground">{new Date(event.created_at).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MetaAdsLeadsClient() {
  const [leads, setLeads] = useState<(CampaignLead & { meta_campaigns?: any })[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page), limit: "20",
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      });
      const res = await fetch(`/api/meta-ads/leads?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
        setPagination(data.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { load(1); }, [load]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Ad Leads</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{pagination.total} leads from Meta campaigns</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {[{ v: "", l: "All" }, { v: "new", l: "New" }, { v: "qualified", l: "Qualified" }, { v: "converted", l: "Converted" }].map(({ v, l }) => (
            <button key={v} onClick={() => setStatusFilter(v)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-all", statusFilter === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Leads list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 mb-4">
              <Phone className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground">No ad leads yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Leads from Meta Click-to-WhatsApp campaigns will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {leads.map((lead) => (
              <div key={lead.id}>
                <button
                  onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                  className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-muted/30 transition-colors group"
                >
                  {/* Avatar */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-sm font-bold text-blue-600 dark:text-blue-400">
                    {(lead.name || lead.phone)?.[0]?.toUpperCase() || "?"}
                  </div>
                  {/* Name + phone */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{lead.name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{lead.phone}</p>
                  </div>
                  {/* Campaign */}
                  {lead.meta_campaigns && (
                    <div className="hidden sm:block text-right shrink-0">
                      <p className="text-xs font-medium text-foreground truncate max-w-[140px]">{lead.meta_campaigns.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{(lead.meta_campaigns.objective || "").replace("_", " ").toLowerCase()}</p>
                    </div>
                  )}
                  {/* Source badge */}
                  <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                    <Target className="h-2.5 w-2.5" />
                    {SOURCE_LABEL[lead.source] || lead.source}
                  </span>
                  {/* Status */}
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", STATUS_COLOR[lead.status] || "")}>
                    {lead.status}
                  </span>
                  {/* Booking icon */}
                  {lead.booking_made && <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />}
                  {/* Headline */}
                  {lead.referral_headline && (
                    <span className="hidden lg:block text-xs text-muted-foreground italic truncate max-w-[120px]">"{lead.referral_headline}"</span>
                  )}
                  {/* Date */}
                  <span className="text-xs text-muted-foreground shrink-0">{new Date(lead.created_at).toLocaleDateString()}</span>
                  {/* Expand chevron */}
                  <ChevronRight className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", expandedId === lead.id ? "rotate-90" : "group-hover:translate-x-0.5")} />
                </button>

                {/* Attribution timeline (expanded) */}
                {expandedId === lead.id && (
                  <div className="px-6 pb-4 bg-muted/20 border-t border-border/30">
                    <div className="max-w-lg ml-14">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide pt-3 mb-2">Attribution Timeline</p>
                      <AttributionTimeline leadId={lead.id} />
                      {lead.referral_headline && (
                        <div className="mt-3 rounded-xl border border-border/60 bg-background p-3">
                          <p className="text-xs font-semibold text-muted-foreground">Ad That Brought This Lead</p>
                          <p className="text-sm font-semibold text-foreground mt-0.5">"{lead.referral_headline}"</p>
                          {lead.referral_body && <p className="text-xs text-muted-foreground mt-0.5">{lead.referral_body}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <p className="text-xs text-muted-foreground">{pagination.total} leads</p>
          <div className="flex items-center gap-1">
            <button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-3 text-xs text-muted-foreground">{pagination.page} / {pagination.total_pages}</span>
            <button disabled={pagination.page >= pagination.total_pages} onClick={() => load(pagination.page + 1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
