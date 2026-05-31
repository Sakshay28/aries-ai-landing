"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Send, Play, Clock, FileText, Activity, Users, Zap, Search,
  MoreHorizontal, X, BarChart3, Trash2, Network, CheckCircle2, AlertCircle
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { BroadcastPanel } from './BroadcastPanel';

// ── Types ────────────────────────────────────────────────────────────────────
type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';

interface Campaign {
  id: string;
  name: string;
  template_name: string;
  status: CampaignStatus;
  audience_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  scheduled_at: string | null;
  created_at: string;
}

// ── Filter config ─────────────────────────────────────────────────────────────
const FILTERS = [
  { id: 'all',       label: 'All Campaigns', icon: Network    },
  { id: 'sending',   label: 'Sending',       icon: Play       },
  { id: 'scheduled', label: 'Scheduled',     icon: Clock      },
  { id: 'draft',     label: 'Drafts',        icon: FileText   },
  { id: 'completed', label: 'Completed',     icon: CheckCircle2 },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function cleanCampaignName(name: string): { display: string; isRetarget: boolean } {
  if (name.startsWith('__retarget:')) {
    const endIdx = name.indexOf('__:');
    if (endIdx !== -1) return { display: name.slice(endIdx + 3), isRetarget: true };
  }
  return { display: name, isRetarget: false };
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: CampaignStatus }) {
  const cfg = {
    sending:   { label: 'Sending',   cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', dot: true  },
    scheduled: { label: 'Scheduled', cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20',         dot: false },
    draft:     { label: 'Draft',     cls: 'bg-secondary/60 text-muted-foreground border-border/60',  dot: false },
    completed: { label: 'Completed', cls: 'bg-secondary/60 text-muted-foreground border-border/50',  dot: false },
    failed:    { label: 'Failed',    cls: 'bg-red-500/10 text-red-600 border-red-500/20',             dot: false },
  }[status] ?? { label: status, cls: 'bg-secondary text-muted-foreground border-border', dot: false };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-wider border ${cfg.cls}`}>
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

// ── Metric Cell ───────────────────────────────────────────────────────────────
function MetricCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[52px]">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">{label}</span>
      <span className="text-[18px] font-semibold text-foreground/90 leading-none tabular-nums">{(value ?? 0).toLocaleString()}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function BroadcastClient() {
  const supabase = createBrowserSupabaseClient();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Panel state
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [panelMode, setPanelMode] = useState<'edit' | 'analytics' | 'new' | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [editName, setEditName] = useState('');
  const [editTemplate, setEditTemplate] = useState('');
  const [audienceType, setAudienceType] = useState<'all' | 'retarget'>('all');
  const [retargetParentId, setRetargetParentId] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [approvedTemplates, setApprovedTemplates] = useState<{ name: string; body: string }[]>([]);

  // ── Data fetching ───────────────────────────────────────────────────────────
  const fetchCampaigns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('broadcast_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Failed to load campaigns');
    } else {
      setCampaigns((data ?? []) as Campaign[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCampaigns();
    fetch('/api/dashboard/templates')
      .then(r => r.json())
      .then(j => {
        if (j.success && Array.isArray(j.data)) {
          setApprovedTemplates(
            j.data
              .filter((t: { status: string }) => t.status === 'APPROVED')
              .map((t: { name: string; components?: { type: string; text?: string }[] }) => ({
                name: t.name,
                body: t.components?.find(c => c.type === 'BODY')?.text || '',
              }))
          );
        }
      })
      .catch(() => {});

    const handleClick = () => setActiveDropdown(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // ── Derived stats ───────────────────────────────────────────────────────────
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

  // ── Panel handlers ──────────────────────────────────────────────────────────
  const openPanel = (campaign: Campaign | null, mode: 'edit' | 'analytics' | 'new', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedCampaign(campaign);
    setPanelMode(mode);
    setActiveDropdown(null);

    if (campaign) {
      const { display } = cleanCampaignName(campaign.name);
      const isRetarget = campaign.name.startsWith('__retarget:');
      setEditName(display);
      setAudienceType(isRetarget ? 'retarget' : 'all');
      if (isRetarget) {
        const parentId = campaign.name.slice(11, campaign.name.indexOf('__:'));
        setRetargetParentId(parentId);
      } else {
        setRetargetParentId(null);
      }
      setEditTemplate(campaign.template_name);
      if (campaign.scheduled_at) {
        const date = new Date(campaign.scheduled_at);
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
        setScheduledAt(local.toISOString().slice(0, 16));
      } else {
        setScheduledAt(null);
      }
    } else {
      setEditName('');
      setEditTemplate('');
      setAudienceType('all');
      setRetargetParentId(null);
      setScheduledAt(null);
    }
  };

  const handleRetargetAction = (parentCampaign: Campaign) => {
    const { display } = cleanCampaignName(parentCampaign.name);
    setSelectedCampaign(null);
    setPanelMode('new');
    setEditName(`Retarget: ${display}`);
    setEditTemplate(parentCampaign.template_name);
    setAudienceType('retarget');
    setRetargetParentId(parentCampaign.id);
    setScheduledAt(null);
    setActiveDropdown(null);
  };

  const closePanel = () => {
    setSelectedCampaign(null);
    setPanelMode(null);
  };

  const toggleDropdown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveDropdown(activeDropdown === id ? null : id);
  };

  // ── CRUD ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editName.trim()) { toast.error('Campaign name is required'); return; }
    setSaving(true);
    try {
      if (panelMode === 'new') {
        const { data: tenantData } = await supabase.from('tenants').select('id').single();
        if (!tenantData) throw new Error('No tenant found');

        let finalName = editName;
        let finalAudienceCount = 0;

        if (audienceType === 'retarget' && retargetParentId) {
          finalName = `__retarget:${retargetParentId}__:${editName}`;
          const parent = campaigns.find(c => c.id === retargetParentId);
          if (parent) finalAudienceCount = Math.max(0, (parent.sent_count || 0) - (parent.read_count || 0));
        } else {
          const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).not('phone', 'is', null);
          finalAudienceCount = count || 0;
        }

        const { error } = await supabase.from('broadcast_campaigns').insert({
          tenant_id: tenantData.id,
          name: finalName,
          template_name: editTemplate,
          audience_count: finalAudienceCount,
          status: scheduledAt ? 'scheduled' : 'draft',
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        });
        if (error) throw error;
        toast.success(scheduledAt ? 'Campaign scheduled' : 'Campaign saved as draft');

      } else if (selectedCampaign) {
        let finalName = editName;
        let finalAudienceCount = selectedCampaign.audience_count;
        if (audienceType === 'retarget' && retargetParentId) {
          finalName = `__retarget:${retargetParentId}__:${editName}`;
          const parent = campaigns.find(c => c.id === retargetParentId);
          if (parent) finalAudienceCount = Math.max(0, (parent.sent_count || 0) - (parent.read_count || 0));
        }
        const { error } = await supabase.from('broadcast_campaigns').update({
          name: finalName,
          template_name: editTemplate,
          audience_count: finalAudienceCount,
          status: scheduledAt ? 'scheduled' : 'draft',
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }).eq('id', selectedCampaign.id);
        if (error) throw error;
        toast.success('Campaign updated');
      }

      closePanel();
      fetchCampaigns();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save campaign');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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
      if (panelMode) closePanel();
    } catch (err) {
      toast.error((err as Error).message || 'Failed to send campaign');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    try {
      await supabase.from('broadcast_campaigns').delete().eq('id', id);
      toast.success('Campaign deleted');
      fetchCampaigns();
      if (selectedCampaign?.id === id) closePanel();
    } catch {
      toast.error('Failed to delete campaign');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full bg-background text-foreground overflow-hidden">

      {/* ── Left Sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-60 border-r border-border/60 hidden md:flex flex-col bg-card/20 shrink-0">
        <div className="flex-1 p-4 space-y-1">
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/60 px-2 pb-2">Campaigns</p>
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
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">Messages sent</span>
                <span className="text-[12px] font-semibold text-foreground/90 tabular-nums">{stats.totalSent.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">Delivery rate</span>
                <span className={`text-[12px] font-semibold tabular-nums ${stats.deliveryRate >= 90 ? 'text-emerald-600' : stats.deliveryRate >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
                  {stats.deliveryRate}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">Read rate</span>
                <span className={`text-[12px] font-semibold tabular-nums ${stats.readRate >= 60 ? 'text-emerald-600' : stats.readRate >= 35 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {stats.readRate}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="h-[60px] border-b border-border/60 flex items-center justify-between px-6 shrink-0 bg-background/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-4 flex-1">
            <h1 className="text-[15px] font-semibold text-foreground/90 tracking-tight">Campaigns</h1>
            <div className="relative group hidden md:flex items-center max-w-xs w-full">
              <Search className="absolute left-3 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none group-focus-within:text-indigo-500/60 transition-colors" />
              <input
                type="text"
                placeholder="Search..."
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
          <button
            onClick={() => openPanel(null, 'new')}
            className="h-8 px-4 text-[12px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            New Broadcast
          </button>
        </header>

        {/* Campaign list */}
        <div className="flex-1 overflow-auto p-5 lg:p-6 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-32 text-[13px] text-muted-foreground">
              <div className="flex flex-col items-center gap-3">
                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                Loading campaigns...
              </div>
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
                  : 'Send WhatsApp campaigns to your contacts and track delivery in real time.'
                }
              </p>
              {!searchQuery && (
                <button
                  onClick={() => openPanel(null, 'new')}
                  className="h-9 px-5 text-[13px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" /> New Broadcast
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 max-w-[1200px]">
              {filteredCampaigns.map((campaign, i) => {
                const { display: cleanName, isRetarget } = cleanCampaignName(campaign.name);
                return (
                  <motion.div
                    key={campaign.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                    onClick={() => openPanel(campaign, 'edit')}
                    className={`group relative flex flex-col xl:flex-row items-start xl:items-center gap-4 xl:gap-6 px-5 py-4 border rounded-xl cursor-pointer transition-all duration-200 ${
                      campaign.status === 'sending'
                        ? 'border-emerald-500/25 bg-emerald-500/[0.02] hover:bg-emerald-500/[0.04]'
                        : campaign.status === 'draft'
                        ? 'border-dashed border-border/70 bg-transparent hover:bg-foreground/[0.02]'
                        : 'border-border/70 bg-transparent hover:bg-foreground/[0.02]'
                    }`}
                  >
                    {/* Left — name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <StatusBadge status={campaign.status} />
                        {isRetarget && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[10px] font-bold bg-indigo-500/8 text-indigo-500 border border-indigo-500/15">
                            <Zap className="w-2.5 h-2.5" /> Retarget
                          </span>
                        )}
                      </div>

                      <h3 className="text-[15px] font-semibold text-foreground/90 truncate mb-1.5">{cleanName}</h3>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-[5px] text-[11px] font-medium bg-secondary/60 text-muted-foreground border border-border/50 truncate max-w-[200px]">
                          {campaign.template_name}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60">
                          {campaign.scheduled_at
                            ? `Scheduled for ${formatDate(campaign.scheduled_at)}`
                            : formatDate(campaign.created_at)
                          }
                        </span>
                      </div>
                    </div>

                    {/* Right — metrics */}
                    <div className="flex items-center gap-5 md:gap-6 xl:border-l xl:border-border/40 xl:pl-6 shrink-0">
                      <MetricCell label="Audience" value={campaign.audience_count} />
                      <MetricCell label="Sent" value={campaign.sent_count} />
                      <MetricCell label="Delivered" value={campaign.delivered_count} />
                      <MetricCell label="Read" value={campaign.read_count} />
                      {campaign.failed_count > 0 && (
                        <MetricCell label="Failed" value={campaign.failed_count} />
                      )}
                    </div>

                    {/* Hover action bar */}
                    <div
                      className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-card/95 backdrop-blur-sm border border-border/80 rounded-lg px-2 py-1.5 shadow-md z-10"
                      onClick={e => e.stopPropagation()}
                    >
                      {campaign.status === 'draft' && (
                        <button
                          onClick={e => handleSend(campaign.id, e)}
                          disabled={sending}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors disabled:opacity-40"
                        >
                          <Send className="w-3 h-3" /> Send
                        </button>
                      )}
                      <button
                        onClick={e => openPanel(campaign, 'analytics', e)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                        title="View analytics"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                      </button>
                      <div className="relative">
                        <button
                          onClick={e => toggleDropdown(campaign.id, e)}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                        <AnimatePresence>
                          {activeDropdown === campaign.id && (
                            <motion.div
                              initial={{ opacity: 0, y: 4, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 4, scale: 0.95 }}
                              transition={{ duration: 0.12 }}
                              className="absolute right-0 top-full mt-1.5 w-44 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 py-1"
                            >
                              {campaign.status === 'completed' && (
                                <button
                                  onClick={() => handleRetargetAction(campaign)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
                                >
                                  <Zap className="w-3.5 h-3.5" /> Retarget Campaign
                                </button>
                              )}
                              <button
                                onClick={e => handleDelete(campaign.id, e)}
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
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Slide-in Panel ────────────────────────────────────────────────────── */}
      <BroadcastPanel
        panelMode={panelMode}
        selectedCampaign={selectedCampaign}
        editName={editName}
        editTemplate={editTemplate}
        saving={saving}
        sending={sending}
        onClose={closePanel}
        onSave={handleSave}
        onSend={handleSend}
        setEditName={setEditName}
        setEditTemplate={setEditTemplate}
        approvedTemplates={approvedTemplates}
        audienceType={audienceType}
        setAudienceType={setAudienceType}
        retargetParentId={retargetParentId}
        setRetargetParentId={setRetargetParentId}
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt}
        completedCampaigns={campaigns.filter(c => c.status === 'completed')}
        campaigns={campaigns}
      />
    </div>
  );
}
