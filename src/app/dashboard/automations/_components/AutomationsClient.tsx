"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Plus, Play, Pause, Edit2, X, Save, Trash2, Loader2,
  Zap, Clock, Upload, AlertTriangle, Activity, RefreshCw, CheckCircle2, XCircle,
  Search, Send, FlaskConical, GitBranch, SlidersHorizontal, ChevronDown,
} from 'lucide-react';
import { cn } from "@/lib/utils";

interface ConditionRule { variable: string; operator: string; value?: string }
interface ConditionGroup { match: 'all' | 'any'; rules: ConditionRule[] }

interface Automation {
  id: string;
  name: string;
  trigger_event: string;
  delay_value: number;
  delay_unit: string;
  message_text: string;
  message_text_b: string | null;
  ab_split_percent: number;
  media_url: string | null;
  media_type: string | null;
  status: 'active' | 'paused';
  cancel_on_reply: boolean;
  conditions: ConditionGroup | null;
  max_per_lead_per_day: number | null;
  fallback_template_name: string | null;
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
  variant: 'A' | 'B' | null;
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

const CONDITION_OPS: { value: string; label: string; needsValue: boolean }[] = [
  { value: 'eq',           label: 'equals',           needsValue: true  },
  { value: 'neq',          label: 'does not equal',   needsValue: true  },
  { value: 'contains',     label: 'contains',         needsValue: true  },
  { value: 'not_contains', label: 'does not contain', needsValue: true  },
  { value: 'gt',           label: 'is greater than',  needsValue: true  },
  { value: 'gte',          label: 'is at least',      needsValue: true  },
  { value: 'lt',           label: 'is less than',     needsValue: true  },
  { value: 'lte',          label: 'is at most',       needsValue: true  },
  { value: 'is_empty',     label: 'is empty',         needsValue: false },
  { value: 'is_not_empty', label: 'is not empty',     needsValue: false },
];

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
  payment_received:        { label: 'Payment Received',           desc: 'When a payment is confirmed via Razorpay' },
  session_window_expiring: { label: 'WhatsApp Session Expiring',  desc: "Fires ~22h after the customer's last message — keeps the 24h window alive so staff can always reply freely" },
};

// Triggers that schedule relative to a FUTURE event (delay = time BEFORE it),
// vs. the default where delay = time AFTER the trigger fires.
const PRE_EVENT_TRIGGERS = new Set(['booking_reminder']);

const UNIT_LABELS: Record<string, string> = { minutes: 'Minutes', hours: 'Hours', days: 'Days', weeks: 'Weeks' };
const UNIT_MS: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000 };

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
  message_text: '', message_text_b: null, ab_split_percent: 0, media_url: null, media_type: null,
  status: 'active', cancel_on_reply: true, conditions: null, max_per_lead_per_day: null, fallback_template_name: null,
};

const EXEC_PAGE = 50;

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
  const [execTotal, setExecTotal] = useState(0);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [registryVars, setRegistryVars] = useState<VariableEntry[]>([]);
  const [templateValidation, setTemplateValidation] = useState<TemplateValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [expandedExec, setExpandedExec] = useState<string | null>(null);

  // New UI state
  const [search, setSearch] = useState('');
  const [filterTrigger, setFilterTrigger] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Automation | { id: string; name: string } | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [runningNow, setRunningNow] = useState<string | null>(null);

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

  const loadExecutions = useCallback(async (reset = true) => {
    setExecLoading(true);
    try {
      const offset = reset ? 0 : executions.length;
      const [execRes, diagRes] = await Promise.all([
        fetch(`/api/dashboard/automations/executions?limit=${EXEC_PAGE}&offset=${offset}`),
        reset ? fetch('/api/dashboard/automations/diagnostics') : Promise.resolve(null),
      ]);
      const execData = await execRes.json();
      setExecutions(prev => reset ? (execData.executions || []) : [...prev, ...(execData.executions || [])]);
      setExecTotal(execData.total ?? 0);
      if (diagRes) {
        const diagData = await diagRes.json();
        setDiag(diagData.healthy !== undefined ? diagData : null);
      }
    } catch {
      // non-fatal — execution history is read-only visibility
    } finally {
      setExecLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executions.length]);

  useEffect(() => { load(); loadExecutions(true); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load variable registry from API
  useEffect(() => {
    fetch('/api/dashboard/automations/variables')
      .then(r => r.json())
      .then(d => { if (d.variables) setRegistryVars(d.variables); })
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

  useEffect(() => {
    if (isDrawerOpen && draft.message_text) {
      validateTemplate(draft.message_text);
    } else {
      setTemplateValidation(null);
    }
  }, [draft.message_text, isDrawerOpen, validateTemplate]);

  const openEdit = (a: Automation) => {
    setDraft(a); setIsNew(false); setDrawer(true);
    setShowAdvanced(!!(a.conditions || a.message_text_b || a.max_per_lead_per_day || a.fallback_template_name));
    setTestResult(null);
  };
  const openNew = (prefill?: Partial<Automation>) => {
    setDraft({ ...BLANK, ...prefill }); setIsNew(true); setDrawer(true);
    setShowAdvanced(false); setTestResult(null);
  };
  const closeDrawer = () => { setDrawer(false); setDraft({}); setTestResult(null); };

  const insertVariable = (varKey: string) => {
    const ta = textareaRef.current;
    if (!ta) { setDraft(p => ({ ...p, message_text: (p.message_text || '') + varKey })); return; }
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

  const buildPayload = () => ({
    name: draft.name, trigger_event: draft.trigger_event, delay_value: draft.delay_value ?? 0,
    delay_unit: draft.delay_unit || 'minutes', message_text: draft.message_text,
    message_text_b: (draft.ab_split_percent ?? 0) > 0 ? (draft.message_text_b || null) : null,
    ab_split_percent: draft.ab_split_percent ?? 0,
    media_url: draft.media_url || null, media_type: draft.media_type || null,
    cancel_on_reply: draft.cancel_on_reply ?? true,
    conditions: draft.conditions && draft.conditions.rules.length > 0 ? draft.conditions : null,
    max_per_lead_per_day: draft.max_per_lead_per_day ?? null,
    fallback_template_name: draft.fallback_template_name?.trim() || null,
  });

  const handleSave = async (force = false) => {
    if (!draft.name?.trim()) { toast.error('Name is required'); return; }
    if (!draft.message_text?.trim()) { toast.error('Message is required'); return; }
    if (templateValidation && !templateValidation.valid) {
      toast.error(`Fix unknown variables before saving: ${templateValidation.unknownVariables.map(v => `{{${v}}}`).join(', ')}`);
      return;
    }
    if ((draft.ab_split_percent ?? 0) > 0 && !draft.message_text_b?.trim()) {
      toast.error('Add a Variant B message or turn off A/B testing'); return;
    }
    setSaving(true);
    try {
      const payload: any = buildPayload();
      if (force) payload.force = true;
      if (isNew) {
        const res = await fetch('/api/dashboard/automations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (res.status === 409) {
          const d = await res.json();
          setSaving(false);
          if (confirm(`${d.message}\n\nCreate it anyway?`)) return handleSave(true);
          return;
        }
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
      const res = await fetch(`/api/dashboard/automations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      setAutomations(prev => prev.filter(a => a.id !== id));
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      toast.success('Automation deleted');
      setConfirmDelete(null);
      closeDrawer();
    } catch (e) {
      toast.error((e as Error).message || 'Delete failed');
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

  // ── Bulk actions (L4) ──
  const runBulk = async (action: 'enable' | 'disable' | 'delete') => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/dashboard/automations/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${action === 'delete' ? 'Deleted' : action === 'enable' ? 'Enabled' : 'Paused'} ${data.affected}`);
      setSelected(new Set());
      setConfirmBulkDelete(false);
      load();
    } catch (e) {
      toast.error((e as Error).message || 'Bulk action failed');
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Test / dry-run (L2) ──
  const runDryRun = async () => {
    if (!draft.message_text?.trim()) { toast.error('Write a message first'); return; }
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/dashboard/automations/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true, ...buildPayload() }),
      });
      setTestResult(await res.json());
    } catch { toast.error('Preview failed'); }
    finally { setTesting(false); }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) { toast.error('Enter a phone number (with country code)'); return; }
    setTesting(true);
    try {
      const res = await fetch('/api/dashboard/automations/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false, to_phone: testPhone, ...buildPayload() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Test sent to ${testPhone}`);
    } catch (e) {
      toast.error((e as Error).message || 'Test send failed');
    } finally { setTesting(false); }
  };

  // ── Run now (L3) ──
  const runNow = async (queueId: string) => {
    setRunningNow(queueId);
    try {
      const res = await fetch('/api/dashboard/automations/run-now', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queue_id: queueId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Sent now');
      loadExecutions(true);
    } catch (e) {
      toast.error((e as Error).message || 'Could not run now');
    } finally { setRunningNow(null); }
  };

  const computedDelayMs = (draft.delay_value || 0) * (UNIT_MS[draft.delay_unit || 'minutes'] || 60_000);
  const isOver24h = computedDelayMs > 24 * 3_600_000;

  const delayLabel = (v: number, u: string, trigger?: string) => {
    if (trigger && PRE_EVENT_TRIGGERS.has(trigger)) return v === 0 ? 'At booking time' : `${v} ${u} before`;
    if (v === 0) return 'Immediately';
    return `After ${v} ${u}`;
  };

  const isPreEvent = PRE_EVENT_TRIGGERS.has(draft.trigger_event || '');
  const abOn = (draft.ab_split_percent ?? 0) > 0;

  const visibleAutomations = useMemo(() => automations.filter(a => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || a.name.toLowerCase().includes(q) || a.message_text.toLowerCase().includes(q);
    const matchesTrigger = filterTrigger === 'all' || a.trigger_event === filterTrigger;
    const matchesStatus = filterStatus === 'all' || a.status === filterStatus;
    return matchesSearch && matchesTrigger && matchesStatus;
  }), [automations, search, filterTrigger, filterStatus]);

  const allVisibleSelected = visibleAutomations.length > 0 && visibleAutomations.every(a => selected.has(a.id));
  const toggleSelectAll = () => {
    setSelected(prev => {
      if (allVisibleSelected) { const n = new Set(prev); visibleAutomations.forEach(a => n.delete(a.id)); return n; }
      const n = new Set(prev); visibleAutomations.forEach(a => n.add(a.id)); return n;
    });
  };
  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const conditionVars = registryVars.length > 0 ? registryVars : FALLBACK_VARIABLES.map(v => ({ name: v.key.replace(/[{}]/g, ''), label: v.label } as VariableEntry));

  const setConditionEnabled = (on: boolean) => {
    setDraft(p => ({ ...p, conditions: on ? { match: 'all', rules: [{ variable: 'guest_count', operator: 'gte', value: '' }] } : null }));
  };
  const updateRule = (idx: number, patch: Partial<ConditionRule>) => {
    setDraft(p => {
      const c = p.conditions ?? { match: 'all', rules: [] };
      const rules = c.rules.map((r, i) => i === idx ? { ...r, ...patch } : r);
      return { ...p, conditions: { ...c, rules } };
    });
  };
  const addRule = () => setDraft(p => {
    const c = p.conditions ?? { match: 'all' as const, rules: [] };
    return { ...p, conditions: { ...c, rules: [...c.rules, { variable: 'guest_count', operator: 'gte', value: '' }] } };
  });
  const removeRule = (idx: number) => setDraft(p => {
    const c = p.conditions ?? { match: 'all' as const, rules: [] };
    const rules = c.rules.filter((_, i) => i !== idx);
    return { ...p, conditions: rules.length ? { ...c, rules } : null };
  });

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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <h3 className="text-[14px] font-medium tracking-tight">
                Your Automations
                {!loading && automations.length > 0 && (
                  <span className="ml-2 text-muted-foreground font-normal">({automations.length})</span>
                )}
              </h3>
              {/* Search + filters (L5) */}
              {automations.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search…"
                      className="h-8 w-36 sm:w-44 pl-8 pr-2 bg-muted/40 border border-border/50 rounded-lg text-[12px] focus:outline-none focus:border-foreground/40"
                    />
                  </div>
                  <select value={filterTrigger} onChange={e => setFilterTrigger(e.target.value)} className="h-8 px-2 bg-muted/40 border border-border/50 rounded-lg text-[12px] focus:outline-none">
                    <option value="all">All triggers</option>
                    {Object.entries(TRIGGER_LABELS).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-8 px-2 bg-muted/40 border border-border/50 rounded-lg text-[12px] focus:outline-none">
                    <option value="all">All status</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              )}
            </div>

            {/* Bulk action bar (L4) */}
            {selected.size > 0 && (
              <div className="flex items-center justify-between gap-3 mb-4 px-4 py-2.5 bg-foreground text-background rounded-xl text-[13px]">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelected(new Set())} className="opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
                  <span className="font-medium">{selected.size} selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <button disabled={bulkBusy} onClick={() => runBulk('enable')} className="h-7 px-3 rounded-md bg-background/15 hover:bg-background/25 font-medium">Enable</button>
                  <button disabled={bulkBusy} onClick={() => runBulk('disable')} className="h-7 px-3 rounded-md bg-background/15 hover:bg-background/25 font-medium">Pause</button>
                  <button disabled={bulkBusy} onClick={() => setConfirmBulkDelete(true)} className="h-7 px-3 rounded-md bg-red-500/90 hover:bg-red-500 text-white font-medium">Delete</button>
                </div>
              </div>
            )}

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
            ) : visibleAutomations.length === 0 ? (
              <div className="text-center py-12 text-[13px] text-muted-foreground bg-muted/20 rounded-xl">
                No automations match your search/filters.
              </div>
            ) : (
              <div className="space-y-4">
                {/* select-all */}
                <label className="flex items-center gap-2 text-[12px] text-muted-foreground pl-1 cursor-pointer select-none">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="rounded border-border" />
                  Select all {visibleAutomations.length}
                </label>
                {visibleAutomations.map(a => (
                  <div key={a.id} className={cn(
                    "group relative bg-background border rounded-2xl p-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:hover:shadow-[0_8px_30px_rgb(255,255,255,0.02)]",
                    selected.has(a.id) ? "border-foreground/40" : "border-border/40 hover:border-border/80"
                  )}>
                    <div className="flex gap-4">
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        className="mt-1.5 rounded border-border shrink-0"
                        aria-label={`Select ${a.name}`}
                      />
                      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start flex-1 min-w-0">
                        <div className="space-y-2 flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
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
                            {a.ab_split_percent > 0 && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-md">
                                <FlaskConical className="w-3 h-3" /> A/B {a.ab_split_percent}%
                              </span>
                            )}
                            {a.conditions && a.conditions.rules.length > 0 && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md">
                                <GitBranch className="w-3 h-3" /> {a.conditions.rules.length} rule{a.conditions.rules.length > 1 ? 's' : ''}
                              </span>
                            )}
                            {a.max_per_lead_per_day != null && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-muted/60 rounded-md">
                                ≤{a.max_per_lead_per_day}/day
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
                            <button onClick={() => setConfirmDelete(a)} className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-lg transition-colors" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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
                      <p className="text-[11px] text-muted-foreground truncate" title={c.detail}>{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* EXECUTION HISTORY */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-medium tracking-tight">
                Execution history
                {execTotal > 0 && <span className="ml-2 text-muted-foreground font-normal">({execTotal})</span>}
              </h3>
              <button
                onClick={() => { load(); loadExecutions(true); }}
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
              <>
              <div className="overflow-x-auto border border-border/40 rounded-xl">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Contact</th>
                      <th className="px-4 py-2.5 font-medium">Automation</th>
                      <th className="px-4 py-2.5 font-medium">Scheduled</th>
                      <th className="px-4 py-2.5 font-medium">Executed</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium"></th>
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
                              <div className="truncate max-w-[160px] flex items-center gap-1.5">
                                {e.automation_name}
                                {e.variant && <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-semibold">{e.variant}</span>}
                              </div>
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
                            <td className="px-4 py-3 text-right">
                              {e.status === 'pending' && (
                                <button
                                  onClick={(ev) => { ev.stopPropagation(); runNow(e.id); }}
                                  disabled={runningNow === e.id}
                                  className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-medium rounded-md bg-muted hover:bg-muted/70 transition-colors"
                                  title="Send this now instead of waiting"
                                >
                                  {runningNow === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Run now
                                </button>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-muted/10">
                              <td colSpan={6} className="px-4 py-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12px]">
                                  {/* Timeline (L8) */}
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
              {executions.length < execTotal && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => loadExecutions(false)}
                    disabled={execLoading}
                    className="h-9 px-5 text-[13px] font-medium bg-muted/50 hover:bg-muted rounded-lg transition-colors flex items-center gap-2"
                  >
                    {execLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
                    Load more ({executions.length} of {execTotal})
                  </button>
                </div>
              )}
              </>
            )}
          </section>

          <div className="h-12" />
        </div>
      </div>

      {/* DELETE CONFIRM (M1) */}
      {confirmDelete && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setConfirmDelete(null)} />
          <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-[16px] font-semibold tracking-tight mb-1">Delete this automation?</h3>
            <p className="text-[13px] text-muted-foreground mb-5">
              <span className="font-medium text-foreground">{confirmDelete.name}</span> will stop firing and any scheduled sends will be cancelled. Past execution history is kept.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting} className="h-9 px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete.id)} disabled={deleting} className="h-9 px-4 text-[13px] font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2">
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRM */}
      {confirmBulkDelete && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !bulkBusy && setConfirmBulkDelete(false)} />
          <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-[16px] font-semibold tracking-tight mb-1">Delete {selected.size} automations?</h3>
            <p className="text-[13px] text-muted-foreground mb-5">They&apos;ll stop firing and scheduled sends will be cancelled. History is kept.</p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setConfirmBulkDelete(false)} disabled={bulkBusy} className="h-9 px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={() => runBulk('delete')} disabled={bulkBusy} className="h-9 px-4 text-[13px] font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center gap-2">
                {bulkBusy && <Loader2 className="w-4 h-4 animate-spin" />} Delete {selected.size}
              </button>
            </div>
          </div>
        </div>
      )}

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

              {/* 24h window note */}
              {isPreEvent && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-[13px] text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>Heads up:</strong> WhatsApp only allows free-form messages within 24 hours of the customer&apos;s last message. Reminders for bookings made more than ~24h in advance may be blocked — set a <strong>fallback template</strong> below to still reach them. Otherwise they show as <strong>Failed</strong>.
                  </div>
                </div>
              )}
              {!isPreEvent && isOver24h && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-[13px] text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>24-hour window:</strong> With a delay this long, WhatsApp may block the free-form send. Set a <strong>fallback template</strong> below to reach customers outside the window.
                  </div>
                </div>
              )}

              {/* Message */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-medium">{abOn ? 'Message (Variant A)' : 'Message'}</label>
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

                {/* Variable chips */}
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
                      Sample preview (your real data)
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
                  className={cn('relative w-11 h-6 rounded-full transition-colors', draft.cancel_on_reply ? 'bg-emerald-500' : 'bg-muted-foreground/30')}
                >
                  <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', draft.cancel_on_reply && 'translate-x-5')} />
                </button>
              </div>

              {/* ADVANCED SECTION */}
              <button
                type="button"
                onClick={() => setShowAdvanced(s => !s)}
                className="flex items-center gap-2 w-full text-left text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors pt-1"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Advanced — conditions, A/B testing, limits
                <ChevronDown className={cn('w-4 h-4 ml-auto transition-transform', showAdvanced && 'rotate-180')} />
              </button>

              {showAdvanced && (
                <div className="space-y-5 pl-1 border-l-2 border-border/40">
                  <div className="pl-4 space-y-5">

                    {/* Conditions (L6) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[13px] font-medium flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" /> Only send if…</label>
                        <button
                          type="button"
                          onClick={() => setConditionEnabled(!draft.conditions)}
                          className={cn('relative w-11 h-6 rounded-full transition-colors', draft.conditions ? 'bg-blue-500' : 'bg-muted-foreground/30')}
                        >
                          <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', draft.conditions && 'translate-x-5')} />
                        </button>
                      </div>
                      {draft.conditions && (
                        <div className="space-y-2 bg-muted/30 rounded-xl p-3">
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="text-muted-foreground">Match</span>
                            <select
                              value={draft.conditions.match}
                              onChange={e => setDraft(p => ({ ...p, conditions: { ...p.conditions!, match: e.target.value as 'all' | 'any' } }))}
                              className="h-7 px-2 bg-background border border-border/60 rounded-md text-[12px]"
                            >
                              <option value="all">all</option>
                              <option value="any">any</option>
                            </select>
                            <span className="text-muted-foreground">of these rules</span>
                          </div>
                          {draft.conditions.rules.map((r, idx) => {
                            const op = CONDITION_OPS.find(o => o.value === r.operator);
                            return (
                              <div key={idx} className="flex items-center gap-1.5">
                                <select value={r.variable} onChange={e => updateRule(idx, { variable: e.target.value })} className="h-8 px-1.5 bg-background border border-border/60 rounded-md text-[12px] max-w-[110px]">
                                  {conditionVars.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
                                </select>
                                <select value={r.operator} onChange={e => updateRule(idx, { operator: e.target.value })} className="h-8 px-1.5 bg-background border border-border/60 rounded-md text-[12px]">
                                  {CONDITION_OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                                {op?.needsValue && (
                                  <input value={r.value || ''} onChange={e => updateRule(idx, { value: e.target.value })} placeholder="value" className="h-8 px-2 bg-background border border-border/60 rounded-md text-[12px] w-20" />
                                )}
                                <button type="button" onClick={() => removeRule(idx)} className="p-1 text-muted-foreground hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            );
                          })}
                          <button type="button" onClick={addRule} className="text-[12px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Add condition</button>
                        </div>
                      )}
                    </div>

                    {/* A/B testing (L7) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[13px] font-medium flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5" /> A/B test two messages</label>
                        <button
                          type="button"
                          onClick={() => setDraft(p => ({ ...p, ab_split_percent: abOn ? 0 : 50, message_text_b: abOn ? null : (p.message_text_b || '') }))}
                          className={cn('relative w-11 h-6 rounded-full transition-colors', abOn ? 'bg-purple-500' : 'bg-muted-foreground/30')}
                        >
                          <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform', abOn && 'translate-x-5')} />
                        </button>
                      </div>
                      {abOn && (
                        <div className="space-y-2">
                          <textarea
                            value={draft.message_text_b || ''}
                            onChange={e => setDraft(p => ({ ...p, message_text_b: e.target.value }))}
                            placeholder="Variant B message…"
                            rows={4}
                            className="w-full p-3 bg-background border border-border/80 rounded-lg text-[14px] focus:outline-none focus:border-foreground/50 resize-none"
                          />
                          <div className="flex items-center gap-3">
                            <span className="text-[12px] text-muted-foreground whitespace-nowrap">{100 - (draft.ab_split_percent ?? 50)}% A</span>
                            <input
                              type="range" min={1} max={99} value={draft.ab_split_percent ?? 50}
                              onChange={e => setDraft(p => ({ ...p, ab_split_percent: parseInt(e.target.value) }))}
                              className="flex-1 accent-purple-500"
                            />
                            <span className="text-[12px] text-muted-foreground whitespace-nowrap">{draft.ab_split_percent ?? 50}% B</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Frequency cap (L9) */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium">Max sends per customer per day</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={1}
                          value={draft.max_per_lead_per_day ?? ''}
                          onChange={e => setDraft(p => ({ ...p, max_per_lead_per_day: e.target.value ? Math.max(1, parseInt(e.target.value)) : null }))}
                          placeholder="Unlimited"
                          className="w-28 h-9 px-3 bg-background border border-border/80 rounded-lg text-[13px] focus:outline-none focus:border-foreground/50"
                        />
                        <span className="text-[12px] text-muted-foreground">Leave blank for no limit</span>
                      </div>
                    </div>

                    {/* Fallback template (L10) */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium">Fallback template (24h window)</label>
                      <input
                        type="text"
                        value={draft.fallback_template_name || ''}
                        onChange={e => setDraft(p => ({ ...p, fallback_template_name: e.target.value }))}
                        placeholder="approved_template_name"
                        className="w-full h-9 px-3 bg-background border border-border/80 rounded-lg text-[13px] focus:outline-none focus:border-foreground/50"
                      />
                      <p className="text-[12px] text-muted-foreground">If WhatsApp blocks a send because 24h have passed, this approved template is sent instead (passes the customer&apos;s first name). Leave blank to skip.</p>
                    </div>

                    {/* Test / dry-run (L2) */}
                    <div className="space-y-2 bg-muted/30 rounded-xl p-3">
                      <label className="text-[13px] font-medium flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5" /> Test this automation</label>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={runDryRun} disabled={testing} className="h-8 px-3 bg-background border border-border/60 rounded-md text-[12px] font-medium flex items-center gap-1.5 hover:bg-muted">
                          {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />} Preview result
                        </button>
                      </div>
                      {testResult && (
                        <div className="text-[12px] bg-background border border-border/50 rounded-lg p-3 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Variant:</span> <span className="font-medium">{testResult.variant || 'single'}</span>
                            <span className="text-muted-foreground ml-2">Conditions:</span>
                            {testResult.condition_passed ? <span className="text-emerald-600">pass</span> : <span className="text-amber-600">skip</span>}
                          </div>
                          {testResult.condition_reason && <p className="text-amber-600">{testResult.condition_reason}</p>}
                          <p className="whitespace-pre-wrap text-foreground/80 border-t border-border/40 pt-1.5">{testResult.rendered}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          value={testPhone}
                          onChange={e => setTestPhone(e.target.value)}
                          placeholder="+91 98xxxxxxxx"
                          className="flex-1 h-8 px-2.5 bg-background border border-border/60 rounded-md text-[12px] focus:outline-none"
                        />
                        <button type="button" onClick={sendTest} disabled={testing} className="h-8 px-3 bg-foreground text-background rounded-md text-[12px] font-medium flex items-center gap-1.5">
                          {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send test
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">The test number must have messaged your WhatsApp business number in the last 24h.</p>
                    </div>

                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border flex items-center justify-between bg-muted/20 shrink-0">
              {!isNew ? (
                <button
                  onClick={() => setConfirmDelete(draft as Automation)}
                  className="h-10 px-4 text-[13px] font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-colors flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </button>
              ) : <div />}
              <div className="flex items-center gap-3">
                <button onClick={closeDrawer} className="h-10 px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => handleSave(false)}
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
