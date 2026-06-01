"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, X, Network, Play, Clock, FileText, CheckCircle2,
  BarChart3, Trash2, Zap, MoreHorizontal, Users, Send,
  TrendingUp, Eye, RefreshCw, ChevronRight, Calendar,
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { BroadcastBuilder } from './BroadcastBuilder';
import type { Campaign, CampaignStatus } from './BroadcastBuilder';

// ── Filter config ──────────────────────────────────────────────────────────────
const FILTERS = [
  { id: 'all',       label: 'All Campaigns',  icon: Network     },
  { id: 'sending',   label: 'Sending',         icon: Play        },
  { id: 'scheduled', label: 'Scheduled',       icon: Clock       },
  { id: 'draft',     label: 'Drafts',          icon: FileText    },
  { id: 'completed', label: 'Completed',       icon: CheckCircle2 },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatScheduled(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.round(diff / 86400000);
  if (days === 0) return `Today ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  if (days === 1) return `Tomorrow ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function cleanCampaignName(name: string): { display: string; isRetarget: boolean } {
  if (name.startsWith('__retarget:')) {
    const endIdx = name.indexOf('__:');
    if (endIdx !== -1) return { display: name.slice(endIdx + 3), isRetarget: true };
  }
  return { display: name, isRetarget: false };
}

function deliveryRate(c: Campaign) {
  return c.sent_count > 0 ? Math.round((c.delivered_count / c.sent_count) * 100) : 0;
}

function readRate(c: Campaign) {
  return c.sent_count > 0 ? Math.round((c.read_count / c.sent_count) * 100) : 0;
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: CampaignStatus }) {
  const cfgMap: Record<string, { label: string; cls: string; dot: boolean }> = {
    sending:   { label: 'Sending',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',  dot: true  },
    scheduled: { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700 border-blue-200',            dot: false },
    draft:     { label: 'Draft',     cls: 'bg-secondary text-muted-foreground border-border/60', dot: false },
    completed: { label: 'Completed', cls: 'bg-secondary text-muted-foreground border-border/50', dot: false },
    failed:    { label: 'Failed',    cls: 'bg-red-50 text-red-600 border-red-200',               dot: false },
    paused:    { label: 'Paused',    cls: 'bg-amber-50 text-amber-700 border-amber-200',         dot: false },
    retrying:  { label: 'Retrying',  cls: 'bg-orange-50 text-orange-700 border-orange-200',      dot: true  },
    archived:  { label: 'Archived',  cls: 'bg-secondary text-muted-foreground/60 border-border', dot: false },
    cancelled: { label: 'Cancelled', cls: 'bg-secondary text-muted-foreground/60 border-border', dot: false },
  };
  const cfg = cfgMap[status] ?? { label: status, cls: 'bg-secondary text-muted-foreground border-border', dot: false };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${cfg.cls}`}>
      {cfg.dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
        </span>
      )}
      {cfg.label}
    </span>
  );
}

// ── Mini Delivery Bar ─────────────────────────────────────────────────────────
function MiniDeliveryBar({ campaign }: { campaign: Campaign }) {
  if (campaign.sent_count === 0) return null;
  const del = deliveryRate(campaign);
  const read = readRate(campaign);
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-border/40 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-400 rounded-full transition-all duration-700" style={{ width: `${del}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground/70 tabular-nums w-8 text-right">{del}%</span>
        <span className="text-[10px] text-muted-foreground/50">delivered</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-border/40 rounded-full overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full transition-all duration-700" style={{ width: `${read}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground/70 tabular-nums w-8 text-right">{read}%</span>
        <span className="text-[10px] text-muted-foreground/50">read</span>
      </div>
    </div>
  );
}

// ── Campaign Row Card ─────────────────────────────────────────────────────────
function CampaignCard({
  campaign, index, onEdit, onAnalytics, onSend, onDelete, sending,
}: {
  campaign: Campaign;
  index: number;
  onEdit: (c: Campaign) => void;
  onAnalytics: (c: Campaign) => void;
  onSend: (id: string) => void;
  onDelete: (id: string) => void;
  sending: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { display: cleanName, isRetarget } = cleanCampaignName(campaign.name);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
      className={`group relative rounded-xl border transition-all duration-200 cursor-pointer ${
        campaign.status === 'sending'
          ? 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/60'
          : campaign.status === 'draft'
          ? 'border-dashed border-border/70 bg-transparent hover:bg-foreground/[0.015]'
          : 'border-border/70 bg-transparent hover:bg-foreground/[0.015] hover:border-border'
      }`}
      onClick={() => onEdit(campaign)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onEdit(campaign)}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-stretch gap-0">
        {/* Left content */}
        <div className="flex-1 min-w-0 p-4 sm:p-5">
          {/* Top row: badges */}
          <div className="flex items-center gap-2 flex-wrap mb-2.5">
            <StatusBadge status={campaign.status} />
            {isRetarget && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200">
                <Zap className="w-2.5 h-2.5" /> Retarget
              </span>
            )}
            {campaign.scheduled_at && campaign.status === 'scheduled' && (
              <span className="inline-flex items-center gap-1 text-[11px] text-blue-600">
                <Calendar className="w-3 h-3" />
                {formatScheduled(campaign.scheduled_at)}
              </span>
            )}
          </div>

          {/* Campaign name */}
          <h3 className="text-[14px] font-semibold text-foreground/90 truncate leading-snug mb-1.5">
            {cleanName}
          </h3>

          {/* Template + date */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-secondary text-muted-foreground border border-border/50 truncate max-w-[180px]">
              {campaign.template_name}
            </span>
            <span className="text-[11px] text-muted-foreground/50">
              {formatDate(campaign.created_at)}
            </span>
          </div>

          {/* Mini delivery bar */}
          <MiniDeliveryBar campaign={campaign} />
        </div>

        {/* Metrics column */}
        {(campaign.sent_count > 0 || campaign.audience_count > 0) && (
          <div className="flex sm:flex-col items-center sm:items-end justify-start sm:justify-center gap-4 sm:gap-1.5 px-4 sm:px-5 pb-4 sm:py-5 sm:border-l sm:border-border/40 shrink-0">
            <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2.5">
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[13px] font-semibold text-foreground/80 tabular-nums">{campaign.audience_count.toLocaleString()}</span>
              </div>
              {campaign.sent_count > 0 && (
                <div className="flex items-center gap-1.5">
                  <Send className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[13px] font-semibold text-foreground/80 tabular-nums">{campaign.sent_count.toLocaleString()}</span>
                </div>
              )}
              {campaign.read_count > 0 && (
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-[13px] font-semibold text-foreground/80 tabular-nums">{campaign.read_count.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hover action bar */}
      <div
        className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-background/95 backdrop-blur-sm border border-border/80 rounded-lg px-1.5 py-1 shadow-sm z-10"
        onClick={e => e.stopPropagation()}
      >
        {campaign.status === 'draft' && (
          <button
            onClick={() => onSend(campaign.id)}
            disabled={sending}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors disabled:opacity-40"
          >
            <Send className="w-3 h-3" /> Send
          </button>
        )}
        <button
          onClick={() => onAnalytics(campaign)}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
          title="Analytics"
        >
          <BarChart3 className="w-3.5 h-3.5" />
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full mt-1.5 w-40 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 py-1"
              >
                <button
                  onClick={() => { onDelete(campaign.id); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function CampaignSkeleton({ i }: { i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: i * 0.05 }}
      className="rounded-xl border border-border/60 p-5 space-y-3 animate-pulse"
    >
      <div className="flex items-center gap-2">
        <div className="h-5 w-16 bg-secondary rounded-md" />
        <div className="h-5 w-24 bg-secondary rounded-md" />
      </div>
      <div className="h-4 w-2/3 bg-secondary rounded" />
      <div className="h-3 w-1/3 bg-secondary rounded" />
    </motion.div>
  );
}

// ── Analytics Panel ───────────────────────────────────────────────────────────
function AnalyticsPanel({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const { display: name } = cleanCampaignName(campaign.name);
  const del = deliveryRate(campaign);
  const read = readRate(campaign);

  const metrics = [
    { label: 'Audience',  value: campaign.audience_count,  icon: Users,    color: 'text-foreground' },
    { label: 'Sent',      value: campaign.sent_count,       icon: Send,     color: 'text-foreground' },
    { label: 'Delivered', value: campaign.delivered_count,  icon: TrendingUp, color: 'text-emerald-600' },
    { label: 'Read',      value: campaign.read_count,       icon: Eye,      color: 'text-blue-600' },
  ];

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
      className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-card border-l border-border shadow-2xl z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-foreground/70" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-foreground tracking-tight">Analytics</h2>
            <p className="text-[11px] text-muted-foreground truncate max-w-[260px]">{name}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {/* Status */}
        <div className="flex items-center gap-2">
          <StatusBadge status={campaign.status} />
          {campaign.scheduled_at && (
            <span className="text-[12px] text-muted-foreground">
              {formatScheduled(campaign.scheduled_at)}
            </span>
          )}
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-3">
          {metrics.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="p-4 border border-border/60 rounded-xl bg-background">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{label}</span>
              </div>
              <p className={`text-[26px] font-semibold leading-none tabular-nums ${color}`}>{(value || 0).toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* Delivery funnel */}
        {campaign.sent_count > 0 && (
          <div className="space-y-4 p-4 border border-border/60 rounded-xl bg-background">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Delivery Funnel</p>
            {[
              { label: 'Delivery rate', value: campaign.delivered_count, max: campaign.sent_count, color: 'bg-emerald-400', pct: del },
              { label: 'Read rate',     value: campaign.read_count,      max: campaign.sent_count, color: 'bg-blue-400',    pct: read },
              ...(campaign.failed_count > 0 ? [{ label: 'Failed', value: campaign.failed_count, max: campaign.sent_count, color: 'bg-red-400', pct: Math.round((campaign.failed_count / campaign.sent_count) * 100) }] : []),
            ].map(({ label, color, pct }) => (
              <div key={label} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-foreground/80">{label}</span>
                  <span className="text-[12px] font-bold text-foreground tabular-nums">{pct}%</span>
                </div>
                <div className="h-2 bg-secondary/60 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full rounded-full ${color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Retarget prompt */}
        {campaign.status === 'completed' && (
          <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-3">
            <Zap className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-foreground">Re-engage unread contacts</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {Math.max(0, (campaign.sent_count || 0) - (campaign.read_count || 0))} contacts didn't read this campaign.
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function BroadcastClient() {
  const supabase = createBrowserSupabaseClient();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);

  // Panel state
  const [builderCampaign, setBuilderCampaign] = useState<Campaign | null | 'new'>(null); // null=list, 'new'=new, Campaign=edit
  const [analyticsCampaign, setAnalyticsCampaign] = useState<Campaign | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('broadcast_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Failed to load campaigns');
    else setCampaigns((data ?? []) as Campaign[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCampaigns();
    const handleClick = () => setActiveDropdown(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [fetchCampaigns]);

  // Aggregated stats
  const stats = useMemo(() => {
    const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
    const totalDelivered = campaigns.reduce((s, c) => s + (c.delivered_count || 0), 0);
    const totalRead = campaigns.reduce((s, c) => s + (c.read_count || 0), 0);
    return {
      totalSent,
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
      readRate: totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0,
    };
  }, [campaigns]);

  const filteredCampaigns = useMemo(() =>
    campaigns.filter(c => {
      if (searchQuery && !cleanCampaignName(c.name).display.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (activeFilter === 'all') return true;
      return c.status === activeFilter;
    }),
    [campaigns, searchQuery, activeFilter]
  );

  const handleSend = async (id: string) => {
    setSending(true);
    try {
      const res = await fetch('/api/broadcasts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Campaign sending started');
      fetchCampaigns();
    } catch (err) {
      toast.error((err as Error).message || 'Failed to send campaign');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    try {
      await supabase.from('broadcast_campaigns').delete().eq('id', id);
      toast.success('Campaign deleted');
      fetchCampaigns();
    } catch {
      toast.error('Failed to delete campaign');
    }
  };

  // ── Builder mode ─────────────────────────────────────────────────────────────
  if (builderCampaign !== null) {
    return (
      <div className="h-full overflow-hidden">
        <BroadcastBuilder
          campaign={builderCampaign === 'new' ? null : builderCampaign}
          allCampaigns={campaigns}
          onClose={() => setBuilderCampaign(null)}
          onSaved={() => { setBuilderCampaign(null); fetchCampaigns(); }}
        />
      </div>
    );
  }

  // ── List mode ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full bg-background text-foreground overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-60 border-r border-border/60 hidden md:flex flex-col bg-card/30 shrink-0">
        <div className="flex-1 p-4 space-y-0.5">
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/50 px-2 pb-2 pt-1">Campaigns</p>
          {FILTERS.map(f => {
            const count = f.id === 'all' ? campaigns.length : campaigns.filter(c => c.status === f.id).length;
            const isActive = activeFilter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-all duration-150 ${
                  isActive
                    ? 'bg-foreground/[0.06] text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <f.icon className={`w-3.5 h-3.5 ${isActive ? 'text-foreground/80' : 'text-muted-foreground/50'}`} />
                  {f.label}
                </div>
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold tabular-nums ${
                    isActive ? 'bg-background/80 text-foreground/70 shadow-sm' : 'text-muted-foreground/50'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar stats */}
        {campaigns.length > 0 && (
          <div className="border-t border-border/50 p-4 space-y-3">
            <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/50">All Time</p>
            <div className="space-y-2">
              {[
                { label: 'Messages sent',  value: stats.totalSent.toLocaleString() },
                { label: 'Delivery rate',  value: `${stats.deliveryRate}%`, color: stats.deliveryRate >= 90 ? 'text-emerald-600' : stats.deliveryRate >= 70 ? 'text-amber-500' : 'text-red-500' },
                { label: 'Read rate',      value: `${stats.readRate}%`,     color: stats.readRate >= 60 ? 'text-emerald-600' : stats.readRate >= 35 ? 'text-amber-500' : 'text-muted-foreground' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[12px] text-muted-foreground">{label}</span>
                  <span className={`text-[12px] font-semibold tabular-nums ${color ?? 'text-foreground/80'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-[60px] border-b border-border/60 flex items-center justify-between px-6 shrink-0 bg-background/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-4 flex-1">
            <h1 className="text-[15px] font-semibold text-foreground/90 tracking-tight">Campaigns</h1>
            <div className="relative group hidden md:flex items-center max-w-xs w-full">
              <Search className="absolute left-3 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none group-focus-within:text-indigo-500/60 transition-colors" />
              <input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-9 pr-3 bg-secondary/50 border border-transparent hover:border-border/60 focus:border-indigo-500/30 focus:bg-background rounded-lg text-[13px] outline-none transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 text-muted-foreground/50 hover:text-muted-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchCampaigns()}
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setBuilderCampaign('new')}
              className="h-8 px-4 text-[12px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New Broadcast
            </button>
          </div>
        </header>

        {/* Campaign list */}
        <div className="flex-1 overflow-auto p-5 lg:p-6 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col gap-3 max-w-[900px]">
              {[0, 1, 2, 3].map(i => <CampaignSkeleton key={i} i={i} />)}
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-14 h-14 bg-card border border-border/60 rounded-2xl flex items-center justify-center mb-5 shadow-sm">
                <Zap className="w-5 h-5 text-indigo-500" />
              </div>
              <h3 className="text-[15px] font-semibold text-foreground mb-1.5">
                {searchQuery ? 'No campaigns found' : 'Create your first broadcast'}
              </h3>
              <p className="text-[13px] text-muted-foreground mb-6 max-w-[280px] leading-relaxed">
                {searchQuery
                  ? 'Try a different search term or clear your filter.'
                  : 'Send WhatsApp campaigns to your contacts and track delivery in real time.'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setBuilderCampaign('new')}
                  className="h-9 px-5 text-[13px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" /> New Broadcast
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 max-w-[900px]">
              {filteredCampaigns.map((campaign, i) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  index={i}
                  onEdit={c => setBuilderCampaign(c)}
                  onAnalytics={c => setAnalyticsCampaign(c)}
                  onSend={handleSend}
                  onDelete={handleDelete}
                  sending={sending}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Analytics Panel Overlay */}
      <AnimatePresence>
        {analyticsCampaign && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAnalyticsCampaign(null)}
              className="fixed inset-0 bg-background/50 backdrop-blur-[2px] z-40"
            />
            <AnalyticsPanel
              campaign={analyticsCampaign}
              onClose={() => setAnalyticsCampaign(null)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
