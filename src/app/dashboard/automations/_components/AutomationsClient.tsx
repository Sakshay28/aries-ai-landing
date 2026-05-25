"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { 
  Plus, Activity, ArrowRight, Play, Pause, BarChart2, Edit2, X, Save, Trash2, Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";

interface Rule {
  id: string;
  name: string;
  trigger_source: string;
  ai_summary: string;
  status: 'active' | 'learning' | 'paused';
  customers_reached: number;
  actions_taken: number;
}

// ── Suggestions (rotate daily) ──────────────────────────────
const SUGGESTIONS = [
  {
    title: 'Turn on "Smart Review Collection"',
    description: 'Ask for a Google review 2 days after a chat, only when the AI detects the customer was happy.',
    template: { name: 'Smart Review Collection', trigger_source: 'When customer sentiment is deeply positive after a resolved chat', ai_summary: 'Wait 48 hours, then send a polite request with a link to the Google My Business page.' },
  },
  {
    title: 'Create an "Abandoned Enquiry" Rule',
    description: 'If a customer asks about pricing but goes silent for 24 hours, gently remind them.',
    template: { name: 'Abandoned Enquiry Follow-up', trigger_source: 'When a customer asks about pricing or products but does not reply for 24 hours', ai_summary: 'Send a gentle follow-up asking if they need more information or help deciding.' },
  },
  {
    title: 'Enable "VIP Customer Recognition"',
    description: 'Send a personalised welcome-back message to any returning customer automatically.',
    template: { name: 'VIP Customer Recognition', trigger_source: 'When a recognised returning customer sends a new message', ai_summary: 'Acknowledge that they are a returning customer and prioritise their message.' },
  },
  {
    title: 'Turn on "After-Hours Auto Reply"',
    description: 'Let customers know when you will be back so they never feel ignored outside business hours.',
    template: { name: 'After-Hours Auto Reply', trigger_source: 'When a customer messages between 7 PM and 8 AM', ai_summary: 'Reply instantly stating business hours and that the team will respond first thing in the morning.' },
  },
];

// ── Blank draft for new rules ────────────────────────────────
const BLANK_DRAFT: Omit<Rule, 'id'> = {
  name: '',
  trigger_source: '',
  ai_summary: '',
  status: 'active',
  customers_reached: 0,
  actions_taken: 0,
};

// ── Status label + colour map ────────────────────────────────
const STATUS_STYLE: Record<Rule['status'], string> = {
  active:   'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500',
  learning: 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
  paused:   'bg-muted text-muted-foreground',
};

export function AutomationsClient() {
  const router = useRouter();

  // ── State ────────────────────────────────────────────────────
  const [rules, setRules]           = useState<Rule[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [draft, setDraft]           = useState<Partial<Rule>>({});
  const [isNew, setIsNew]           = useState(false);
  const [isDrawerOpen, setDrawer]   = useState(false);
  const [suggestion, setSuggestion] = useState(SUGGESTIONS[0]);

  // ── Rotate suggestion daily ──────────────────────────────────
  useEffect(() => {
    const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
    setSuggestion(SUGGESTIONS[day % SUGGESTIONS.length]);
  }, []);

  // ── Load rules from API ──────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/automations');
      const data = await res.json();
      setRules(data.rules || []);
    } catch {
      toast.error('Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Open drawer ──────────────────────────────────────────────
  const openEdit = (rule: Rule) => { setDraft(rule); setIsNew(false); setDrawer(true); };
  const openNew  = (prefill?: Partial<Rule>) => {
    setDraft({ ...BLANK_DRAFT, ...prefill });
    setIsNew(true);
    setDrawer(true);
  };
  const closeDrawer = () => { setDrawer(false); setDraft({}); };

  // ── Save (create or update) ──────────────────────────────────
  const handleSave = async () => {
    if (!draft.name?.trim() || !draft.trigger_source?.trim() || !draft.ai_summary?.trim()) {
      toast.error('Please fill in all three fields');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const res = await fetch('/api/dashboard/automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: draft.name, trigger_source: draft.trigger_source, ai_summary: draft.ai_summary, status: 'active' }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success('Rule created');
      } else {
        const res = await fetch(`/api/dashboard/automations/${draft.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: draft.name, trigger_source: draft.trigger_source, ai_summary: draft.ai_summary }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success('Rule updated');
      }
      closeDrawer();
      load();
    } catch (e) {
      toast.error((e as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await fetch(`/api/dashboard/automations/${id}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== id));
      toast.success('Rule deleted');
      closeDrawer();
    } finally {
      setDeleting(false);
    }
  };

  // ── Toggle pause / resume ────────────────────────────────────
  const handleToggle = async (rule: Rule) => {
    const next: Rule['status'] = rule.status === 'paused' ? 'active' : 'paused';
    // Optimistic update
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: next } : r));
    try {
      const res = await fetch(`/api/dashboard/automations/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next === 'paused' ? 'Rule paused' : 'Rule resumed');
    } catch {
      // Revert on failure
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: rule.status } : r));
      toast.error('Failed to update status');
    }
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden relative">

      {/* TOP HEADER */}
      <header className="h-14 flex items-center justify-between px-6 shrink-0 bg-background z-20 sticky top-0 border-b border-border/40">
        <h1 className="text-[16px] font-semibold tracking-tight">Smart Rules</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/dashboard/analytics')} className="h-9 px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors flex items-center">
            <Activity className="w-4 h-4 mr-2 opacity-70" />
            Analytics
          </button>
          <button onClick={() => openNew()} className="h-9 px-4 bg-foreground text-background hover:bg-foreground/90 rounded-lg text-[13px] font-medium transition-transform active:scale-95 flex items-center shadow-sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Rule
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-auto p-6 md:p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-12">

          {/* HEADER COPY */}
          <div>
            <h2 className="text-2xl font-semibold tracking-tight mb-2">Let AI do the follow-ups.</h2>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Your AI reads every conversation and follows these rules automatically: no code, no triggers to configure.
            </p>
          </div>

          {/* AI SUGGESTION */}
          <section className="group relative rounded-2xl bg-muted/40 p-6 sm:p-8 hover:bg-muted/60 transition-colors">
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[12px] font-semibold tracking-wide text-blue-600 dark:text-blue-400 uppercase">Suggestion for today</span>
                </div>
                <h3 className="text-[18px] font-medium tracking-tight">{suggestion.title}</h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed max-w-xl">{suggestion.description}</p>
              </div>
              <button
                onClick={() => openNew(suggestion.template)}
                className="shrink-0 h-10 px-5 bg-white dark:bg-black border border-border/50 group-hover:border-border text-foreground text-[14px] font-medium rounded-lg shadow-sm hover:shadow transition-all flex items-center"
              >
                Turn this on
                <ArrowRight className="w-4 h-4 ml-2 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </section>

          {/* RULES LIST */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[14px] font-medium tracking-tight">
                Your Rules
                {!loading && rules.length > 0 && (
                  <span className="ml-2 text-muted-foreground font-normal">({rules.length})</span>
                )}
              </h3>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-[13px]">Loading rules…</span>
              </div>
            ) : rules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-[15px] font-medium text-foreground mb-1">No rules yet</p>
                <p className="text-[13px] text-muted-foreground max-w-xs">Create your first rule to teach the AI how to handle specific situations automatically.</p>
                <button onClick={() => openNew()} className="mt-6 h-9 px-5 bg-foreground text-background rounded-lg text-[13px] font-medium hover:bg-foreground/90 transition-colors">
                  Create first rule
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="group relative bg-background border border-border/40 hover:border-border/80 rounded-2xl p-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:hover:shadow-[0_8px_30px_rgb(255,255,255,0.02)]"
                  >
                    <div className="flex flex-col sm:flex-row gap-6 justify-between items-start">

                      {/* Left: Info */}
                      <div className="space-y-3 flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h4 className="text-[16px] font-medium tracking-tight truncate">{rule.name}</h4>
                          <span className={cn('px-2.5 py-0.5 rounded-full text-[11px] font-medium capitalize shrink-0', STATUS_STYLE[rule.status])}>
                            {rule.status}
                          </span>
                        </div>
                        <div className="text-[13px] font-medium text-muted-foreground flex items-start gap-2">
                          <span className="uppercase text-[11px] tracking-wider text-muted-foreground/60 shrink-0 mt-px">When:</span>
                          {rule.trigger_source}
                        </div>
                        <p className="text-[14px] text-muted-foreground/80 leading-relaxed max-w-xl">{rule.ai_summary}</p>
                      </div>

                      {/* Right: Stats → Actions on hover */}
                      <div className="flex flex-col items-end gap-4 shrink-0 sm:min-w-[140px]">

                        {/* Stats — fades on hover */}
                        <div className="flex flex-col items-end gap-3 group-hover:opacity-0 group-hover:pointer-events-none transition-opacity duration-200 absolute sm:relative right-6 top-6 sm:right-auto sm:top-auto">
                          <div className="text-right">
                            <div className="text-[20px] font-semibold tracking-tight">{rule.customers_reached}</div>
                            <div className="text-[12px] text-muted-foreground">Customers Reached</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[20px] font-semibold tracking-tight">{rule.actions_taken}</div>
                            <div className="text-[12px] text-muted-foreground">Actions Taken</div>
                          </div>
                        </div>

                        {/* Actions — appear on hover */}
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300 flex items-center gap-2">
                          <button onClick={() => openEdit(rule)} className="flex items-center gap-2 h-9 px-3 bg-muted hover:bg-muted/80 text-foreground text-[13px] font-medium rounded-lg transition-colors">
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => router.push('/dashboard/analytics')} className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors" title="Analytics">
                            <BarChart2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleToggle(rule)} className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors" title={rule.status === 'paused' ? 'Resume' : 'Pause'}>
                            {rule.status === 'paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          </button>
                          <div className="w-px h-4 bg-border mx-1" />
                          <button onClick={() => handleDelete(rule.id)} className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-lg transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="h-12" />
        </div>
      </div>

      {/* EDIT / NEW DRAWER */}
      {isDrawerOpen && (
        <>
          <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-40" onClick={closeDrawer} />
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[480px] bg-background border-l border-border shadow-2xl z-50 flex flex-col">

            {/* Drawer Header */}
            <div className="h-16 border-b border-border flex items-center justify-between px-6 shrink-0">
              <h2 className="text-[16px] font-semibold tracking-tight">{isNew ? 'New Rule' : 'Edit Rule'}</h2>
              <button onClick={closeDrawer} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Write this rule in plain English. The AI will follow it automatically in every conversation.
              </p>

              <div className="space-y-2">
                <label className="text-[13px] font-medium">Rule Name</label>
                <input
                  type="text"
                  value={draft.name || ''}
                  onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Follow Up Interested Customers"
                  className="w-full h-10 px-3 bg-background border border-border/80 rounded-lg text-[14px] focus:outline-none focus:border-foreground/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-medium">When does this trigger?</label>
                <input
                  type="text"
                  value={draft.trigger_source || ''}
                  onChange={e => setDraft(p => ({ ...p, trigger_source: e.target.value }))}
                  placeholder="e.g. When someone asks about pricing but goes quiet"
                  className="w-full h-10 px-3 bg-background border border-border/80 rounded-lg text-[14px] focus:outline-none focus:border-foreground/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-medium">What should the AI do?</label>
                <textarea
                  value={draft.ai_summary || ''}
                  onChange={e => setDraft(p => ({ ...p, ai_summary: e.target.value }))}
                  placeholder="e.g. Wait 2 hours, then send a polite message asking if they have any questions about the pricing."
                  rows={5}
                  className="w-full p-3 bg-background border border-border/80 rounded-lg text-[14px] focus:outline-none focus:border-foreground/50 transition-colors resize-none"
                />
              </div>

              <div className="rounded-xl bg-muted/40 px-4 py-3 text-[12px] text-muted-foreground leading-relaxed">
                💡 <strong>Tip:</strong> Be specific. Instead of "follow up with customers", try "If a customer says they are interested but doesn't reply for 3 hours, send a friendly nudge."
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-6 border-t border-border flex items-center justify-between bg-muted/20 shrink-0">
              {!isNew ? (
                <button
                  onClick={() => handleDelete(draft.id!)}
                  disabled={deleting}
                  className="h-10 px-4 text-[13px] font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-colors flex items-center disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete
                </button>
              ) : <div />}
              <div className="flex items-center gap-3">
                <button onClick={closeDrawer} className="h-10 px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="h-10 px-5 bg-foreground text-background hover:bg-foreground/90 rounded-lg text-[13px] font-medium transition-transform active:scale-95 flex items-center shadow-sm disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  {isNew ? 'Create Rule' : 'Save Changes'}
                </button>
              </div>
            </div>

          </div>
        </>
      )}

    </div>
  );
}
