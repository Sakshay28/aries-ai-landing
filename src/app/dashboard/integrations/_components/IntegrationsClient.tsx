"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ArrowRight, CreditCard, Truck, FileSpreadsheet, Briefcase, Webhook, X, Loader2, AlertCircle, ExternalLink, Unplug, CalendarCheck, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';

// ── Integration definitions ──────────────────────────────────
const MetaIcon = (props: any) => (
  <svg viewBox="0 0 24 24" width="20" height="24" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select';
  placeholder: string;
  required: boolean;
  hint?: string;
  options?: { value: string; label: string }[];
}

interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  docsUrl?: string;
  fields: FieldDef[];
  eventBadges: string[];
  isOAuth?: boolean;
  oauthRoute?: string;
  oauthSpreadsheetParam?: boolean;
  syncUrl?: string;
  isRedirect?: boolean;
  redirectUrl?: string;
  redirectLabel?: string;
  redirectBullets?: string[];
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    description: 'Leads auto-sync to your Google Sheet in real-time via OAuth, no Zapier needed.',
    icon: FileSpreadsheet,
    color: 'text-[#0F9D58]',
    bgColor: 'bg-[#0F9D58]/10',
    docsUrl: 'https://developers.google.com/sheets/api',
    eventBadges: ['New lead', 'Real-time sync'],
    isOAuth: true,
    oauthRoute: '/api/integrations/google-sheets/auth',
    oauthSpreadsheetParam: true,
    syncUrl: '/api/dashboard/google-sheets/sync',
    fields: [
      { key: 'spreadsheet_id', label: 'Google Sheet URL or ID', type: 'url', placeholder: 'https://docs.google.com/spreadsheets/d/...', required: true, hint: 'Open your Google Sheet, paste the full URL or just the ID from the URL.' },
    ],
  },
  {
    id: 'googlecalendar',
    name: 'Google Calendar',
    description: 'AI checks availability and books appointments directly into your Google Calendar during WhatsApp conversations.',
    icon: CalendarCheck,
    color: 'text-[#4285F4]',
    bgColor: 'bg-[#4285F4]/10',
    docsUrl: 'https://developers.google.com/calendar/api/guides/overview',
    eventBadges: ['Booking confirmed', 'Auto-sync'],
    fields: [
      { key: 'calendar_id', label: 'Calendar ID', type: 'text', placeholder: 'you@gmail.com', required: true, hint: 'Google Calendar → Settings → Calendar ID (usually your Gmail address)' },
      { key: 'webhook_url', label: 'Zapier/Make Webhook', type: 'url', placeholder: 'https://hooks.zapier.com/hooks/catch/...', required: true, hint: 'Create a Zapier scenario: Webhook → Google Calendar "Create Detailed Event". Paste the trigger URL here.' },
      { key: 'timezone', label: 'Timezone', type: 'select', placeholder: '', required: true, options: [{ value: 'Asia/Kolkata', label: 'India (IST)' }, { value: 'Asia/Dubai', label: 'UAE (GST)' }, { value: 'UTC', label: 'UTC' }] },
    ],
  },
  {
    id: 'pabbly',
    name: 'Pabbly Connect',
    description: 'Send lead and event data to any Pabbly workflow via webhook, connecting 1000+ apps instantly.',
    icon: Zap,
    color: 'text-[#FF6B35]',
    bgColor: 'bg-[#FF6B35]/10',
    docsUrl: 'https://connect.pabbly.com/',
    eventBadges: ['New lead', 'Booking confirmed', 'Payment requested'],
    fields: [
      { key: 'webhook_url', label: 'Pabbly Webhook URL', type: 'url', placeholder: 'https://connect.pabbly.com/workflow/sendwebhookdata/...', required: true, hint: 'In Pabbly Connect, create a workflow → Add Trigger → Webhook by Pabbly. Copy the webhook URL here.' },
      { key: 'events', label: 'Fire on events', type: 'select', placeholder: '', required: false, options: [{ value: 'new_lead,booking_confirmed,payment_requested', label: 'All events' }, { value: 'new_lead', label: 'New lead only' }, { value: 'booking_confirmed', label: 'Bookings only' }] },
    ],
  },
  {
    id: 'meta_ads',
    name: 'Meta Ads',
    description: 'Connect your Facebook account to create Click-to-WhatsApp campaigns, track leads from ads, and automatically engage every lead with Aries AI.',
    icon: MetaIcon,
    color: 'text-[#1877F2]',
    bgColor: 'bg-[#1877F2]/10',
    eventBadges: ['Click-to-WhatsApp', 'Lead Attribution', 'ROI Analytics'],
    fields: [],
    isRedirect: true,
    redirectUrl: '/dashboard/meta-ads/settings',
    redirectLabel: 'Connect with Facebook',
    redirectBullets: [
      'Create Click-to-WhatsApp campaigns from Facebook & Instagram ads',
      'Track every ad click through to booking with full attribution',
      'AI auto-engages every lead the moment they message on WhatsApp',
      'Measure cost per lead, cost per booking, and ROAS',
    ],
  },
  {
    id: 'razorpay',
    name: 'Razorpay',
    description: 'Auto-generate payment links and send them to customers via WhatsApp.',
    icon: CreditCard,
    color: 'text-[#3395FF]',
    bgColor: 'bg-[#3395FF]/10',
    docsUrl: 'https://razorpay.com/docs/payments/payment-links/api/',
    eventBadges: ['Payment requests'],
    fields: [
      { key: 'key_id', label: 'Key ID', type: 'text', placeholder: 'rzp_live_...', required: true, hint: 'Dashboard → Settings → API Keys' },
      { key: 'key_secret', label: 'Key Secret', type: 'password', placeholder: '••••••••••••••••', required: true, hint: 'Copy immediately: shown only once' },
    ],
  },
  {
    id: 'shiprocket',
    name: 'Shiprocket',
    description: 'Send automated shipping updates and order tracking links to customers.',
    icon: Truck,
    color: 'text-[#2D9CDB]',
    bgColor: 'bg-[#2D9CDB]/10',
    docsUrl: 'https://apidocs.shiprocket.in/',
    eventBadges: ['Booking confirmed', 'Order updates'],
    fields: [
      { key: 'email', label: 'Email', type: 'text', placeholder: 'you@company.com', required: true },
      { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••', required: true, hint: 'Your Shiprocket login password' },
    ],
  },
];

// ── Types ────────────────────────────────────────────────────
interface ConnectedIntegration {
  integration_id: string;
  is_active: boolean;
  connected_at: string;
  config: Record<string, string>;
}

// ── Modal ────────────────────────────────────────────────────
function IntegrationModal({
  integration,
  existing,
  onClose,
  onSaved,
}: {
  integration: IntegrationDef;
  existing: ConnectedIntegration | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const Icon = integration.icon;
  const [form, setForm] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    integration.fields.forEach(f => { defaults[f.key] = existing?.config[f.key] || ''; });
    return defaults;
  });
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleOAuthConnect = () => {
    const rawId = form['spreadsheet_id']?.trim();
    if (!rawId) { toast.error('Please enter your Google Sheet URL or ID'); return; }
    // Extract the ID from a full URL if needed
    const match = rawId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const spreadsheetId = match ? match[1] : rawId;
    window.location.href = `${integration.oauthRoute}?spreadsheet_id=${encodeURIComponent(spreadsheetId)}`;
  };

  const handleSyncNow = async () => {
    if (!integration.syncUrl) return;
    setSyncing(true);
    try {
      const res = await fetch(integration.syncUrl, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Synced ${data.synced} leads to Google Sheets`);
    } catch (e) {
      toast.error((e as Error).message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async () => {
    const missing = integration.fields.filter(f => f.required && !form[f.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_id: integration.id, config: form }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`${integration.name} connected successfully`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch(`/api/dashboard/integrations?id=${integration.id}`, { method: 'DELETE' });
      toast.success(`${integration.name} disconnected`);
      onSaved();
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        className="relative z-10 w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${integration.bgColor} ${integration.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">{integration.name}</h2>
              {existing && (
                <p className="text-xs text-emerald-500 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">{integration.description}</p>

          {integration.isRedirect && integration.redirectBullets && (
            <ul className="space-y-2">
              {integration.redirectBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#1877F2]" />
                  {b}
                </li>
              ))}
            </ul>
          )}

          {integration.fields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{field.label}</label>
              {field.type === 'select' ? (
                <select
                  value={form[field.key] || field.options?.[0]?.value || ''}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-indigo-500/50 transition-colors"
                >
                  {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={form[field.key] || ''}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={existing?.config[field.key] === '••••••••' ? '••••••••  (saved)' : field.placeholder}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              )}
              {field.hint && (
                <p className="text-[11px] text-muted-foreground/70 flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> {field.hint}
                </p>
              )}
            </div>
          ))}

          {integration.docsUrl && (
            <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-400 transition-colors">
              <ExternalLink className="w-3 h-3" /> Setup guide
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-6 gap-3">
          {existing ? (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
              Disconnect
            </button>
          ) : <div />}
          <div className="flex gap-2">
            {integration.isOAuth && existing && integration.syncUrl && (
              <button
                onClick={handleSyncNow}
                disabled={syncing}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground flex items-center gap-1.5"
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Sync All Leads
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground">
              Cancel
            </button>
            {integration.isRedirect ? (
              <a
                href={integration.redirectUrl}
                className="px-5 py-2 text-sm rounded-lg bg-[#1877F2] hover:bg-[#1877F2]/90 text-white font-medium transition-colors flex items-center gap-2"
              >
                <MetaIcon className="w-3.5 h-3.5" />
                {integration.redirectLabel || 'Open Settings'}
              </a>
            ) : integration.isOAuth ? (
              <button
                onClick={handleOAuthConnect}
                disabled={saving}
                className="px-5 py-2 text-sm rounded-lg bg-[#0F9D58] hover:bg-[#0F9D58]/90 text-white font-medium transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {existing ? 'Reconnect with Google' : 'Connect with Google'}
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {existing ? 'Update' : 'Connect'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────
export function IntegrationsClient() {
  const [connected, setConnected] = useState<ConnectedIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/integrations');
      const data = await res.json();
      setConnected(data.integrations || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (success === 'google_sheets') {
      toast.success('Google Sheets connected! Leads will sync automatically.');
      window.history.replaceState({}, '', '/dashboard/integrations');
      // Hard reload so the CONNECTED badge renders with fresh data
      setTimeout(() => window.location.reload(), 800);
    } else if (error === 'google_sheets_denied') {
      toast.error('Google authorization was denied.');
      window.history.replaceState({}, '', '/dashboard/integrations');
    } else if (error === 'google_sheets_failed') {
      const detail = searchParams.get('detail');
      toast.error(`Google Sheets failed: ${detail || 'unknown error'}`, { duration: 8000 });
      window.history.replaceState({}, '', '/dashboard/integrations');
    }
  }, [searchParams, load]);

  const getConnected = (id: string) => connected.find(c => c.integration_id === id) ?? null;

  const handleSaved = () => {
    setActiveModal(null);
    load();
  };

  const activeIntegration = INTEGRATIONS.find(i => i.id === activeModal);

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1000px] mx-auto w-full space-y-8">

        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Connect Aries AI to your existing tools to create seamless automated workflows.
          </p>
          {!loading && connected.length > 0 && (
            <p className="text-xs text-emerald-500 font-medium">
              {connected.length} integration{connected.length > 1 ? 's' : ''} active
            </p>
          )}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {INTEGRATIONS.map((integration, i) => {
            const Icon = integration.icon;
            const conn = getConnected(integration.id);
            return (
              <motion.div
                key={integration.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`p-6 rounded-2xl bg-card border transition-all ${conn ? 'border-emerald-500/30 shadow-[0_0_0_1px_rgba(16,185,129,0.1)]' : 'border-border hover:border-border/80'} shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col h-full`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl ${integration.bgColor} ${integration.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>

                  {conn ? (
                    <div className="flex items-center gap-2">
                      <div className="px-2 py-1 text-[10px] font-bold tracking-wider rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> CONNECTED
                      </div>
                      <button
                        onClick={() => setActiveModal(integration.id)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setActiveModal(integration.id)}
                      className="text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors flex items-center gap-1"
                    >
                      Connect <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="mt-auto">
                  <h3 className="text-lg font-semibold text-foreground mb-1">{integration.name}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    {integration.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {integration.eventBadges.map(badge => (
                      <span key={badge} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-medium">
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>

      <AnimatePresence>
        {activeModal && activeIntegration && (
          <IntegrationModal
            integration={activeIntegration}
            existing={getConnected(activeModal)}
            onClose={() => setActiveModal(null)}
            onSaved={handleSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
