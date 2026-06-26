"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Plus, Play, Pause, Edit2, X, Save, Trash2, Loader2,
  Zap, Clock, Upload, AlertTriangle, Activity, RefreshCw, CheckCircle2, XCircle
} from 'lucide-react';
import { cn } from "@/lib/utils";

interface Automation {
  id: string;
  name: string;
  trigger_event: string;
  delay_value: number;
  delay_unit: string;
  message_text: string;
  media_url: string | null;
  media_type: string | null;
  status: 'active' | 'paused';
  cancel_on_reply: boolean;
  customers_reached: number;
  messages_sent: number;
  created_at: string;
}

interface Execution {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  automation_name: string;
  trigger_event: string | null;
  delay: string | null;
  status: 'pending' | 'processing' | 'sent' | 'cancelled' | 'failed';
  scheduled_at: string;
  sent_at: string | null;
  error: string | null;
  wa_message_id: string | null;
  variables: Record<string, string> | null;
  created_at: string;
}

interface VariableEntry {
  name: string;
  label: string;
  description: string;
  required: boolean;
  defaultFallback: string | null;
  category: string;
}

interface TemplateValidation {
  valid: boolean;
  unknownVariables: string[];
  suggestions: Record<string, string>;
  preview: string;
}

interface Diagnostics {
  healthy: boolean;
  checks: Record<string, { ok: boolean; detail: string }>;
}

const EXEC_STATUS_STYLE: Record<string, { dot: string; label: string; cls: string }> = {
  sent:       { dot: '🟢', label: 'Sent',       cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500' },
  pending:    { dot: '🟡', label: 'Scheduled',  cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-500' },
  processing: { dot: '🔵', label: 'Processing', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-500' },
  failed:     { dot: '🔴', label: 'Failed',     cls: 'bg-red-500/10 text-red-600 dark:text-red-500' },
  cancelled:  { dot: '⚪', label: 'Cancelled',  cls: 'bg-muted text-muted-foreground' },
};

const fmtTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const TRIGGER_LABELS: Record<string, { label: string; desc: string }> = {
  booking_confirmed:     { label: 'Booking Confirmed',     desc: 'When a customer confirms a booking or reservation' },
  booking_reminder:      { label: 'Before Booking (Reminder)', desc: 'Sends a reminder a set time BEFORE the reservation — great for cutting no-shows' },
  new_lead:              { label: 'New Lead',               desc: 'When a new customer messages for the first time' },
  escalation_triggered:  { label: 'Escalation Started',     desc: 'When a conversation is escalated to staff' },
  escalation_resolved:   { label: 'Escalation Resolved',    desc: 'When staff resolves an escalated conversation' },
  payment_received:      { label: 'Payment Received',       desc: 'When a payment is confirmed via Razorpay' },
};

// Triggers that schedule relative to a FUTURE event (delay = time BEFORE it),
// vs. the default where delay = time AFTER the trigger fires.
const PRE_EVENT_TRIGGERS = new Set(['booking_reminder']);

const UNIT_LABELS: Record<string, string> = { minutes: 'Minutes', hours: 'Hours', days: 'Days' };

const FALLBACK_VARIABLES = [
  { key: '{{customer_name}}', label: 'Customer Name' },
  { key: '{{business_name}}', label: 'Business Name' },
  { key: '{{reservation_id}}', label: 'Reservation ID' },
  { key: '{{booking_date}}', label: 'Booking Date' },
  { key: '{{booking_time}}', label: 'Booking Time' },
  { key: '{{guest_count}}', label: 'Guest Count' },
  { key: '{{party_size}}', label: 'Party Size' },
  { key: '{{table}}', label: 'Table' },
  { key: '{{special_requests}}', label: 'Special Requests' },
  { key: '{{restaurant_name}}', label: 'Restaurant Name' },
  { key: '{{instagram}}', label: 'Instagram' },
  { key: '{{google_review_url}}', label: 'Google Review URL' },
  { key: '{{first_name}}', label: 'First Name' },
];

const SUGGESTIONS = [
  {
    title: 'Send Instagram after booking',
    description: 'Share your Instagram page right after a customer confirms their reservation.',
    template: { name: 'Share Instagram', trigger_event: 'booking_confirmed', delay_value: 0, delay_unit: 'minutes', message_text: 'Thanks for booking with us, {{customer_name}}! Follow us on Instagram for updates 📸\nhttps://instagram.com/yourbusiness', cancel_on_reply: false },
  },
  {
    title: 'Follow up new leads after 2 hours',
    description: 'Nudge first-time customers who haven\'t replied in 2 hours.',
    template: { name: 'New Lead Follow-up', trigger_event: 'new_lead', delay_value: 2, delay_unit: 'hours', message_text: 'Hi {{customer_name}}! Just checking in — do you have any questions about {{business_name}}? We\'re happy to help! 😊', cancel_on_reply: true },
  },
  {
    title: 'Remind customers before their booking',
    description: 'Send a reminder a few hours before the reservation to cut down no-shows.',
    template: { name: 'Booking Reminder', trigger_event: 'booking_reminder', delay_value: 3, delay_unit: 'hours', message_text: 'Hi {{customer_name}}! Just a friendly reminder of your booking at {{business_name}} today at {{booking_time}} for {{party_size}}. See you soon! Reply CANCEL if your plans changed.', cancel_on_reply: false },
  },
  {
    title: 'Send packing list after booking',
    description: 'Auto-send preparation details 1 day after a booking is confirmed.',
    template: { name: 'Post-Booking Prep', trigger_event: 'booking_confirmed', delay_value: 1, delay_unit: 'days', message_text: 'Hi {{customer_name}}! Your booking is confirmed. Here\'s a quick checklist to help you prepare. Let us know if you have any questions!', cancel_on_reply: true },
  },
  {
    title: 'Thank customers after payment',
    description: 'Send a thank you message immediately after receiving payment.',
    template: { name: 'Payment Thank You', trigger_event: 'payment_received', delay_value: 0, delay_unit: 'minutes', message_text: 'Thank you for your payment, {{customer_name}}! 🎉 We\'ve received it and your booking is all set. See you soon!', cancel_on_reply: false },
  },
];

const BLANK: Omit<Automation, 'id' | 'created_at' | 'customers_reached' | 'messages_sent'> = {
  name: '', trigger_event: 'booking_confirmed', delay_value: 0, delay_unit: 'minutes',
  message_text: '', media_url: null, media_type: null, status: 'active', cancel_on_reply: true,
};

export function AutomationsClient() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState<Partial<Automation>>({});
  const [isNew, setIsNew] = useState(false);
  const [isDrawerOpen, setDrawer] = useState(false);
  const [suggestion, setSuggestion] = useState(SUGGESTIONS[0]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [execLoading, setExecLoading] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [registryVars, setRegistryVars] = useState<VariableEntry[]>([]);
  const [sampleData, setSampleData] = useState<Record<string, string>>({});
  const [templateValidation, setTemplateValidation] = useState<TemplateValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [expandedExec, setExpandedExec] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const validateTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
    setSuggestion(SUGGESTIONS[day % SUGGESTIONS.length]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/automations');
      const data = await res.json();
      setAutomations(data.automations || []);
    } catch {
      toast.error('Failed to load automations');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExecutions = useCallback(async () => {
    setExecLoading(true);
    try {
      const [execRes, diagRes] = await Promise.all([
        fetch('/api/dashboard/automations/executions'),
        fetch('/api/dashboard/automations/diagnostics'),
      ]);
      const execData = await execRes.json();
      const diagData = await diagRes.json();
      setExecutions(execData.executions || []);
      setDiag(diagData.healthy !== undefined ? diagData : null);
    } catch {
      // non-fatal — execution history is read-only visibility
    } finally {
      setExecLoading(false);
    }
  }, []);

  useEffect(() => { load(); loadExecutions(); }, [load, loadExecutions]);

  // Load variable registry from API
  useEffect(() => {
    fetch('/api/dashboard/automations/variables')
      .then(r => r.json())
      .then(d => {
        if (d.variables) setRegistryVars(d.variables);
        if (d.sampleData) setSampleData(d.sampleData);
      })
      .catch(() => {});
  }, []);

  // Debounced template validation
  const validateTemplate = useCallback((text: string) => {
    if (!text?.trim()) { setTemplateValidation(null); return; }
    if (validateTimer.current) clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(async () => {
      setValidating(true);
      try {
        const res = await fetch('/api/dashboard/automations/variables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template: text }),
        });
        const data = await res.json();
        setTemplateValidation(data);
      } catch { /* non-fatal */ }
      setValidating(false);
    }, 400);
  }, []);

  // Re-validate when message_text changes
  useEffect(() => {
    if (isDrawerOpen && draft.message_text) {
      validateTemplate(draft.message_text);
    } else {
      setTemplateValidation(null);
    }
  }, [draft.message_text, isDrawerOpen, validateTemplate]);

  const openEdit = (a: Automation) => { setDraft(a); setIsNew(false); setDrawer(true); };
  const openNew = (prefill?: Partial<Automation>) => {
    setDraft({ ...BLANK, ...prefill });
    setIsNew(true);
    setDrawer(true);
  };
  const closeDrawer = () => { setDrawer(false); setDraft({}); };

  const insertVariable = (varKey: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setDraft(p => ({ ...p, message_text: (p.message_text || '') + varKey }));
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = draft.message_text || '';
    const newText = text.substring(0, start) + varKey + text.substring(end);
    setDraft(p => ({ ...p, message_text: newText }));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + varKey.length, start + varKey.length); }, 0);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/dashboard/automations/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(p => ({ ...p, media_url: data.url, media_type: data.mediaType }));
      toast.success('Media uploaded');
    } catch (err) {
      toast.error((err as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!draft.name?.trim()) { toast.error('Name is required'); return; }
    if (!draft.message_text?.trim()) { toast.error('Message is required'); return; }
    if (templateValidation && !templateValidation.valid) {
      toast.error(`Fix unknown variables before saving: ${templateValidation.unknownVariables.map(v => `{{${v}}}`).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: draft.name, trigger_event: draft.trigger_event, delay_value: draft.delay_value ?? 0,
        delay_unit: draft.delay_unit || 'minutes', message_text: draft.message_text,
        media_url: draft.media_url || null, media_type: draft.media_type || null,
        cancel_on_reply: draft.cancel_on_reply ?? true,
      };
      if (isNew) {
        const res = await fetch('/api/dashboard/automations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success('Automation created');
      } else {
        const res = await fetch(`/api/dashboard/automations/${draft.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success('Automation updated');
      }
      closeDrawer();
      load();
    } catch (e) {
      toast.error((e as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await fetch(`/api/dashboard/automations/${id}`, { method: 'DELETE' });
      setAutomations(prev => prev.filter(a => a.id !== id));
      toast.success('Automation deleted');
      closeDrawer();
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (a: Automation) => {
    const next = a.status === 'paused' ? 'active' : 'paused';
    setAutomations(prev => prev.map(r => r.id === a.id ? { ...r, status: next } : r));
    try {
      const res = await fetch(`/api/dashboard/automations/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next === 'paused' ? 'Automation paused' : 'Automation resumed');
    } catch {
      setAutomations(prev => prev.map(r => r.id === a.id ? { ...r, status: a.status } : r));
      toast.error('Failed to update status');
    }
  };

  const computedDelayMs = ((draft.delay_value || 0) * ({ minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[draft.delay_unit || 'minutes'] || 60_000));
  const isOver24h = computedDelayMs > 24 * 3_600_000;

  const delayLabel = (v: number, u: string, trigger?: string) => {
    if (trigger && PRE_EVENT_TRIGGERS.has(trigger)) {
      return v === 0 ? 'At booking time' : `${v} ${u} before`;
    }
    if (v === 0) return 'Immediately';
    return `After ${v} ${u}`;
  };

  const isPreEvent = PRE_EVENT_TRIGGERS.has(draft.trigger_event || '');

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden relative">

      {/* HEADER */}
      <header className="h-14 flex items-center justify-between px-6 shrink-0 bg-background z-20 sticky top-0 border-b border-border/40">
        <h1 className="text-[16px] font-semibold tracking-tight flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          Automations
        </h1>
        <button onClick={() => openNew()} className="h-9 px-4 bg-foreground text-background hover:bg-foreground/90 rounded-lg text-[13px] font-medium transition-transform active:scale-95 flex items-center shadow-sm">
          <Plus className="w-4 h-4 mr-1.5" />
          New Automation
        </button>
      </header>

      {/* MAIN */}
      <div className="flex-1 overflow-auto p-6 md:p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-12">

          <div>
            <h2 className="text-2xl font-semibold tracking-tight mb-2">Automate your follow-ups.</h2>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Set up event-triggered messages that send automatically — immediately or after a delay you choose.
            </p>
          </div>

          {/* SUGGESTION */}
          <section className="group relative rounded-2xl bg-muted/40 p-6 sm:p-8 hover:bg-muted/60 transition-colors">
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[12px] font-semibold tracking-wide text-blue-600 dark:text-blue-400 uppercase">Suggestion</span>
                </div>
                <h3 className="text-[18px] font-medium tracking-tight">{suggestion.title}</h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed max-w-xl">{suggestion.description}</p>
              </div>
              <button
                onClick={() => openNew(suggestion.template as any)}
                className="shrink-0 h-10 px-5 bg-white dark:bg-black border border-border/50 group-hover:border-border text-foreground text-[14px] font-medium rounded-lg shadow-sm hover:shadow transition-all flex items-center"
              >
                Use this
                <Zap className="w-4 h-4 ml-2 opacity-60" />
              </button>
            </div>
          </section>

          {/* LIST */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[14px] font-medium tracking-tight">
                Your Automations
                {!loading && automations.length > 0 && (
                  <span className="ml-2 text-muted-foreground font-normal">({automations.length})</span>
                )}
              </h3>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-[13px]">Loading…</span>
              </div>
            ) : automations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Zap className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-[15px] font-medium text-foreground mb-1">No automations yet</p>
                <p className="text-[13px] text-muted-foreground max-w-xs">Create your first automation to send messages automatically when events happen.</p>
                <button onClick={() => openNew()} className="mt-6 h-9 px-5 bg-foreground text-background rounded-lg text-[13px] font-medium hover:bg-foreground/90 transition-colors">
                  Create first automation
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {automations.map(a => (
                  <div key={a.id} className="group relative bg-background border border-border/40 hover:border-border/80 rounded-2xl p-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:hover:shadow-[0_8px_30px_rgb(255,255,255,0.02)]">
                    <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h4 className="text-[16px] font-medium tracking-tight truncate">{a.name}</h4>
                          <span className={cn(
                            'px-2.5 py-0.5 rounded-lg text-[11px] font-medium capitalize shrink-0',
                            a.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500' : 'bg-muted text-muted-foreground'
                          )}>
                            {a.status}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-muted/60 rounded-md">
                            <Zap className="w-3 h-3" />
                            {TRIGGER_LABELS[a.trigger_event]?.label || a.trigger_event}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-muted/60 rounded-md">
                            <Clock className="w-3 h-3" />
                            {delayLabel(a.delay_value, a.delay_unit, a.trigger_event)}
                          </span>
                          {a.media_url && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-muted/60 rounded-md">
                              <Upload className="w-3 h-3" />
                              {a.media_type || 'media'}
                            </span>
                          )}
                        </div>

                        <p className="text-[13px] text-muted-foreground/70 line-clamp-2">{a.message_text}</p>
                      </div>

                      <div className="flex flex-col items-end gap-3 shrink-0 sm:min-w-[140px]">
                        <div className="flex items-center gap-4 text-center group-hover:opacity-0 group-hover:pointer-events-none transition-opacity duration-200">
                          <div>
                            <div className="text-[18px] font-semibold tracking-tight">{a.customers_reached}</div>
                            <div className="text-[11px] text-muted-foreground">Reached</div>
                          </div>
                          <div>
                            <div className="text-[18px] font-semibold tracking-tight">{a.messages_sent}</div>
                            <div className="text-[11px] text-muted-foreground">Sent</div>
                          </div>
                        </div>

                        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300 flex items-center gap-2">
                          <button onClick={() => openEdit(a)} className="flex items-center gap-2 h-9 px-3 bg-muted hover:bg-muted/80 text-foreground text-[13px] font-medium rounded-lg transition-colors">
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button onClick={() => handleToggle(a)} className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors" title={a.status === 'paused' ? 'Resume' : 'Pause'}>
                            {a.status === 'paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          </button>
                          <div className="w-px h-4 bg-border mx-1" />
                          <button onClick={() => handleDelete(a.id)} className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-lg transition-colors" title="Delete">
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

          {/* DIAGNOSTICS HEALTH STRIP */}
          {diag && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-[14px] font-medium tracking-tight">Pipeline health</h3>
                <span className={cn(
                  'px-2 py-0.5 rounded-md text-[11px] font-medium',
                  diag.healthy ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500' : 'bg-amber-500/10 text-amber-600 dark:text-amber-500'
                )}>
                  {diag.healthy ? 'All systems go' : 'Needs attention'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(diag.checks).map(([key, c]) => (
                  <div key={key} className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                    {c.ok
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      : <XCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium capitalize">{key.replace(/_/g, ' ')}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* EXECUTION HISTORY */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-medium tracking-tight">Execution history</h3>
              <button
                onClick={() => { load(); loadExecutions(); }}
                className="flex items-center gap-1.5 h-8 px-3 text-[12px] text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 rounded-lg transition-colors"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', execLoading && 'animate-spin')} />
                Refresh
              </button>
            </div>

            {execLoading && executions.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-[13px]">Loading executions…</span>
              </div>
            ) : executions.length === 0 ? (
              <div className="text-center py-10 text-[13px] text-muted-foreground bg-muted/20 rounded-xl">
                No executions yet. They&apos;ll appear here the moment an automation fires.
              </div>
            ) : (
              <div className="overflow-x-auto border border-border/40 rounded-xl">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Contact</th>
                      <th className="px-4 py-2.5 font-medium">Automation</th>
                      <th className="px-4 py-2.5 font-medium">Scheduled</th>
                      <th className="px-4 py-2.5 font-medium">Executed</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map(e => {
                      const s = EXEC_STATUS_STYLE[e.status] || EXEC_STATUS_STYLE.pending;
                      const isExpanded = expandedExec === e.id;
                      return (
                        <React.Fragment key={e.id}>
                          <tr
                            className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                            onClick={() => setExpandedExec(isExpanded ? null : e.id)}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium truncate max-w-[140px]">{e.contact_name || 'Unknown'}</div>
                              <div className="text-[11px] text-muted-foreground">{e.contact_phone || '—'}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="truncate max-w-[160px]">{e.automation_name}</div>
                              <div className="text-[11px] text-muted-foreground">{e.trigger_event?.replace(/_/g, ' ')}</div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtTime(e.scheduled_at)}</td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtTime(e.sent_at)}</td>
                            <td className="px-4 py-3">
                              <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium', s.cls)} title={e.error || undefined}>
                                {s.dot} {s.label}
                              </span>
                              {e.error && <div className="text-[10px] text-red-500 mt-1 truncate max-w-[160px]" title={e.error}>{e.error}</div>}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-muted/10">
                              <td colSpan={5} className="px-4 py-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12px]">
                                  {/* Timeline */}
                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">Timeline</h4>
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                        <span className="text-muted-foreground w-16 shrink-0">Created</span>
                                        <span>{fmtTime(e.created_at)}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                        <span className="text-muted-foreground w-16 shrink-0">Scheduled</span>
                                        <span>{fmtTime(e.scheduled_at)}</span>
                                      </div>
                                      {e.sent_at && (
                                        <div className="flex items-center gap-2">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                          <span className="text-muted-foreground w-16 shrink-0">Sent</span>
                                          <span>{fmtTime(e.sent_at)}</span>
                                        </div>
                                      )}
                                      {e.error && (
                                        <div className="flex items-start gap-2">
                                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1" />
                                          <span className="text-muted-foreground w-16 shrink-0">Error</span>
                                          <span className="text-red-600 dark:text-red-400">{e.error}</span>
                                        </div>
                                      )}
                                    </div>
                                    {e.wa_message_id && (
                                      <div className="mt-2">
                                        <span className="text-muted-foreground">WA Msg ID: </span>
                                        <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded break-all">{e.wa_message_id}</code>
                                      </div>
                                    )}
                                  </div>

                                  {/* Variables */}
                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">Resolved Variables</h4>
                                    {e.variables && Object.keys(e.variables).length > 0 ? (
                                      <div className="space-y-1">
                                        {Object.entries(e.variables).filter(([,v]) => v).map(([k, v]) => (
                                          <div key={k} className="flex items-start gap-2">
                                            <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-blue-700 dark:text-blue-400 shrink-0">{`{{${k}}}`}</code>
                                            <span className="truncate">{v}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-muted-foreground italic">No variables stored</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="h-12" />
        </div>
      </div>

      {/* DRAWER */}
      {isDrawerOpen && (
        <>
          <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-40" onClick={closeDrawer} />
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[520px] bg-background border-l border-border shadow-2xl z-50 flex flex-col">

            <div className="h-16 border-b border-border flex items-center justify-between px-6 shrink-0">
              <h2 className="text-[16px] font-semibold tracking-tight">{isNew ? 'New Automation' : 'Edit Automation'}</h2>
              <button onClick={closeDrawer} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-5">

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">Name</label>
                <input
                  type="text"
                  value={draft.name || ''}
                  onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Send Instagram After Booking"
                  className="w-full h-10 px-3 bg-background border border-border/80 rounded-lg text-[14px] focus:outline-none focus:border-foreground/50 transition-colors"
                />
              </div>

              {/* Trigger Event */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">Trigger Event</label>
                <select
                  value={draft.trigger_event || 'booking_confirmed'}
                  onChange={e => setDraft(p => ({ ...p, trigger_event: e.target.value }))}
                  className="w-full h-10 px-3 bg-background border border-border/80 rounded-lg text-[14px] focus:outline-none focus:border-foreground/50 transition-colors"
                >
                  {Object.entries(TRIGGER_LABELS).map(([val, { label }]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <p className="text-[12px] text-muted-foreground">{TRIGGER_LABELS[draft.trigger_event || 'booking_confirmed']?.desc}</p>
              </div>

              {/* Delay */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">{isPreEvent ? 'Send before booking' : 'Delay'}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={draft.delay_value ?? 0}
                    onChange={e => setDraft(p => ({ ...p, delay_value: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="w-24 h-10 px-3 bg-background border border-border/80 rounded-lg text-[14px] focus:outline-none focus:border-foreground/50 transition-colors"
                  />
                  <select
                    value={draft.delay_unit || 'minutes'}
                    onChange={e => setDraft(p => ({ ...p, delay_unit: e.target.value }))}
                    className="h-10 px-3 bg-background border border-border/80 rounded-lg text-[14px] focus:outline-none focus:border-foreground/50 transition-colors"
                  >
                    {Object.entries(UNIT_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                  {(draft.delay_value ?? 0) === 0 && (
                    <span className="text-[12px] text-emerald-600 dark:text-emerald-500 font-medium px-2 py-1 bg-emerald-500/10 rounded-md">
                      {isPreEvent ? 'At booking time' : 'Sends immediately'}
                    </span>
                  )}
                </div>
                {isPreEvent && (
                  <p className="text-[12px] text-muted-foreground">
                    The reminder is sent this far <strong>before</strong> the reservation time. e.g. &ldquo;3 hours&rdquo; → 3 hours before the table booking.
                  </p>
                )}
              </div>

              {/* 24h window note — reminders can land outside WhatsApp's 24h window */}
              {isPreEvent && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-[13px] text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>Heads up:</strong> WhatsApp only allows free-form messages within 24 hours of the customer&apos;s last message. Reminders for bookings made more than ~24h in advance may be blocked by WhatsApp — those will show as <strong>Failed</strong> in Execution History. Reminders for same-day / next-day bookings work normally.
                  </div>
                </div>
              )}
              {!isPreEvent && isOver24h && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-[13px] text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>24-hour window:</strong> WhatsApp only allows free-form messages within 24 hours of the customer&apos;s last message. With a delay this long, the send may be blocked by WhatsApp and will show as Failed in Execution History.
                  </div>
                </div>
              )}

              {/* Message */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-medium">Message</label>
                  {validating && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  {templateValidation && !validating && (
                    templateValidation.valid
                      ? <span className="text-[11px] text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> All variables valid</span>
                      : <span className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {templateValidation.unknownVariables.length} unknown</span>
                  )}
                </div>
                <textarea
                  ref={textareaRef}
                  value={draft.message_text || ''}
                  onChange={e => setDraft(p => ({ ...p, message_text: e.target.value }))}
                  placeholder="Type your message here. Use variables below to personalize."
                  rows={5}
                  className={cn(
                    "w-full p-3 bg-background border rounded-lg text-[14px] focus:outline-none transition-colors resize-none",
                    templateValidation && !templateValidation.valid
                      ? "border-amber-500/60 focus:border-amber-500"
                      : "border-border/80 focus:border-foreground/50"
                  )}
                />

                {/* Unknown variable warnings */}
                {templateValidation && templateValidation.unknownVariables.length > 0 && (
                  <div className="rounded-lg bg-amber-500/10 px-3 py-2 space-y-1">
                    {templateValidation.unknownVariables.map(v => (
                      <div key={v} className="flex items-center gap-2 text-[12px]">
                        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                        <span className="text-amber-700 dark:text-amber-400">
                          <code className="font-mono">{`{{${v}}}`}</code> is not a known variable
                          {templateValidation.suggestions[v] && (
                            <> — did you mean <button
                              type="button"
                              className="underline font-medium"
                              onClick={() => {
                                const text = (draft.message_text || '').replace(`{{${v}}}`, `{{${templateValidation.suggestions[v]}}}`);
                                setDraft(p => ({ ...p, message_text: text }));
                              }}
                            >{`{{${templateValidation.suggestions[v]}}}`}</button>?</>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Variable chips from registry */}
                <div className="flex flex-wrap gap-1.5">
                  {(registryVars.length > 0
                    ? registryVars.map(v => ({ key: `{{${v.name}}}`, label: v.label, desc: v.description, required: v.required }))
                    : FALLBACK_VARIABLES.map(v => ({ ...v, desc: '', required: false }))
                  ).map(v => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      title={v.desc}
                      className={cn(
                        "px-2 py-1 text-[11px] font-medium rounded-md transition-colors",
                        v.required
                          ? "bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-400"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      )}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* LIVE PREVIEW */}
              {templateValidation?.preview && draft.message_text?.includes('{{') && (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-medium flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                    Live Preview
                  </label>
                  <div className="relative p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl">
                    <div className="absolute -top-2 left-4 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 rounded text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                      Sample preview
                    </div>
                    <p className="text-[13px] whitespace-pre-wrap leading-relaxed text-foreground/80 mt-1">
                      {templateValidation.preview}
                    </p>
                  </div>
                </div>
              )}

              {/* Media Upload */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">Media (optional)</label>
                {draft.media_url ? (
                  <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{draft.media_type === 'image' ? 'Image' : draft.media_type === 'video' ? 'Video' : 'Document'} attached</p>
                      <p className="text-[11px] text-muted-foreground truncate">{draft.media_url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDraft(p => ({ ...p, media_url: null, media_type: null }))}
                      className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" accept="image/*,video/*,.pdf,.doc,.docx" />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 h-10 px-4 border border-dashed border-border/80 hover:border-foreground/30 rounded-lg text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {uploading ? 'Uploading…' : 'Upload image, video, or document'}
                    </button>
                  </div>
                )}
              </div>

              {/* Cancel on Reply */}
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                <div>
                  <p className="text-[13px] font-medium">Cancel on customer reply</p>
                  <p className="text-[12px] text-muted-foreground">Skip sending if the customer replies before the delay expires</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft(p => ({ ...p, cancel_on_reply: !p.cancel_on_reply }))}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors',
                    draft.cancel_on_reply ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform',
                    draft.cancel_on_reply && 'translate-x-5'
                  )} />
                </button>
              </div>

            </div>

            {/* Footer */}
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
                  {isNew ? 'Create Automation' : 'Save Changes'}
                </button>
              </div>
            </div>

          </div>
        </>
      )}

    </div>
  );
}
