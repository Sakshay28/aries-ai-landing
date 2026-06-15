"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, Building2, Search, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

type TenantRow = {
  id: string;
  business_name: string | null;
  plan: string | null;
  created_at: string;
  is_approved: boolean;
  owner_email: string;
  wa_configured: boolean;
};

type TenantForm = Record<string, string | boolean | null>;

const MASK = '••••••••';

// Field groups rendered in the form. `secret` masks the value + shows a hint.
const SECTIONS: { title: string; fields: { key: string; label: string; secret?: boolean; textarea?: boolean; toggle?: boolean; placeholder?: string }[] }[] = [
  {
    title: 'WhatsApp credentials',
    fields: [
      { key: 'wa_phone_number_id', label: 'Phone Number ID', placeholder: 'e.g. 123456789012345' },
      { key: 'wa_business_account_id', label: 'WhatsApp Business Account ID (WABA)' },
      { key: 'wa_access_token', label: 'Access Token', secret: true, placeholder: 'EAA…' },
      { key: 'wa_app_secret', label: 'App Secret (leave blank if under your own app)', secret: true },
      { key: 'wa_verify_token', label: 'Webhook Verify Token' },
    ],
  },
  {
    title: 'Business details',
    fields: [
      { key: 'business_name', label: 'Business name' },
      { key: 'business_type', label: 'Business type' },
      { key: 'business_phone', label: 'Business phone' },
      { key: 'business_email', label: 'Business email' },
      { key: 'business_address', label: 'Address' },
      { key: 'business_website', label: 'Website' },
    ],
  },
  {
    title: 'Bot',
    fields: [
      { key: 'bot_name', label: 'Bot name' },
      { key: 'bot_personality', label: 'Bot personality' },
      { key: 'welcome_message', label: 'Welcome message', textarea: true },
      { key: 'welcome_offer', label: 'Welcome offer' },
    ],
  },
  {
    title: 'Team & escalation',
    fields: [
      { key: 'staff_name', label: 'Staff name' },
      { key: 'staff_phone', label: 'Staff phone' },
      { key: 'manager_phone', label: 'Manager phone' },
    ],
  },
];

const SECRET_KEYS = ['wa_access_token', 'wa_app_secret'];
const ALL_KEYS = SECTIONS.flatMap(s => s.fields.map(f => f.key));

export function OnboardClient() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<TenantForm>({});
  const [ownerEmail, setOwnerEmail] = useState('');
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/provision');
        const data = await res.json();
        if (data.success) setTenants(data.tenants);
        else toast.error(data.error || 'Failed to load tenants');
      } catch {
        toast.error('Failed to load tenants');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      t =>
        (t.business_name || '').toLowerCase().includes(q) ||
        (t.owner_email || '').toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
    );
  }, [tenants, query]);

  const selectTenant = async (id: string) => {
    setSelectedId(id);
    setLoadingTenant(true);
    setForm({});
    try {
      const res = await fetch(`/api/admin/provision?tenant_id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.success) {
        const next: TenantForm = {};
        for (const k of ALL_KEYS) next[k] = data.tenant[k] ?? '';
        setForm(next);
        setOwnerEmail(data.tenant.owner_email || '');
      } else {
        toast.error(data.error || 'Failed to load tenant');
      }
    } catch {
      toast.error('Failed to load tenant');
    } finally {
      setLoadingTenant(false);
    }
  };

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      // Don't send secrets that are still masked (unchanged).
      const payload: Record<string, unknown> = { tenant_id: selectedId };
      for (const k of ALL_KEYS) {
        if (SECRET_KEYS.includes(k) && form[k] === MASK) continue;
        payload[k] = form[k];
      }
      const res = await fetch('/api/admin/provision', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Client provisioned — live on the next message');
        setTenants(prev =>
          prev.map(t =>
            t.id === selectedId ? { ...t, wa_configured: Boolean(form.wa_phone_number_id), business_name: (form.business_name as string) || t.business_name } : t
          )
        );
      } else {
        toast.error(data.error || 'Save failed');
      }
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      <header className="px-6 lg:px-8 pt-6 pb-4 border-b border-border shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <UserPlus className="w-6 h-6 text-indigo-600" /> Onboard Client
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Fill in any client&apos;s WhatsApp credentials &amp; details on their behalf — no client login needed. Tokens are encrypted on save.
        </p>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Tenant picker ── */}
        <aside className="w-[320px] shrink-0 border-r border-border flex flex-col min-h-0">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name, email, or ID"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar divide-y divide-border/60">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No tenants found.</div>
            ) : (
              filtered.map(t => (
                <button
                  key={t.id}
                  onClick={() => selectTenant(t.id)}
                  className={`w-full text-left p-4 flex items-start gap-3 transition-colors ${
                    selectedId === t.id ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'hover:bg-secondary/40'
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{t.business_name || 'Unnamed'}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.owner_email || 'no email'}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {t.wa_configured ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" /> WhatsApp set
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
                          <AlertCircle className="w-3 h-3" /> Not configured
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ── Edit form ── */}
        <main className="flex-1 overflow-auto custom-scrollbar p-6 lg:p-8">
          {!selectedId ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Pick a client on the left to fill in their details.
            </div>
          ) : loadingTenant ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading client…</div>
          ) : (
            <div className="max-w-[680px] mx-auto w-full space-y-8">
              {ownerEmail && (
                <div className="text-xs text-muted-foreground">
                  Editing tenant owned by <span className="font-medium text-foreground">{ownerEmail}</span>
                </div>
              )}
              {SECTIONS.map(section => (
                <section key={section.title} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-secondary/30">
                    <h2 className="text-sm font-semibold">{section.title}</h2>
                  </div>
                  <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {section.fields.map(f => (
                      <div key={f.key} className={f.textarea ? 'sm:col-span-2' : ''}>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{f.label}</label>
                        {f.textarea ? (
                          <textarea
                            rows={3}
                            value={(form[f.key] as string) ?? ''}
                            onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                          />
                        ) : (
                          <input
                            value={(form[f.key] as string) ?? ''}
                            onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            onFocus={e => { if (f.secret && e.target.value === MASK) setForm(p => ({ ...p, [f.key]: '' })); }}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono"
                          />
                        )}
                        {f.secret && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Stored encrypted. Leave as <span className="font-mono">{MASK}</span> to keep the existing value.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              <div className="flex justify-end pb-4">
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save & provision'}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
