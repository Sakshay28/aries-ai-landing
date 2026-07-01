"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Clock, ShieldCheck, Flame, ThermometerSun, Snowflake, Megaphone, Phone, UserCircle2, Star, UserX, Sparkles, Zap, CheckCircle2, Loader2, X } from 'lucide-react';
import type { Lead } from '@/lib/types';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { MessageCircle, MessageSquare } from 'lucide-react';

const STATUS_COLUMNS = [
  { id: 'new',        label: 'New',        color: 'bg-blue-500',    icon: Clock },
  { id: 'interested', label: 'Interested', color: 'bg-orange-400',  icon: MessageSquare },
  { id: 'qualified',  label: 'Qualified',  color: 'bg-violet-500',  icon: Star },
  { id: 'hot',        label: 'Hot',        color: 'bg-red-500',     icon: Flame },
  { id: 'converted',  label: 'Converted',  color: 'bg-emerald-500', icon: ShieldCheck },
  { id: 'cold',       label: 'Cold',       color: 'bg-slate-500',   icon: Snowflake },
  { id: 'lost',       label: 'Lost',       color: 'bg-rose-400',    icon: UserX },
];

type Member = { id: string; full_name: string | null; email: string };

const SOURCE_LABELS: Record<string, string> = {
  meta_ctwa: 'Meta Ad (CTWA)',
  meta_lead_form: 'Meta Lead Form',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  manual: 'Manual',
};

export function LeadsClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  // ── Re-score state ──────────────────────────────────────────────────────
  const [rescoring, setRescoring] = useState(false);
  const [rescoreResult, setRescoreResult] = useState<{
    queued: number;
    skipped_no_conv: number;
    total_leads: number;
    est_completion_min: number;
    message: string;
  } | null>(null);
  const [showRescoreModal, setShowRescoreModal] = useState(false);
  const supabase = createBrowserSupabaseClient();
  const router = useRouter();

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/dashboard/leads');
      const data = await res.json();
      if (data.success) setLeads(data.leads);
    } catch (error) {
      console.error('Failed to fetch leads', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeam = async () => {
    try {
      const res = await fetch('/api/dashboard/team');
      const data = await res.json();
      if (data.success) {
        setMembers((data.users || []).map((u: any) => ({ id: u.id, full_name: u.full_name, email: u.email })));
        setMe(data.me?.id ?? null);
      }
    } catch (error) {
      console.error('Failed to fetch team', error);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/dashboard/campaigns');
      const data = await res.json();
      if (data.success) setCampaigns((data.campaigns || []).map((c: any) => ({ id: c.id, name: c.name })));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchLeads();
    fetchTeam();
    fetchCampaigns();
  }, []);

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, lead_status: newStatus as any } : l));
    const { error } = await supabase.from('leads').update({ lead_status: newStatus }).eq('id', leadId);
    if (error) {
      toast.error('Failed to update lead status');
      fetchLeads();
    } else {
      toast.success('Lead updated');
    }
  };

  // ── Re-score all leads handler ──────────────────────────────────────────
  const handleRescoreAll = async () => {
    if (rescoring) return;
    setRescoring(true);
    setRescoreResult(null);
    setShowRescoreModal(true);
    try {
      const res = await fetch('/api/dashboard/leads/rescore-all', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || 'Re-score failed');
        setShowRescoreModal(false);
      } else {
        setRescoreResult(data);
        // Refresh leads after a short delay so UI reflects queuing
        setTimeout(() => fetchLeads(), 2000);
      }
    } catch {
      toast.error('Network error — re-score failed');
      setShowRescoreModal(false);
    } finally {
      setRescoring(false);
    }
  };

  const assignLead = async (leadId: string, assignedTo: string | null) => {
    const member = assignedTo ? members.find(m => m.id === assignedTo) : null;
    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId
      ? { ...l, assigned_to: assignedTo, assigned_user: member ? { id: member.id, full_name: member.full_name, email: member.email } : null } as any
      : l));

    try {
      const res = await fetch(`/api/dashboard/leads/${leadId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: assignedTo }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to assign');
        fetchLeads();
      } else {
        toast.success(assignedTo ? 'Lead assigned' : 'Unassigned');
      }
    } catch {
      toast.error('Failed to assign');
      fetchLeads();
    }
  };

  const memberLabel = (m: Member) => m.full_name || m.email;

  const filteredLeads = useMemo(() => leads.filter(l => {
    const a = l as any;
    if (searchQuery && !(l.name?.toLowerCase().includes(searchQuery.toLowerCase()) || l.phone?.includes(searchQuery))) return false;
    if (assigneeFilter === 'me' && a.assigned_to !== me) return false;
    if (assigneeFilter === 'unassigned' && a.assigned_to) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'me' && assigneeFilter !== 'unassigned' && a.assigned_to !== assigneeFilter) return false;
    if (sourceFilter !== 'all' && a.source !== sourceFilter) return false;
    if (campaignFilter !== 'all' && a.campaign_id !== campaignFilter) return false;
    return true;
  }), [leads, searchQuery, assigneeFilter, sourceFilter, campaignFilter, me]);

  const getLeadsByStatus = (status: string) => filteredLeads.filter(l => l.lead_status === status);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Loading Pipeline...</p>
        </div>
      </div>
    );
  }

  const selectCls = "h-9 px-3 bg-card/60 border border-border/80 hover:border-border focus:border-indigo-500/30 rounded-lg text-sm transition-all outline-none cursor-pointer";

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      <header className="border-b border-border/60 shrink-0 relative z-20 backdrop-blur-md bg-background/80">
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 lg:px-8 h-[60px] md:h-[72px]">
          <h1 className="text-base md:text-lg font-semibold tracking-tight text-foreground/90 shrink-0">Sales Pipeline</h1>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="hidden md:flex max-w-xs relative group w-full">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground/60 group-focus-within:text-indigo-500/70" />
              </div>
              <input
                type="text"
                placeholder="Search name or phone..."
                className="w-full h-9 pl-10 pr-4 bg-card/60 border border-border/80 hover:border-border focus:border-indigo-500/30 rounded-lg text-sm transition-all outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select className={selectCls} value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} title="Filter by assignee">
              <option value="all">All assignees</option>
              {me && <option value="me">My leads</option>}
              <option value="unassigned">Unassigned</option>
              {members.map(m => <option key={m.id} value={m.id}>{memberLabel(m)}</option>)}
            </select>
            <select className={selectCls} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} title="Filter by source">
              <option value="all">All sources</option>
              <option value="meta_ctwa">Meta Ad (CTWA)</option>
              <option value="meta_lead_form">Meta Lead Form</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
            </select>
            {campaigns.length > 0 && (
              <select className={selectCls} value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} title="Filter by campaign">
                <option value="all">All campaigns</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button
              onClick={handleRescoreAll}
              disabled={rescoring}
              title="Re-score all existing leads with AI"
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-all shadow-sm shrink-0"
            >
              {rescoring
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Zap className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{rescoring ? 'Queuing…' : 'Re-score All'}</span>
            </button>
          </div>
        </div>
        {/* Mobile search row */}
        <div className="md:hidden px-4 pb-3">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <input
              type="text"
              placeholder="Search by name or phone..."
              className="w-full h-9 pl-10 pr-4 bg-card/60 border border-border/80 focus:border-indigo-500/30 rounded-lg text-sm transition-all outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-3 md:p-6 lg:p-8 custom-scrollbar">
        <div className="flex gap-6 h-full min-w-max pb-4">
          {STATUS_COLUMNS.map((column) => {
            const columnLeads = getLeadsByStatus(column.id);
            const Icon = column.icon;

            return (
              <div key={column.id} className="w-[320px] flex flex-col h-full bg-secondary/20 rounded-2xl border border-border/50">
                <div className="p-4 flex items-center justify-between border-b border-border/50 bg-background/50 rounded-t-2xl">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${column.color} bg-opacity-10 text-current`}>
                      <Icon className={`w-4 h-4 ${column.color.replace('bg-', 'text-')}`} />
                    </div>
                    <h3 className="font-semibold text-sm">{column.label}</h3>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    {columnLeads.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                  <AnimatePresence>
                    {columnLeads.map((lead) => {
                      const a = lead as any;
                      return (
                      <motion.div
                        key={lead.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-card p-4 rounded-xl border border-border shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-indigo-500/30 transition-all group"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="font-medium text-sm text-foreground truncate pr-4">
                            {lead.name || 'Unknown Contact'}
                          </div>
                          <div className="flex gap-2 items-center shrink-0">
                            {a.source && SOURCE_LABELS[a.source] && (
                              <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                {(a.source === 'meta_ctwa' || a.source === 'meta_lead_form') && <Megaphone className="w-2.5 h-2.5" />}
                                {SOURCE_LABELS[a.source]}
                              </span>
                            )}
                            {lead.channel === 'whatsapp' ? (
                              <MessageCircle className="w-4 h-4 text-emerald-500" aria-label="WhatsApp" />
                            ) : lead.channel?.includes('instagram') ? (
                              <MessageSquare className="w-4 h-4 text-pink-500" aria-label="Instagram" />
                            ) : null}
                          </div>
                        </div>

                        {a.campaign?.name && (
                          <div className="mb-3 inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                            #{a.campaign.name}
                          </div>
                        )}

                        <div
                          className="space-y-2 mb-3 cursor-pointer"
                          onClick={() => {
                            const convId = a.conversations?.[0]?.id;
                            if (convId) router.push(`/dashboard/chat?conversationId=${convId}`);
                            else toast.error("No active chat for this lead.");
                          }}
                        >
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Phone className="w-3.5 h-3.5" /> {lead.phone || 'No phone'}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" /> Last active: {new Date(lead.updated_at || lead.created_at || Date.now()).toLocaleDateString()}
                          </div>
                        </div>

                        {/* Assignee selector — anyone on the team can reassign */}
                        <div className="flex items-center gap-2 mb-3">
                          <UserCircle2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <select
                            className="flex-1 text-xs bg-background border border-border rounded-md px-2 py-1.5 outline-none focus:border-indigo-500 cursor-pointer truncate"
                            value={a.assigned_to || ''}
                            onChange={(e) => assignLead(lead.id, e.target.value || null)}
                            onClick={(e) => e.stopPropagation()}
                            title="Assign to a teammate"
                          >
                            <option value="">Unassigned</option>
                            {members.map(m => (
                              <option key={m.id} value={m.id}>
                                {memberLabel(m)}{m.id === me ? ' (me)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* CRM AI Insights Section */}
                        {(a.ai_confidence !== null || a.buying_intent !== null || a.ai_reason || a.ai_summary) && (
                          <div className="mt-3 mb-3 p-2.5 rounded-lg bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/10 dark:border-indigo-500/20 text-xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-semibold text-indigo-600 dark:text-indigo-400 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                <Sparkles className="w-3 h-3 animate-pulse" /> AI Insights
                              </span>
                              {a.ai_confidence !== null && (
                                <span className="font-bold text-[9px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20">
                                  {a.ai_confidence}% Match
                                </span>
                              )}
                            </div>
                            {a.ai_summary && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mb-1.5 leading-relaxed">
                                {a.ai_summary}
                              </p>
                            )}
                            <div className="flex gap-1.5 flex-wrap">
                              {a.buying_intent !== null && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" title="Buying Intent Score">
                                  Intent: {a.buying_intent}/100
                                </span>
                              )}
                              {a.booking_probability !== null && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20" title="Booking Probability">
                                  Booking: {a.booking_probability}%
                                </span>
                              )}
                              {a.sentiment && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20" title="Conversation Sentiment">
                                  {a.sentiment}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-3 border-t border-border/50">
                          <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                            lead.lead_score >= 70 ? 'bg-emerald-500/10 text-emerald-500' :
                            lead.lead_score >= 40 ? 'bg-amber-500/10 text-amber-500' :
                            'text-muted-foreground bg-secondary'
                          }`}>
                            Score: {lead.lead_score}
                          </div>
                          <select
                            className="text-xs bg-background border border-border rounded-md px-2 py-1 outline-none focus:border-indigo-500 cursor-pointer"
                            value={lead.lead_status}
                            onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {STATUS_COLUMNS.map(col => (
                              <option key={col.id} value={col.id}>{col.label}</option>
                            ))}
                          </select>
                        </div>
                      </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {columnLeads.length === 0 && (
                    <div className="h-32 flex items-center justify-center border-2 border-dashed border-border/40 rounded-xl text-muted-foreground text-xs font-medium">
                      No leads here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Re-score Progress Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {showRescoreModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => !rescoring && setShowRescoreModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative w-full max-w-md bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Gradient top bar */}
              <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${rescoreResult ? 'bg-emerald-500/15' : 'bg-indigo-500/15'}`}>
                      {rescoring
                        ? <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                        : rescoreResult
                          ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          : <Zap className="w-5 h-5 text-indigo-400" />}
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">
                        {rescoring ? 'Queuing AI Re-score…' : rescoreResult ? 'Re-score Queued!' : 'AI Re-scoring'}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {rescoring ? 'Talking to the AI engine…' : 'Leads will update automatically'}
                      </p>
                    </div>
                  </div>
                  {!rescoring && (
                    <button
                      onClick={() => setShowRescoreModal(false)}
                      className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Loading state */}
                {rescoring && (
                  <div className="space-y-3">
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                        initial={{ width: '5%' }}
                        animate={{ width: '85%' }}
                        transition={{ duration: 3, ease: 'easeOut' }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Analyzing all leads and queuing AI jobs…</p>
                  </div>
                )}

                {/* Result state */}
                {rescoreResult && !rescoring && (
                  <div className="space-y-4">
                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-indigo-400">{rescoreResult.queued}</div>
                        <div className="text-xs text-muted-foreground mt-1">Leads queued</div>
                      </div>
                      <div className="bg-secondary/60 border border-border/40 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-foreground">{rescoreResult.total_leads}</div>
                        <div className="text-xs text-muted-foreground mt-1">Total leads</div>
                      </div>
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-emerald-400">~{rescoreResult.est_completion_min}m</div>
                        <div className="text-xs text-muted-foreground mt-1">Est. time</div>
                      </div>
                    </div>

                    {/* Message */}
                    <div className="bg-secondary/40 rounded-xl p-3.5 border border-border/40">
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        {rescoreResult.message}
                      </p>
                      {rescoreResult.skipped_no_conv > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {rescoreResult.skipped_no_conv} leads skipped — no conversation history yet.
                        </p>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex items-start gap-2.5 text-xs text-muted-foreground bg-blue-500/5 border border-blue-500/15 rounded-xl p-3">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <span>The AI engine processes leads in the background. Your pipeline will automatically update as each lead is scored. Refresh the page to see results.</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setShowRescoreModal(false); fetchLeads(); }}
                        className="flex-1 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
                      >
                        Refresh Pipeline
                      </button>
                      <button
                        onClick={() => setShowRescoreModal(false)}
                        className="h-9 px-4 rounded-lg bg-secondary hover:bg-secondary/80 text-sm text-muted-foreground transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
