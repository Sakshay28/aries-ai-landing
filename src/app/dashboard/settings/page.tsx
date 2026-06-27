'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Clock, Phone, Mail, Globe, MapPin,
  Users, Zap, Save, CheckCircle2, AlertCircle, Plus, X,
  MessageSquare, BrainCircuit, Bell, Copy, Eye, EyeOff, Key, HelpCircle, ExternalLink, RefreshCw, Star,
  ChevronDown, ChevronUp, Image as ImageIcon, UserCheck, Info, Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { PhoneInput } from '@/components/ui/phone-input';
import WaProfileTab from '@/components/settings/WaProfileTab';

interface SettingsData {
  business_name: string;
  business_type: string;
  business_phone: string;
  business_address: string;
  business_website: string;
  business_email: string;
  bot_name: string;
  bot_personality: string;
  welcome_message: string;
  welcome_offer: string;
  usps: string[];
  core_services: string;
  industry: string;
  staff_phone: string;
  staff_name: string;
  manager_phone: string;
  staff_email: string;
  escalation_enabled: boolean;
  escalation_keywords: string[];
  escalation_reply: string;
  escalation_alert_template: string;
  booking_alert_template: string;
  followup_30min: boolean;
  followup_3hr: boolean;
  followup_24hr: boolean;
  followup_7day: boolean;
  escalation_timeout_mins: number;
  hot_keywords: string[];
  warm_keywords: string[];
  working_hours: Record<string, string>;
  off_hours_enabled: boolean;
  off_hours_message: string;
  off_hours_capture_lead: boolean;
  // Revenue features
  google_review_url: string;
  review_automation_enabled: boolean;
  // Direct Meta Settings
  wa_phone_number_id: string;
  wa_business_account_id: string;
  wa_access_token: string;
  wa_app_secret: string;
  wa_verify_token: string;
  // AI Behavior Controls
  bot_language_mode: 'auto' | 'english' | 'hindi';
  response_length: 'short' | 'medium' | 'detailed';
  prohibited_topics: string[];
  always_mention_rules: Array<{ topic: string; mention: string }>;
  competitors: string[];
  competitor_deflection_reply: string;
  default_lead_assignee_id: string;
  lead_assigned_email_template: string;
}

const DEFAULT_SETTINGS: SettingsData = {
  business_name: '', business_type: '', business_phone: '',
  business_address: '', business_website: '', business_email: '',
  bot_name: '', bot_personality: 'sales_pro', welcome_message: '', welcome_offer: '',
  usps: [], core_services: '', industry: 'retail', staff_phone: '', staff_name: '', manager_phone: '', staff_email: '',
  escalation_enabled: true, escalation_keywords: [], escalation_reply: '',
  escalation_alert_template: '',
  booking_alert_template: '',
  followup_30min: true, followup_3hr: true, followup_24hr: true, followup_7day: false,
  escalation_timeout_mins: 5, hot_keywords: [], warm_keywords: [],
  working_hours: {}, off_hours_enabled: false, off_hours_message: '', off_hours_capture_lead: true,
  google_review_url: '', review_automation_enabled: true,
  wa_phone_number_id: '',
  wa_business_account_id: '',
  wa_access_token: '',
  wa_app_secret: '',
  wa_verify_token: '',
  bot_language_mode: 'auto',
  response_length: 'short',
  prohibited_topics: [],
  always_mention_rules: [],
  competitors: [],
  competitor_deflection_reply: '',
  default_lead_assignee_id: '',
  lead_assigned_email_template: '',
};

const TABS = [
  { id: 'business', label: 'Business', icon: Building2 },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { id: 'wabizprofile', label: 'WA Profile', icon: ImageIcon },
  { id: 'aibehavior', label: 'AI Behavior', icon: BrainCircuit },
  { id: 'staff', label: 'Staff & Alerts', icon: Users },
  { id: 'leads', label: 'Lead Routing', icon: Target },
  { id: 'followup', label: 'Follow-ups', icon: Bell },
  { id: 'offhours', label: 'Off-Hours', icon: Clock },
];

function SectionCard({ title, icon: Icon, children }: {
  title: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-center gap-3 px-6 py-4 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--secondary)' }}
      >
        <Icon className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{title}</span>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full h-10 px-3 rounded-xl text-sm outline-none transition-all"
      style={{
        background: 'var(--background)',
        border: '1px solid var(--border)',
        color: 'var(--foreground)',
      }}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all resize-none"
      style={{
        background: 'var(--background)',
        border: '1px solid var(--border)',
        color: 'var(--foreground)',
      }}
    />
  );
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{label}</div>
        {description && <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-10 h-6 rounded-full transition-colors shrink-0"
        style={{ background: checked ? '#10B981' : 'var(--muted)' }}
      >
        <div
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}

function TagInput({ tags, onChange, placeholder }: {
  tags: string[]; onChange: (tags: string[]) => void; placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) { onChange([...tags, val]); setInput(''); }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
            style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
          >
            {tag}
            <button onClick={() => onChange(tags.filter(t => t !== tag))}>
              <X className="w-3 h-3" style={{ color: 'var(--muted-foreground)' }} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 h-9 px-3 rounded-xl text-sm outline-none"
          style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
        />
        <button
          onClick={add}
          className="h-9 px-3 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors"
          style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

// ─── Working Hours Editor ──────────────────────────────────────────────────
// Writes the FLAT format the WhatsApp webhook reads: { mon: "09:00-18:00", ... }.
// A day toggled OFF is omitted → the assistant replies normally all day (no
// off-hours notice that day). Day-range keys ("mon-fri") from older/onboarding
// data are expanded on read so an existing config still displays correctly.
const WH_DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];
// Order used by the webhook for range matching (sun = index 0).
const WH_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function normalizeTime(t: string): string {
  const [h, m] = (t || '').trim().split(':');
  const hh = String(Math.max(0, Math.min(23, Number(h) || 0))).padStart(2, '0');
  const mm = String(Math.max(0, Math.min(59, Number(m) || 0))).padStart(2, '0');
  return `${hh}:${mm}`;
}

function dayHoursFromConfig(wh: Record<string, string>, dayKey: string): { open: string; close: string } | null {
  for (const [k, v] of Object.entries(wh || {})) {
    if (!v || typeof v !== 'string' || !v.includes('-')) continue;
    const keys = k.toLowerCase().split('-');
    const matches =
      keys.includes(dayKey) ||
      (keys.length === 2 &&
        WH_ORDER.indexOf(keys[0]) <= WH_ORDER.indexOf(dayKey) &&
        WH_ORDER.indexOf(dayKey) <= WH_ORDER.indexOf(keys[1]));
    if (matches) {
      const [open, close] = v.split('-');
      return { open: normalizeTime(open), close: normalizeTime(close) };
    }
  }
  return null;
}

function WorkingHoursEditor({ value, onChange }: {
  value: Record<string, string>; onChange: (v: Record<string, string>) => void;
}) {
  const rows = WH_DAYS.map(d => {
    const parsed = dayHoursFromConfig(value, d.key);
    return { ...d, enabled: !!parsed, open: parsed?.open || '09:00', close: parsed?.close || '18:00' };
  });

  const apply = (key: string, patch: Partial<{ enabled: boolean; open: string; close: string }>) => {
    const next: Record<string, string> = {};
    for (const r of rows) {
      const merged = r.key === key ? { ...r, ...patch } : r;
      if (merged.enabled) next[r.key] = `${normalizeTime(merged.open)}-${normalizeTime(merged.close)}`;
    }
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {rows.map(r => (
        <div key={r.key} className="flex items-center gap-3 py-1">
          <button
            onClick={() => apply(r.key, { enabled: !r.enabled })}
            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
            style={{ background: r.enabled ? '#10B981' : 'var(--muted)' }}
            aria-label={`Toggle hours for ${r.label}`}
          >
            <div
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style={{ transform: r.enabled ? 'translateX(16px)' : 'translateX(0)' }}
            />
          </button>
          <span className="text-sm w-24 shrink-0" style={{ color: 'var(--foreground)' }}>{r.label}</span>
          {r.enabled ? (
            <div className="flex items-center gap-2">
              <input
                type="time" value={r.open} onChange={e => apply(r.key, { open: e.target.value })}
                className="h-9 px-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>to</span>
              <input
                type="time" value={r.close} onChange={e => apply(r.key, { close: e.target.value })}
                className="h-9 px-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
            </div>
          ) : (
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Open all day — no off-hours notice</span>
          )}
        </div>
      ))}
    </div>
  );
}

interface FollowUpTemplate {
  message: string;
  media_url: string;
  media_type: string;
}
type FollowUpTemplates = Record<string, FollowUpTemplate>;

const FOLLOW_UP_TYPES = [
  { key: '30min', label: '30-minute follow-up',   description: 'Gentle nudge if no reply within 30 minutes',   settingKey: 'followup_30min' as const },
  { key: '3hr',   label: '3-hour follow-up',       description: 'Re-engagement message after 3 hours',           settingKey: 'followup_3hr'   as const },
  { key: '24hr',  label: '24-hour follow-up',      description: 'Next-day check-in message',                     settingKey: 'followup_24hr'  as const },
  { key: '7day',  label: '7-day re-engagement',    description: 'Long-term nurture for cold leads',              settingKey: 'followup_7day'  as const },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('business');
  const [dirty, setDirty] = useState(false);
  const [templates, setTemplates] = useState<FollowUpTemplates>({});
  const [expandedFu, setExpandedFu] = useState<Record<string, boolean>>({});
  const [users, setUsers] = useState<any[]>([]);
  const [salesAgentUpdating, setSalesAgentUpdating] = useState<Record<string, boolean>>({});

  const toggleSalesAgent = useCallback(async (userId: string, currentValue: boolean) => {
    setSalesAgentUpdating(s => ({ ...s, [userId]: true }));
    try {
      const res = await fetch('/api/dashboard/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, is_sales_agent: !currentValue }),
      });
      if (res.ok) {
        setUsers(u => u.map(m => m.id === userId ? { ...m, is_sales_agent: !currentValue } : m));
        toast.success(!currentValue ? 'Added to lead pool' : 'Removed from lead pool');
      } else {
        toast.error('Failed to update — try again');
      }
    } catch {
      toast.error('Network error — try again');
    } finally {
      setSalesAgentUpdating(s => ({ ...s, [userId]: false }));
    }
  }, []);

  // Meta Cloud API States
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string; details?: any } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  const update = useCallback(<K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettings(s => ({ ...s, [key]: value }));
    setDirty(true);
  }, []);

  // Set Webhook URL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/webhooks/whatsapp`);
    }
  }, []);

  // Support reading ?tab=whatsapp in query parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab && TABS.some(t => t.id === tab)) {
        setActiveTab(tab);
      }
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/settings').then(r => r.json()),
      fetch('/api/dashboard/follow-up-templates').then(r => r.json()),
      fetch('/api/dashboard/team').then(r => r.json()),
    ])
      .then(([settingsRes, tplRes, teamRes]) => {
        if (settingsRes.data) setSettings({ ...DEFAULT_SETTINGS, ...settingsRes.data });
        if (tplRes.data)      setTemplates(tplRes.data);
        if (teamRes.success && teamRes.users) setUsers(teamRes.users);
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleTestConnection = async () => {
    if (!settings.wa_phone_number_id) {
      toast.error('WhatsApp Phone Number ID is required to run connection test');
      return;
    }
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/dashboard/settings/test-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: settings.wa_access_token,
          phoneNumberId: settings.wa_phone_number_id,
        }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        toast.success('Connection test successful!');
      } else {
        toast.error(`Connection test failed: ${data.error || 'Verification failed'}`);
      }
    } catch (err) {
      toast.error(`Connection test error: ${(err as Error).message}`);
      setTestResult({ success: false, error: (err as Error).message });
    } finally {
      setTestingConnection(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const updateTemplate = useCallback((type: string, field: keyof FollowUpTemplate, value: string) => {
    setTemplates(prev => {
      const base: FollowUpTemplate = prev[type] || { message: '', media_url: '', media_type: 'image' };
      return { ...prev, [type]: { ...base, [field]: value } };
    });
    setDirty(true);
  }, []);

  const insertTemplateVar = useCallback((type: string, variable: string) => {
    setTemplates(prev => {
      const base: FollowUpTemplate = prev[type] || { message: '', media_url: '', media_type: 'image' };
      return {
        ...prev,
        [type]: { ...base, message: base.message + variable },
      };
    });
    setDirty(true);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      // Save main settings
      const res = await fetch('/api/dashboard/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(`Save failed (${res.status}): ${data.error || 'unknown error'}`);
        return;
      }

      // Save follow-up templates (all 4 types)
      await Promise.all(
        FOLLOW_UP_TYPES.map(({ key }) =>
          fetch('/api/dashboard/follow-up-templates', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              follow_up_type: key,
              message:    templates[key]?.message   || null,
              media_url:  templates[key]?.media_url || null,
              media_type: templates[key]?.media_type || 'image',
            }),
          })
        )
      );

      toast.success('Settings saved successfully');
      setDirty(false);
    } catch (err) {
      toast.error(`Save error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-border border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>
            Settings
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
            Configure your AI assistant, business profile, and automation rules.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={save}
          disabled={saving || !dirty}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: dirty ? '#10B981' : 'var(--muted)',
            color: dirty ? 'white' : 'var(--muted-foreground)',
            cursor: dirty ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Saving…' : 'Save Changes'}
        </motion.button>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl overflow-x-auto"
        style={{ background: 'var(--secondary)' }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={{
              background: activeTab === tab.id ? 'var(--card)' : 'transparent',
              color: activeTab === tab.id ? 'var(--foreground)' : 'var(--muted-foreground)',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Business */}
      {activeTab === 'business' && (
        <motion.div key="business" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <SectionCard title="Business Profile" icon={Building2}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Business Name">
                <Input value={settings.business_name} onChange={v => update('business_name', v)} placeholder="Aries Ventures" />
              </Field>
              <Field label="Business Type">
                <Input value={settings.business_type} onChange={v => update('business_type', v)} placeholder="Restaurant, Salon, E-commerce…" />
              </Field>
              <Field label="Business Phone">
                <PhoneInput value={settings.business_phone || ''} onChange={v => update('business_phone', v)} />
              </Field>
              <Field label="Business Email">
                <Input value={settings.business_email || ''} onChange={v => update('business_email', v)} type="email" placeholder="hello@yourbusiness.com" />
              </Field>
              <Field label="Website">
                <Input value={settings.business_website || ''} onChange={v => update('business_website', v)} placeholder="https://yourbusiness.com" />
              </Field>
              <Field label="Address">
                <Input value={settings.business_address || ''} onChange={v => update('business_address', v)} placeholder="123 Main St, City" />
              </Field>
            </div>
            
            <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <Field label="Industry">
                  <select 
                    value={settings.industry || 'retail'} 
                    onChange={e => update('industry', e.target.value)}
                    className="w-full h-10 px-3 rounded-xl text-sm outline-none transition-all"
                    style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  >
                    <option value="retail">Retail / E-commerce (Customers)</option>
                    <option value="salon">Salon / Spa (Guests)</option>
                    <option value="medical">Clinic / Medical (Patients)</option>
                    <option value="real_estate">Real Estate (Clients)</option>
                    <option value="restaurant">Restaurant / Cafe (Diners)</option>
                    <option value="custom">Other / Custom</option>
                  </select>
                </Field>
              </div>
              <Field label="Core Offerings & Services">
                <Textarea 
                  value={settings.core_services || ''} 
                  onChange={v => update('core_services', v)} 
                  placeholder="e.g., We offer residential plumbing services including leak repair, pipe installation, and emergency maintenance. Our base call-out fee is $50..." 
                  rows={4} 
                />
              </Field>
              <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
                Teach the AI about what you sell and how you sell it. The more details you provide, the better it can sell for you.
              </p>
            </div>
          </SectionCard>
        </motion.div>
      )}

      {/* Tab: WhatsApp */}
      {activeTab === 'whatsapp' && (
        <motion.div key="whatsapp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          {/* Connection Status Card */}
          <SectionCard title="WhatsApp Connection Status" icon={MessageSquare}>
            {settings.wa_phone_number_id && settings.wa_access_token ? (
              <div className="flex items-center gap-4 py-2">
                <div
                  className="flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-semibold"
                  style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }}
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Meta API Connected
                </div>
                <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  Phone ID: <span className="font-mono font-bold">{settings.wa_phone_number_id}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <div
                  className="flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-semibold"
                  style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}
                >
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Connection Pending
                </div>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  Provide your Meta credentials below to activate your automated WhatsApp chatbot.
                </span>
              </div>
            )}
          </SectionCard>

          {/* Credentials Card */}
          <SectionCard title="Meta Cloud API Credentials" icon={Key}>
            <p className="text-xs -mt-1" style={{ color: 'var(--muted-foreground)' }}>
              Configure your WhatsApp Business integration using your own Meta Developer App credentials. Find these values in your Meta App Dashboard under WhatsApp &gt; API Setup.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2">
              <Field label="WhatsApp Phone Number ID">
                <Input
                  value={settings.wa_phone_number_id || ''}
                  onChange={v => update('wa_phone_number_id', v)}
                  placeholder="e.g. 104598129038102"
                />
              </Field>
              <Field label="WhatsApp Business Account ID (WABA ID)">
                <Input
                  value={settings.wa_business_account_id || ''}
                  onChange={v => update('wa_business_account_id', v)}
                  placeholder="e.g. 103982938102830"
                />
              </Field>
            </div>
            
            <div className="mt-4">
              <Field label="System User Access Token">
                <div className="relative flex items-center">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={settings.wa_access_token || ''}
                    onChange={e => update('wa_access_token', e.target.value)}
                    placeholder="EAAW..."
                    className="w-full h-10 pl-3 pr-10 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 text-muted-foreground hover:text-foreground focus:outline-none"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                  A permanent access token generated via Meta Business Manager for your System User.
                </p>
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Meta App Secret">
                <div className="relative flex items-center">
                  <input
                    type={showAppSecret ? 'text' : 'password'}
                    value={settings.wa_app_secret || ''}
                    onChange={e => update('wa_app_secret', e.target.value)}
                    placeholder="e.g. a1b2c3d4e5f6..."
                    className="w-full h-10 pl-3 pr-10 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAppSecret(!showAppSecret)}
                    className="absolute right-3 text-muted-foreground hover:text-foreground focus:outline-none"
                  >
                    {showAppSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                  Found in your Meta Developer App &gt; Settings &gt; Basic &gt; App Secret. Used to verify webhook signatures.
                </p>
              </Field>
            </div>

            <div className="mt-6 pt-5 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4" style={{ borderColor: 'var(--border)' }}>
              <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Save your changes before running the connection test.
              </div>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection || !settings.wa_phone_number_id}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: settings.wa_phone_number_id ? 'var(--secondary)' : 'var(--muted)',
                  border: '1px solid var(--border)',
                  color: settings.wa_phone_number_id ? 'var(--foreground)' : 'var(--muted-foreground)',
                  cursor: settings.wa_phone_number_id && !testingConnection ? 'pointer' : 'not-allowed',
                }}
              >
                {testingConnection ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {testingConnection ? 'Testing Connection...' : 'Test Connection'}
              </button>
            </div>

            {testResult && (
              <div
                className="mt-4 p-4 rounded-xl text-sm border"
                style={{
                  background: testResult.success ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                  borderColor: testResult.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                  color: testResult.success ? '#10B981' : '#EF4444',
                }}
              >
                <div className="flex items-start gap-2.5">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold">{testResult.success ? 'Success! Connection is working.' : 'Connection Failed'}</div>
                    {testResult.success && testResult.details && (
                      <div className="text-xs mt-1.5 space-y-1 font-mono text-emerald-600/90 dark:text-emerald-400/90">
                        <div>Verified Name: {testResult.details.verified_name || 'N/A'}</div>
                        <div>Display Phone: {testResult.details.display_phone_number || 'N/A'}</div>
                        <div>Quality Rating: {testResult.details.quality_rating || 'N/A'}</div>
                      </div>
                    )}
                    {!testResult.success && testResult.error && (
                      <p className="text-xs mt-1 leading-relaxed">{testResult.error}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Webhook Settings Card */}
          <SectionCard title="Meta Webhook Configuration" icon={Zap}>
            <p className="text-xs -mt-1" style={{ color: 'var(--muted-foreground)' }}>
              To receive customer messages, copy these values into your Meta App Webhook configuration.
            </p>
            
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground block mb-1">
                  Callback URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    type="text"
                    value={webhookUrl}
                    className="flex-1 h-9 px-3 rounded-lg text-xs font-mono border outline-none bg-background text-muted-foreground"
                    style={{ borderColor: 'var(--border)' }}
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookUrl, 'Callback URL')}
                    className="h-9 w-9 flex items-center justify-center rounded-lg border hover:bg-secondary transition-colors"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground block mb-1">
                  Verify Token
                </label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    type="text"
                    value={settings.wa_verify_token || ''}
                    className="flex-1 h-9 px-3 rounded-lg text-xs font-mono border outline-none bg-background text-muted-foreground"
                    style={{ borderColor: 'var(--border)' }}
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(settings.wa_verify_token || '', 'Verify Token')}
                    className="h-9 w-9 flex items-center justify-center rounded-lg border hover:bg-secondary transition-colors"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 p-4 rounded-xl text-xs space-y-2.5" style={{ background: 'var(--secondary)', border: '1px solid var(--border)' }}>
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-cyan-500" />
                Webhook Setup Instructions
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground leading-relaxed">
                <li>Go to the <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline inline-flex items-center gap-0.5">Meta Developer Portal <ExternalLink className="w-3 h-3" /></a> and select your App.</li>
                <li>Add the <strong>WhatsApp</strong> product to your App, and go to the <strong>Configuration</strong> sub-tab.</li>
                <li>Under <strong>Webhooks</strong>, click <strong>Edit</strong> and paste the Callback URL and Verify Token from above.</li>
                <li>Click <strong>Verify and Save</strong>.</li>
                <li>Under Webhook fields, click <strong>Manage</strong> and subscribe to the <strong>messages</strong> field (Crucial for receiving chat replies).</li>
              </ol>
            </div>
          </SectionCard>

        </motion.div>
      )}

      {/* Tab: WA Profile */}
      {activeTab === 'wabizprofile' && <WaProfileTab />}

      {/* Tab: AI Behavior */}
      {activeTab === 'aibehavior' && (
        <motion.div key="aibehavior" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

          {/* Language & length */}
          <SectionCard title="Language & Response Style" icon={MessageSquare}>
            <Field label="Reply Language">
              <select
                value={settings.bot_language_mode || 'auto'}
                onChange={e => update('bot_language_mode', e.target.value as SettingsData['bot_language_mode'])}
                className="w-full h-10 px-3 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                <option value="auto">Auto — match the customer (English→English, Hindi→Hindi, Hinglish→Hinglish)</option>
                <option value="english">English only — always reply in English</option>
                <option value="hindi">Hindi only — always reply in Hindi</option>
              </select>
              <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                Auto is recommended — the bot mirrors whatever language each customer writes in. Lock it to English or Hindi only if you want one fixed language regardless of the customer.
              </p>
            </Field>
            <Field label="Response Length">
              <select
                value={settings.response_length || 'short'}
                onChange={e => update('response_length', e.target.value as SettingsData['response_length'])}
                className="w-full h-10 px-3 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                <option value="short">Short — 1-2 lines (snappy, WhatsApp-style)</option>
                <option value="medium">Medium — 3-4 lines (a bit more detail)</option>
                <option value="detailed">Detailed — thorough answers (up to ~6-8 lines)</option>
              </select>
              <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                Controls how long the bot&apos;s replies are. Detailed suits info-heavy businesses (clinics, travel); short suits quick bookings.
              </p>
            </Field>
          </SectionCard>

          {/* Prohibited topics */}
          <SectionCard title="Prohibited Topics" icon={AlertCircle}>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              The bot will refuse to discuss these and politely steer back to your business. Add one topic at a time (e.g. &quot;politics&quot;, &quot;competitor pricing&quot;, &quot;medical advice&quot;).
            </p>
            <TagInput
              tags={settings.prohibited_topics || []}
              onChange={v => update('prohibited_topics', v)}
              placeholder="Type a topic and press Enter"
            />
          </SectionCard>

          {/* Always-mention rules */}
          <SectionCard title="Always-Mention Rules" icon={Star}>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              When a topic comes up, the bot will naturally weave in your note. Example: when &quot;dinner&quot; comes up → mention &quot;our Saturday live music&quot;.
            </p>
            <div className="space-y-3">
              {(settings.always_mention_rules || []).map((rule, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-2 items-start">
                  <div className="flex-1 w-full">
                    <Input
                      value={rule.topic}
                      onChange={v => {
                        const next = [...settings.always_mention_rules];
                        next[i] = { ...next[i], topic: v };
                        update('always_mention_rules', next);
                      }}
                      placeholder="When this topic comes up…"
                    />
                  </div>
                  <div className="flex-1 w-full">
                    <Input
                      value={rule.mention}
                      onChange={v => {
                        const next = [...settings.always_mention_rules];
                        next[i] = { ...next[i], mention: v };
                        update('always_mention_rules', next);
                      }}
                      placeholder="…always mention this"
                    />
                  </div>
                  <button
                    onClick={() => update('always_mention_rules', settings.always_mention_rules.filter((_, j) => j !== i))}
                    className="h-10 px-3 rounded-xl shrink-0 flex items-center"
                    style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => update('always_mention_rules', [...(settings.always_mention_rules || []), { topic: '', mention: '' }])}
                className="h-9 px-3 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors"
                style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                <Plus className="w-3.5 h-3.5" /> Add rule
              </button>
            </div>
          </SectionCard>

          {/* Competitor deflection */}
          <SectionCard title="Competitor Handling" icon={Zap}>
            <Field label="Competitor Names">
              <TagInput
                tags={settings.competitors || []}
                onChange={v => update('competitors', v)}
                placeholder="Add a competitor name and press Enter"
              />
            </Field>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              If a customer mentions or asks to compare with these, the bot won&apos;t criticise them or discuss their prices — it redirects to why you&apos;re a great choice.
            </p>
            <Field label="Custom Deflection Line (optional)">
              <Textarea
                value={settings.competitor_deflection_reply || ''}
                onChange={v => update('competitor_deflection_reply', v)}
                placeholder="e.g. I can only speak for us — we'd love to show you what makes our food special!"
                rows={2}
              />
            </Field>
          </SectionCard>

        </motion.div>
      )}

      {/* Tab: Staff */}
      {activeTab === 'staff' && (
        <motion.div key="staff" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

          {/* Enable / Disable toggle */}
          <SectionCard title="Staff Contact" icon={Users}>
            {/* Master on/off toggle */}
            <div
              className="flex items-center justify-between p-3 rounded-xl mb-5"
              style={{ background: settings.escalation_enabled ? 'rgba(16,185,129,0.06)' : 'var(--secondary)', border: `1px solid ${settings.escalation_enabled ? 'rgba(16,185,129,0.25)' : 'var(--border)'}` }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  Staff Alerts {settings.escalation_enabled ? '— Active' : '— Disabled'}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  {settings.escalation_enabled ? 'Staff will be notified on WhatsApp when a customer needs help.' : 'Alerts are off — the bot will still pause but staff won\'t be notified.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => update('escalation_enabled', !settings.escalation_enabled)}
                className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
                style={{ background: settings.escalation_enabled ? 'rgb(16,185,129)' : 'var(--muted)' }}
                role="switch"
                aria-checked={settings.escalation_enabled}
              >
                <span
                  className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-200"
                  style={{ transform: settings.escalation_enabled ? 'translateX(20px)' : 'translateX(0px)' }}
                />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Staff Name">
                <Input value={settings.staff_name || ''} onChange={v => update('staff_name', v)} placeholder="Rahul" />
              </Field>
              <Field label="Staff WhatsApp Phone">
                <PhoneInput value={settings.staff_phone || ''} onChange={v => update('staff_phone', v)} />
              </Field>
              <Field label="Manager Phone (Escalations)">
                <PhoneInput value={settings.manager_phone || ''} onChange={v => update('manager_phone', v)} />
              </Field>
              <Field label="Staff Alert Email">
                <Input
                  type="email"
                  value={settings.staff_email || ''}
                  onChange={v => update('staff_email', v)}
                  placeholder="staff@yourbusiness.com"
                />
              </Field>
              <Field label="Escalation Timeout (mins)">
                <Input
                  type="number"
                  value={String(settings.escalation_timeout_mins)}
                  onChange={v => update('escalation_timeout_mins', parseInt(v) || 5)}
                  placeholder="30"
                />
              </Field>
            </div>
          </SectionCard>

          {/* Escalation triggers */}
          <SectionCard title="Escalation Triggers" icon={Zap}>
            <p className="text-xs -mt-1 mb-4" style={{ color: 'var(--muted-foreground)' }}>
              Add keywords that force an escalation when a customer says them — on top of the AI's own judgment. Type a word and press Enter.
            </p>
            <Field label="Escalation Keywords">
              <TagInput
                tags={settings.escalation_keywords || []}
                onChange={v => update('escalation_keywords', v)}
                placeholder="e.g. complaint, cancel, refund, manager…"
              />
            </Field>

            {/* Customer-facing reply */}
            <div className="mt-5">
              <Field label="Bot Reply to Customer (on escalation)">
                <textarea
                  rows={3}
                  value={settings.escalation_reply || ''}
                  onChange={e => update('escalation_reply', e.target.value)}
                  placeholder={`I'm connecting you with ${settings.staff_name || 'our team'} right away 🙏 They'll be with you shortly.`}
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none transition-colors"
                  style={{
                    background: 'var(--input)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                    fontFamily: 'inherit',
                    lineHeight: '1.6',
                  }}
                />
              </Field>
              <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                What the bot says to the customer when it hands over to staff. Leave blank to use the default.
              </p>
            </div>
          </SectionCard>

          {/* Staff alert message */}
          <SectionCard title="Staff Alert Message" icon={Bell}>
            <p className="text-xs -mt-1 mb-4" style={{ color: 'var(--muted-foreground)' }}>
              This WhatsApp message is sent to your staff number when an escalation fires. Use variables to include customer details.
            </p>
            <Field label="Alert Template">
              <textarea
                rows={7}
                value={settings.escalation_alert_template || ''}
                onChange={e => update('escalation_alert_template', e.target.value)}
                placeholder={`🚨 Escalation Alert — {{business_name}}\n\nCustomer: {{customer_name}}\nPhone: +{{customer_phone}}\nReason: {{reason}}\nMessage: {{message}}\n\n👉 Reply on Live Chat: https://ariesai.in/dashboard/chat`}
                className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none transition-colors"
                style={{
                  background: 'var(--input)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontFamily: 'inherit',
                  lineHeight: '1.6',
                }}
              />
            </Field>
            {/* Variable chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[
                { tag: '{{customer_name}}',  label: 'Customer Name' },
                { tag: '{{customer_phone}}', label: 'Phone' },
                { tag: '{{reason}}',         label: 'Reason' },
                { tag: '{{message}}',        label: 'Last Message' },
                { tag: '{{business_name}}',  label: 'Business Name' },
              ].map(({ tag, label }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => update('escalation_alert_template', (settings.escalation_alert_template || '') + tag)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono transition-colors cursor-pointer"
                  style={{
                    background: 'rgba(6,182,212,0.08)',
                    border: '1px solid rgba(6,182,212,0.25)',
                    color: 'var(--foreground)',
                  }}
                  title={`Insert ${label}`}
                >
                  <span style={{ color: 'rgb(6,182,212)' }}>+</span> {tag}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
              Click a variable to insert it. Leave blank to use the platform default.
            </p>

            <div
              className="rounded-xl p-4 text-sm mt-4"
              style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--muted-foreground)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="w-3.5 h-3.5 text-cyan-500" />
                <span className="font-semibold text-xs" style={{ color: 'var(--foreground)' }}>How escalation works</span>
              </div>
              When a customer says a trigger keyword or asks for a human, the AI pauses and sends your alert to staff on WhatsApp. After {settings.escalation_timeout_mins || 30} mins the bot resumes automatically.
            </div>
          </SectionCard>

          {/* Booking alert message */}
          <SectionCard title="Booking Alert Message" icon={Bell}>
            <p className="text-xs -mt-1 mb-4" style={{ color: 'var(--muted-foreground)' }}>
              This WhatsApp message is sent to your staff number every time a customer confirms a booking. Customize it with booking details.
            </p>
            <Field label="Booking Alert Template">
              <textarea
                rows={7}
                value={settings.booking_alert_template || ''}
                onChange={e => update('booking_alert_template', e.target.value)}
                placeholder={`🔔 *NEW BOOKING — {{business_name}}*\n\n👤 {{customer_name}}\n📞 {{customer_phone}}\n👥 {{guest_count}}\n📅 {{date}}\n⏰ {{time}}\n🪑 {{table}}\n🆔 {{reservation_id}}`}
                className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none transition-colors"
                style={{
                  background: 'var(--input)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontFamily: 'inherit',
                  lineHeight: '1.6',
                }}
              />
            </Field>
            {/* Variable chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[
                { tag: '{{customer_name}}',   label: 'Customer Name' },
                { tag: '{{customer_phone}}',  label: 'Phone' },
                { tag: '{{guest_count}}',     label: 'Guests' },
                { tag: '{{date}}',            label: 'Date' },
                { tag: '{{time}}',            label: 'Time' },
                { tag: '{{table}}',           label: 'Table' },
                { tag: '{{reservation_id}}',  label: 'Reservation ID' },
                { tag: '{{business_name}}',   label: 'Business Name' },
                { tag: '{{special_requests}}',label: 'Special Requests' },
              ].map(({ tag, label }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => update('booking_alert_template', (settings.booking_alert_template || '') + tag)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono transition-colors cursor-pointer"
                  style={{
                    background: 'rgba(6,182,212,0.08)',
                    border: '1px solid rgba(6,182,212,0.25)',
                    color: 'var(--foreground)',
                  }}
                  title={`Insert ${label}`}
                >
                  <span style={{ color: 'rgb(6,182,212)' }}>+</span> {tag}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
              Click a variable to insert it. Leave blank to use the platform default.
            </p>

            <div
              className="rounded-xl p-4 text-sm mt-4"
              style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--muted-foreground)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="w-3.5 h-3.5 text-cyan-500" />
                <span className="font-semibold text-xs" style={{ color: 'var(--foreground)' }}>How booking alerts work</span>
              </div>
              Every time the AI confirms a table booking, this message is instantly sent to your staff WhatsApp number so they know who is coming, when, and how many guests.
            </div>
          </SectionCard>

        </motion.div>
      )}

      {/* Tab: Lead Routing */}
      {activeTab === 'leads' && (
        <motion.div key="leads" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

          {/* Lead Assignment */}
          <SectionCard title="Lead Assignment" icon={Target}>

            {/* How it works */}
            <div
              className="rounded-xl p-4 text-xs space-y-2.5"
              style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.18)' }}
            >
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                <span className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>How assignment works</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
                <li><strong style={{ color: 'var(--foreground)' }}>Default person set</strong> — every new lead always goes to that person only.</li>
                <li><strong style={{ color: 'var(--foreground)' }}>No default, lead pool has members</strong> — leads rotate round-robin through the lead pool.</li>
                <li><strong style={{ color: 'var(--foreground)' }}>No default, empty pool</strong> — all team members share leads equally in rotation.</li>
              </ol>
              <p style={{ color: 'var(--muted-foreground)' }}>The assigned person receives an email at their account address. Currently only triggered by Meta Ad (Click-to-WhatsApp) leads.</p>
            </div>

            {/* Default Assignee */}
            <Field label="Default Assignee">
              <select
                value={settings.default_lead_assignee_id || ''}
                onChange={e => update('default_lead_assignee_id', e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                <option value="">— Round-robin (no fixed default) —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name ? `${u.full_name} (${u.email})` : u.email} · {u.role}
                  </option>
                ))}
              </select>
              <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
                If set, this person receives every lead. Leave unset to use round-robin rotation through the lead pool.
              </p>
            </Field>

          </SectionCard>

          {/* Lead Pool */}
          <SectionCard title="Lead Pool" icon={UserCheck}>
            <p className="text-xs -mt-1" style={{ color: 'var(--muted-foreground)' }}>
              Toggle who is in the round-robin pool. People outside the pool still exist in your team — they just won't receive auto-assigned leads. Changes save instantly.
            </p>

            {users.length === 0 ? (
              <div className="text-sm text-center py-6" style={{ color: 'var(--muted-foreground)' }}>
                No team members yet. Invite team members from the Team page.
              </div>
            ) : (
              <div className="space-y-2 mt-1">
                {users.map(u => {
                  const isDefault = settings.default_lead_assignee_id === u.id;
                  const inPool = Boolean(u.is_sales_agent);
                  const updating = Boolean(salesAgentUpdating[u.id]);
                  const initials = (u.full_name || u.email || '?')
                    .split(' ')
                    .slice(0, 2)
                    .map((w: string) => w[0])
                    .join('')
                    .toUpperCase();

                  return (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
                      style={{
                        borderColor: inPool ? 'rgba(16,185,129,0.3)' : 'var(--border)',
                        background: inPool ? 'rgba(16,185,129,0.03)' : 'var(--card)',
                      }}
                    >
                      {/* Avatar */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                        style={{
                          background: inPool ? 'rgba(16,185,129,0.15)' : 'var(--secondary)',
                          color: inPool ? '#10B981' : 'var(--muted-foreground)',
                          border: `1px solid ${inPool ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                        }}
                      >
                        {initials}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                            {u.full_name || '(no name)'}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-md font-medium uppercase tracking-wide"
                            style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                          >
                            {u.role}
                          </span>
                          {isDefault && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold"
                              style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.25)', color: 'rgb(6,182,212)' }}
                            >
                              default
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                          <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{u.email}</span>
                        </div>
                      </div>

                      {/* Pool status + toggle */}
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs hidden sm:block" style={{ color: inPool ? '#10B981' : 'var(--muted-foreground)' }}>
                          {inPool ? 'In pool' : 'Not in pool'}
                        </span>
                        <button
                          disabled={updating}
                          onClick={() => toggleSalesAgent(u.id, inPool)}
                          className="relative w-10 h-6 rounded-full transition-colors shrink-0"
                          style={{ background: inPool ? '#10B981' : 'var(--muted)', opacity: updating ? 0.5 : 1 }}
                          aria-label={inPool ? 'Remove from lead pool' : 'Add to lead pool'}
                        >
                          {updating ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            </div>
                          ) : (
                            <div
                              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                              style={{ transform: inPool ? 'translateX(16px)' : 'translateX(0)' }}
                            />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Summary line */}
            {users.length > 0 && (() => {
              const poolMembers = users.filter(u => u.is_sales_agent);
              const defaultPerson = users.find(u => u.id === settings.default_lead_assignee_id);
              if (defaultPerson) {
                return (
                  <p className="text-xs pt-1" style={{ color: 'var(--muted-foreground)' }}>
                    All leads go to <strong style={{ color: 'var(--foreground)' }}>{defaultPerson.full_name || defaultPerson.email}</strong> (default assignee).
                  </p>
                );
              }
              if (poolMembers.length === 0) {
                return (
                  <p className="text-xs pt-1" style={{ color: '#F59E0B' }}>
                    No one in the lead pool — leads will rotate through all {users.length} team member{users.length !== 1 ? 's' : ''}.
                  </p>
                );
              }
              return (
                <p className="text-xs pt-1" style={{ color: 'var(--muted-foreground)' }}>
                  Leads rotate through <strong style={{ color: 'var(--foreground)' }}>{poolMembers.length}</strong> pool member{poolMembers.length !== 1 ? 's' : ''}:{' '}
                  {poolMembers.map(m => m.full_name || m.email).join(', ')}.
                </p>
              );
            })()}
          </SectionCard>

          {/* Lead Notification Email Template */}
          <SectionCard title="Lead Notification Email" icon={Mail}>
            <p className="text-xs -mt-1 mb-1" style={{ color: 'var(--muted-foreground)' }}>
              Customize the email sent to the assigned person when a new lead arrives. Leave blank to use the platform default.
            </p>
            <Field label="Email Body">
              <textarea
                rows={7}
                value={settings.lead_assigned_email_template || ''}
                onChange={e => update('lead_assigned_email_template', e.target.value)}
                placeholder={`A new lead (<strong>{{lead_name}}</strong>) from <strong>{{source}}</strong> has just been assigned to you at <strong>{{business_name}}</strong>.\n\nOpen your AriesAI dashboard to reply and manage this lead.`}
                className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none transition-colors"
                style={{
                  background: 'var(--input)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontFamily: 'inherit',
                  lineHeight: '1.6',
                }}
              />
            </Field>
            {/* Variable chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[
                { tag: '{{lead_name}}',    label: 'Lead name / phone' },
                { tag: '{{business_name}}', label: 'Business name' },
                { tag: '{{source}}',        label: 'Traffic source' },
              ].map(({ tag, label }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => update('lead_assigned_email_template', (settings.lead_assigned_email_template || '') + tag)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono transition-colors cursor-pointer"
                  style={{
                    background: 'rgba(6,182,212,0.08)',
                    border: '1px solid rgba(6,182,212,0.25)',
                    color: 'var(--foreground)',
                  }}
                  title={`Insert ${label}`}
                >
                  <span style={{ color: 'rgb(6,182,212)' }}>+</span> {tag}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>
              Supports HTML. Sent from <span className="font-mono">notifications@ariesai.in</span> via Resend.
            </p>

            {/* Preview of default */}
            {!settings.lead_assigned_email_template && (
              <div
                className="mt-4 p-4 rounded-xl text-xs space-y-1.5"
                style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              >
                <div className="font-semibold text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>Platform default (what gets sent now)</div>
                <p style={{ color: 'var(--foreground)' }}>Subject: <strong>New lead assigned — [Lead Name]</strong></p>
                <p>A new lead from <em>Meta Ad</em> has been assigned to you at <em>[Business Name]</em>. Open your AriesAI dashboard to reply.</p>
              </div>
            )}
          </SectionCard>

        </motion.div>
      )}

      {/* Tab: Follow-ups */}
      {activeTab === 'followup' && (
        <motion.div key="followup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <SectionCard title="Automated Follow-up Sequences" icon={Bell}>
            <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>
              Enable sequences and optionally write a custom message with an image. Leave message blank to use AI-generated text.
            </p>
            <div className="space-y-3">
              {FOLLOW_UP_TYPES.map(({ key, label, description, settingKey }) => {
                const enabled  = settings[settingKey] as boolean;
                const expanded = expandedFu[key] ?? false;
                const tpl      = templates[key] || { message: '', media_url: '', media_type: 'image' };
                const hasMedia = !!tpl.media_url;
                return (
                  <div
                    key={key}
                    className="rounded-xl overflow-hidden border"
                    style={{ borderColor: enabled ? 'rgba(16,185,129,0.3)' : 'var(--border)', background: 'var(--card)' }}
                  >
                    {/* Toggle row */}
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{label}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{description}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Expand/customise button */}
                        <button
                          onClick={() => setExpandedFu(p => ({ ...p, [key]: !p[key] }))}
                          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-colors"
                          style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                        >
                          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          Customize
                        </button>
                        {/* Toggle */}
                        <button
                          onClick={() => update(settingKey, !enabled)}
                          className="relative w-10 h-6 rounded-full transition-colors shrink-0"
                          style={{ background: enabled ? '#10B981' : 'var(--muted)' }}
                        >
                          <div
                            className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                            style={{ transform: enabled ? 'translateX(16px)' : 'translateX(0)' }}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Expandable customisation panel */}
                    {expanded && (
                      <div
                        className="px-4 pb-4 space-y-3 border-t"
                        style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.02)' }}
                      >
                        {/* Variable chips */}
                        <div className="flex flex-wrap gap-1.5 pt-3">
                          <span className="text-[10px] font-semibold uppercase tracking-widest self-center pr-1" style={{ color: 'var(--muted-foreground)' }}>Variables:</span>
                          {['{{name}}', '{{business_name}}'].map(v => (
                            <button
                              key={v}
                              onClick={() => insertTemplateVar(key, v)}
                              className="text-xs px-2 py-0.5 rounded-md font-mono transition-colors"
                              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981' }}
                            >
                              {v}
                            </button>
                          ))}
                        </div>

                        {/* Message textarea */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
                            Message
                          </label>
                          <textarea
                            value={tpl.message}
                            onChange={e => updateTemplate(key, 'message', e.target.value)}
                            placeholder={`e.g. Hey {{name}}! Just checking in from {{business_name}}. Did you get a chance to review our offer? 😊`}
                            rows={4}
                            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none transition-all"
                            style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                          />
                          <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                            Leave blank to let AI generate a contextual message automatically.
                          </p>
                        </div>

                        {/* Image URL */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
                            Image URL (optional)
                          </label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
                              <input
                                type="url"
                                value={tpl.media_url}
                                onChange={e => updateTemplate(key, 'media_url', e.target.value)}
                                placeholder="https://your-site.com/image.jpg"
                                className="w-full h-10 pl-8 pr-3 rounded-xl text-sm outline-none transition-all"
                                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                              />
                            </div>
                          </div>
                          {/* Live image preview */}
                          {hasMedia && (
                            <div className="mt-2 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)', maxWidth: 180 }}>
                              <img
                                src={tpl.media_url}
                                alt="preview"
                                className="w-full object-cover"
                                style={{ maxHeight: 120 }}
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </div>
                          )}
                          <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                            Paste a direct image link. If provided, the message becomes the image caption.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </motion.div>
      )}

      {/* Tab: Off-Hours */}
      {activeTab === 'offhours' && (
        <motion.div key="offhours" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <SectionCard title="Off-Hours Handling" icon={Clock}>
            <Toggle
              checked={settings.off_hours_enabled}
              onChange={v => update('off_hours_enabled', v)}
              label="Send automatic off-hours reply"
              description="When ON, anyone messaging outside the hours below gets an automatic notice. When OFF, your AI assistant replies normally 24/7."
            />
            {settings.off_hours_enabled ? (
              <>
                <Field label="Working Hours (IST)">
                  <WorkingHoursEditor
                    value={settings.working_hours || {}}
                    onChange={v => update('working_hours', v)}
                  />
                </Field>
                <Field label="Off-Hours Message">
                  <Textarea
                    value={settings.off_hours_message || ''}
                    onChange={v => update('off_hours_message', v)}
                    placeholder="Thanks for reaching out! We're currently closed. Our team will get back to you during business hours."
                    rows={4}
                  />
                </Field>
                <Toggle
                  checked={settings.off_hours_capture_lead}
                  onChange={v => update('off_hours_capture_lead', v)}
                  label="Capture lead when offline"
                  description="Still collect name and phone even outside working hours"
                />
              </>
            ) : (
              <div
                className="rounded-xl p-4 text-xs"
                style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--muted-foreground)' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-semibold" style={{ color: 'var(--foreground)' }}>Off-hours auto-reply is off</span>
                </div>
                Your AI assistant answers messages 24/7. Turn this on to set business hours and send an automatic notice when you&apos;re closed.
              </div>
            )}
          </SectionCard>

          <SectionCard title="Review Automation" icon={Star}>
            <Toggle
              checked={settings.review_automation_enabled}
              onChange={v => update('review_automation_enabled', v)}
              label="Send post-visit review requests"
              description="Automatically message guests the day after their booking to ask for feedback"
            />
            <Field label="Google Review URL">
              <Input
                value={settings.google_review_url || ''}
                onChange={v => update('google_review_url', v)}
                placeholder="https://g.page/r/your-business/review"
              />
            </Field>
            <div
              className="rounded-xl p-4 text-xs"
              style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--muted-foreground)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-3.5 h-3.5 text-emerald-500" />
                <span className="font-semibold" style={{ color: 'var(--foreground)' }}>Where to find your review link</span>
              </div>
              Google Business Profile → Ask for reviews → copy the short link. Happy guests get directed here to leave a 5-star review.
            </div>
          </SectionCard>
        </motion.div>
      )}

      {/* Dirty state save reminder */}
      {dirty && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-medium"
          style={{
            background: 'var(--foreground)',
            color: 'var(--background)',
            zIndex: 50,
          }}
        >
          <AlertCircle className="w-4 h-4" />
          You have unsaved changes
          <button
            onClick={save}
            className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
            style={{ background: 'var(--background)', color: 'var(--foreground)' }}
          >
            <Save className="w-3.5 h-3.5" /> Save now
          </button>
        </motion.div>
      )}
    </div>
  );
}
