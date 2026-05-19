'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Bot, Clock, Phone, Mail, Globe, MapPin,
  Users, Zap, Save, CheckCircle2, AlertCircle, Plus, X,
  MessageSquare, BrainCircuit, Bell
} from 'lucide-react';
import { toast } from 'sonner';

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
  followup_30min: boolean;
  followup_3hr: boolean;
  followup_24hr: boolean;
  followup_7day: boolean;
  escalation_timeout_mins: number;
  hot_keywords: string[];
  warm_keywords: string[];
  off_hours_message: string;
  off_hours_capture_lead: boolean;
  // WhatsApp status (read-only, set by admin)
  gupshup_phone_number: string;
  // Outbound webhook
  outbound_webhook_url: string;
}

const DEFAULT_SETTINGS: SettingsData = {
  business_name: '', business_type: '', business_phone: '',
  business_address: '', business_website: '', business_email: '',
  bot_name: '', bot_personality: 'sales_pro', welcome_message: '', welcome_offer: '',
  usps: [], core_services: '', industry: 'retail', staff_phone: '', staff_name: '', manager_phone: '',
  followup_30min: true, followup_3hr: true, followup_24hr: true, followup_7day: false,
  escalation_timeout_mins: 5, hot_keywords: [], warm_keywords: [],
  off_hours_message: '', off_hours_capture_lead: true,
  gupshup_phone_number: '',
  outbound_webhook_url: ''
};

const TABS = [
  { id: 'business', label: 'Business', icon: Building2 },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { id: 'bot', label: 'AI Bot', icon: Bot },
  { id: 'staff', label: 'Staff & Alerts', icon: Users },
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('business');
  const [dirty, setDirty] = useState(false);

  const update = useCallback(<K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettings(s => ({ ...s, [key]: value }));
    setDirty(true);
  }, []);

  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then(r => r.json())
      .then(({ data }) => {
        if (data) setSettings({ ...DEFAULT_SETTINGS, ...data });
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
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
                <Input value={settings.business_phone || ''} onChange={v => update('business_phone', v)} placeholder="+91 98765 43210" />
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
          <SectionCard title="WhatsApp Connection" icon={MessageSquare}>
            {settings.gupshup_phone_number ? (
              <div className="flex items-center gap-4 py-2">
                <div
                  className="flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-semibold"
                  style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }}
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  WhatsApp Active
                </div>
                <span className="text-sm font-mono" style={{ color: 'var(--muted-foreground)' }}>
                  +{settings.gupshup_phone_number.slice(0, -3).replace(/./g, '•')}{settings.gupshup_phone_number.slice(-3)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <div
                  className="flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-semibold"
                  style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: 'var(--muted-foreground)' }} />
                  Setup in Progress
                </div>
                <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  Your Aries AI team will activate WhatsApp for your account.
                </span>
              </div>
            )}
          </SectionCard>

          {/* Outbound Webhook */}
          <SectionCard title="Outbound Webhook (Zapier / Make / Custom)" icon={Zap}>
            <Field label="Webhook URL">
              <Input
                value={settings.outbound_webhook_url || ''}
                onChange={v => update('outbound_webhook_url', v)}
                placeholder="https://hooks.zapier.com/hooks/catch/..."
              />
            </Field>
            <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>
              Every inbound WhatsApp message will be POSTed to this URL as JSON —
              including phone, message text, conversation ID, and timestamp.
              Compatible with Zapier, Make, n8n, or any custom HTTP endpoint.
            </p>
          </SectionCard>

        </motion.div>
      )}

      {/* Tab: AI Bot */}

      {activeTab === 'bot' && (
        <motion.div key="bot" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <SectionCard title="AI Identity" icon={Bot}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Bot Name">
                <Input value={settings.bot_name} onChange={v => update('bot_name', v)} placeholder="Aria" />
              </Field>
              <Field label="AI Persona">
                <select 
                  value={settings.bot_personality || 'sales_pro'} 
                  onChange={e => update('bot_personality', e.target.value)}
                  className="w-full h-10 px-3 rounded-xl text-sm outline-none transition-all"
                  style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                >
                  <option value="sales_pro">Sales Pro (Persuasive, handles objections)</option>
                  <option value="educator">Educator (Teaching tone, breaks down complexity)</option>
                  <option value="support_hero">Support Hero (Empathetic, de-escalates)</option>
                  <option value="lead_magnet">Lead Magnet (Qualifies and collects info)</option>
                  <option value="advisor">Advisor (Consultative, builds trust)</option>
                  <option value="concierge">Concierge (Premium service, proactive)</option>
                </select>
              </Field>
            </div>
            <Field label="Welcome Message">
              <Textarea value={settings.welcome_message || ''} onChange={v => update('welcome_message', v)} placeholder="Hi! Welcome to {business_name}. How can I help you today?" rows={3} />
            </Field>
            <Field label="Welcome Offer / Promotion">
              <Textarea value={settings.welcome_offer || ''} onChange={v => update('welcome_offer', v)} placeholder="Get 10% off on your first order! Use code WELCOME10" rows={2} />
            </Field>
          </SectionCard>

          <SectionCard title="AI Lead Scoring" icon={BrainCircuit}>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Keywords that trigger lead scoring. The AI automatically classifies contacts based on these signals.
            </p>
            <Field label="Hot Keywords (High Intent)">
              <TagInput tags={settings.hot_keywords || []} onChange={v => update('hot_keywords', v)} placeholder="buy now, place order, book appointment…" />
            </Field>
            <Field label="Warm Keywords (Medium Intent)">
              <TagInput tags={settings.warm_keywords || []} onChange={v => update('warm_keywords', v)} placeholder="interested, pricing, how much…" />
            </Field>
          </SectionCard>

          <SectionCard title="Unique Selling Points" icon={Zap}>
            <p className="text-xs mb-3" style={{ color: 'var(--muted-foreground)' }}>
              These are used by the AI to describe your business's strengths.
            </p>
            <TagInput
              tags={settings.usps || []}
              onChange={v => update('usps', v)}
              placeholder="Fast delivery, 24/7 support, Free returns…"
            />
          </SectionCard>
        </motion.div>
      )}

      {/* Tab: Staff */}
      {activeTab === 'staff' && (
        <motion.div key="staff" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <SectionCard title="Staff Contact" icon={Users}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Staff Name">
                <Input value={settings.staff_name || ''} onChange={v => update('staff_name', v)} placeholder="Rahul" />
              </Field>
              <Field label="Staff WhatsApp Phone">
                <Input value={settings.staff_phone || ''} onChange={v => update('staff_phone', v)} placeholder="+91 98765 43210" />
              </Field>
              <Field label="Manager Phone (Escalations)">
                <Input value={settings.manager_phone || ''} onChange={v => update('manager_phone', v)} placeholder="+91 98765 43211" />
              </Field>
              <Field label="Escalation Timeout (mins)">
                <Input
                  type="number"
                  value={String(settings.escalation_timeout_mins)}
                  onChange={v => update('escalation_timeout_mins', parseInt(v) || 5)}
                  placeholder="5"
                />
              </Field>
            </div>
            <div
              className="rounded-xl p-4 text-sm"
              style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--muted-foreground)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="w-3.5 h-3.5 text-cyan-500" />
                <span className="font-semibold text-xs" style={{ color: 'var(--foreground)' }}>How escalation works</span>
              </div>
              When a customer asks for a human or uses escalation keywords, the AI will pause and alert your staff on WhatsApp within the timeout window.
            </div>
          </SectionCard>
        </motion.div>
      )}

      {/* Tab: Follow-ups */}
      {activeTab === 'followup' && (
        <motion.div key="followup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <SectionCard title="Automated Follow-up Sequences" icon={Bell}>
            <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>
              The AI will automatically follow up with leads who haven't responded. Enable the sequences you want.
            </p>
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              <Toggle
                checked={settings.followup_30min}
                onChange={v => update('followup_30min', v)}
                label="30-minute follow-up"
                description="Gentle nudge if no reply within 30 minutes"
              />
              <Toggle
                checked={settings.followup_3hr}
                onChange={v => update('followup_3hr', v)}
                label="3-hour follow-up"
                description="Re-engagement message after 3 hours"
              />
              <Toggle
                checked={settings.followup_24hr}
                onChange={v => update('followup_24hr', v)}
                label="24-hour follow-up"
                description="Next-day check-in message"
              />
              <Toggle
                checked={settings.followup_7day}
                onChange={v => update('followup_7day', v)}
                label="7-day re-engagement"
                description="Long-term nurture for cold leads"
              />
            </div>
          </SectionCard>
        </motion.div>
      )}

      {/* Tab: Off-Hours */}
      {activeTab === 'offhours' && (
        <motion.div key="offhours" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <SectionCard title="Off-Hours Handling" icon={Clock}>
            <Toggle
              checked={settings.off_hours_capture_lead}
              onChange={v => update('off_hours_capture_lead', v)}
              label="Capture lead when offline"
              description="Still collect name and phone even outside working hours"
            />
            <Field label="Off-Hours Message">
              <Textarea
                value={settings.off_hours_message || ''}
                onChange={v => update('off_hours_message', v)}
                placeholder="Thanks for reaching out! We're currently closed. Our team will get back to you during business hours (9 AM – 6 PM)."
                rows={4}
              />
            </Field>
            <div
              className="rounded-xl p-4 text-xs"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--muted-foreground)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-semibold" style={{ color: 'var(--foreground)' }}>Working hours are set in your profile</span>
              </div>
              Configure working hours in the Business tab. Off-hours messages are sent automatically outside those times.
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
