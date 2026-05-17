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
  // Gupshup fields
  gupshup_api_key: string;
  gupshup_phone_number: string;
  gupshup_app_name: string;
}

const DEFAULT_SETTINGS: SettingsData = {
  business_name: '', business_type: '', business_phone: '',
  business_address: '', business_website: '', business_email: '',
  bot_name: '', bot_personality: '', welcome_message: '', welcome_offer: '',
  usps: [], staff_phone: '', staff_name: '', manager_phone: '',
  followup_30min: true, followup_3hr: true, followup_24hr: true, followup_7day: false,
  escalation_timeout_mins: 5, hot_keywords: [], warm_keywords: [],
  off_hours_message: '', off_hours_capture_lead: true,
  // Gupshup
  gupshup_api_key: '', gupshup_phone_number: '', gupshup_app_name: '',
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
  title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode;
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
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const testGupshupConnection = async () => {
    if (!settings.gupshup_api_key || !settings.gupshup_phone_number || !settings.gupshup_app_name) {
      toast.error('Enter your WhatsApp API Key, Phone Number and App Name first');
      return;
    }
    setTestingConnection(true);
    setConnectionStatus('idle');
    try {
      const res = await fetch('/api/dashboard/settings/test-gupshup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: settings.gupshup_api_key,
          phoneNumber: settings.gupshup_phone_number,
          appName: settings.gupshup_app_name,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConnectionStatus('success');
        toast.success('✅ Connected to Gupshup successfully!');
      } else {
        setConnectionStatus('error');
        toast.error(`❌ Connection failed: ${data.error || 'Check your credentials'}`);
      }
    } catch {
      setConnectionStatus('error');
      toast.error('Connection test failed — network error');
    } finally {
      setTestingConnection(false);
    }
  };

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
          </SectionCard>
        </motion.div>
      )}

      {/* Tab: WhatsApp */}
      {activeTab === 'whatsapp' && (
        <motion.div key="whatsapp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <SectionCard title="WhatsApp Business Credentials" icon={MessageSquare}>
            {/* Connection status badge */}
            <div className="flex items-center gap-3 mb-2">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: connectionStatus === 'success' ? 'rgba(16,185,129,0.1)' : connectionStatus === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--secondary)',
                  color: connectionStatus === 'success' ? '#10B981' : connectionStatus === 'error' ? '#EF4444' : 'var(--muted-foreground)',
                  border: `1px solid ${connectionStatus === 'success' ? 'rgba(16,185,129,0.2)' : connectionStatus === 'error' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: connectionStatus === 'success' ? '#10B981' : connectionStatus === 'error' ? '#EF4444' : 'var(--muted-foreground)' }}
                />
                {connectionStatus === 'success' ? 'Connected' : connectionStatus === 'error' ? 'Connection Failed' : 'Not Tested'}
              </div>
              <a
                href="https://business.facebook.com/wa/manage/home/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium underline"
                style={{ color: 'var(--muted-foreground)' }}
              >
                Open Meta Business Manager →
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="WhatsApp API Key">
                <div className="relative">
                  <input
                    type="password"
                    value={settings.gupshup_api_key}
                    onChange={e => update('gupshup_api_key', e.target.value)}
                    placeholder="sk-••••••••••••••••••••"
                    className="w-full h-10 px-3 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                  />
                </div>
              </Field>
              <Field label="WhatsApp Phone Number (no + prefix)">
                <Input
                  value={settings.gupshup_phone_number}
                  onChange={v => update('gupshup_phone_number', v)}
                  placeholder="919876543210"
                />
              </Field>
              <Field label="WhatsApp App ID">
                <Input
                  value={settings.gupshup_app_name}
                  onChange={v => update('gupshup_app_name', v)}
                  placeholder="my-business-app"
                />
              </Field>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={testGupshupConnection}
                disabled={testingConnection}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)', cursor: testingConnection ? 'wait' : 'pointer' }}
              >
                {testingConnection ? (
                  <div className="w-4 h-4 border-2 border-border border-t-cyan-500 rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
                )}
                {testingConnection ? 'Testing…' : 'Test Connection'}
              </motion.button>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Sends a test message to your own phone to verify the connection.
              </p>
            </div>
          </SectionCard>

          {/* Setup Guide for new users */}
          {!settings.gupshup_api_key && (
            <SectionCard title="How to Connect WhatsApp API" icon={MessageSquare}>
              <ol className="space-y-4 text-sm">
                {[
                  { step: '1', text: 'Go to ', link: 'https://business.facebook.com/wa/manage/home/', linkText: 'Meta Business Manager' },
                  { step: '2', text: 'Create an app, add your phone number, and complete the Meta verification process' },
                  { step: '3', text: 'Copy your API Key, Phone Number (without +), and App ID' },
                  { step: '4', text: 'Paste them above, click "Test Connection", then save' },
                  { step: '5', text: `Set your webhook URL in Meta: ${typeof window !== 'undefined' ? window.location.origin : 'https://yoursite.com'}/api/webhooks/whatsapp` },
                ].map(item => (
                  <li key={item.step} className="flex items-start gap-3">
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'rgba(6,182,212,0.1)', color: '#06B6D4' }}
                    >
                      {item.step}
                    </span>
                    <span style={{ color: 'var(--muted-foreground)' }}>
                      {item.text}
                      {item.link && (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="underline ml-1" style={{ color: '#06B6D4' }}>
                          {item.linkText}
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <div
                className="mt-4 p-3 rounded-xl text-xs font-mono break-all"
                style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              >
                Webhook URL: <span style={{ color: 'var(--foreground)' }}>
                  {typeof window !== 'undefined' ? window.location.origin : 'https://yoursite.com'}/api/webhooks/whatsapp
                </span>
              </div>
            </SectionCard>
          )}
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
              <Field label="Personality">
                <Input value={settings.bot_personality} onChange={v => update('bot_personality', v)} placeholder="Friendly, professional, helpful" />
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
