"use client";

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { UserPlus, Building2, Search, Save, CheckCircle2, AlertCircle, LogIn, RefreshCw, Clock, XCircle, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';

type TenantRow = {
  id: string;
  business_name: string | null;
  plan: string | null;
  created_at: string;
  is_approved: boolean;
  owner_email: string;
  wa_configured: boolean;
  parent_tenant_id: string | null;
};

type TenantForm = Record<string, string | boolean | null>;

type TemplateStatus = {
  status: string;
  meta_template_id: string | null;
  updated_at: string;
};

type TemplateMap = Record<string, TemplateStatus>;

const MASK = '••••••••';

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

const TEMPLATE_LABELS: Record<string, string> = {
  staff_keepalive: 'Staff keepalive',
  human_assistance: 'Human handoff alert',
};

function TemplateStatusBadge({ status }: { status: string }) {
  if (status === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> Approved
      </span>
    );
  }
  if (status === 'PENDING' || status === 'IN_APPEAL') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-full">
        <Clock className="w-3 h-3" /> {status === 'IN_APPEAL' ? 'In appeal' : 'Pending Meta'}
      </span>
    );
  }
  if (status === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-400 px-2 py-0.5 rounded-full">
        <ShieldAlert className="w-3 h-3" /> WABA restricted
      </span>
    );
  }
  if (status === 'REJECTED') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-400 px-2 py-0.5 rounded-full">
        <XCircle className="w-3 h-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
      <AlertCircle className="w-3 h-3" /> Not registered
    </span>
  );
}

export function OnboardClient() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<TenantForm>({});
  const [ownerEmail, setOwnerEmail] = useState('');
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [parentTenantId, setParentTenantId] = useState<string>('');
  const [templates, setTemplates] = useState<TemplateMap>({});
  const [provisioningTemplates, setProvisioningTemplates] = useState(false);

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

  const effectiveTenants = useMemo(() => {
    if (!selectedId) return tenants;
    return tenants.map(t =>
      t.id === selectedId ? { ...t, parent_tenant_id: parentTenantId || null } : t
    );
  }, [tenants, selectedId, parentTenantId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return effectiveTenants;
    return effectiveTenants.filter(
      t =>
        (t.business_name || '').toLowerCase().includes(q) ||
        (t.owner_email || '').toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
    );
  }, [effectiveTenants, query]);

  const orderedTenants = useMemo(() => {
    const parents = filtered.filter(t => !t.parent_tenant_id);
    const childrenByParent: Record<string, TenantRow[]> = {};
    for (const t of filtered) {
      if (t.parent_tenant_id) {
        if (!childrenByParent[t.parent_tenant_id]) childrenByParent[t.parent_tenant_id] = [];
        childrenByParent[t.parent_tenant_id].push(t);
      }
    }
    const result: { tenant: TenantRow; isChild: boolean }[] = [];
    for (const p of parents) {
      result.push({ tenant: p, isChild: false });
      for (const c of childrenByParent[p.id] || []) {
        result.push({ tenant: c, isChild: true });
      }
    }
    for (const t of filtered) {
      if (t.parent_tenant_id && !filtered.find(p => p.id === t.parent_tenant_id)) {
        result.push({ tenant: t, isChild: true });
      }
    }
    return result;
  }, [filtered]);

  const fetchTemplateStatuses = useCallback(async (tenantId: string) => {
    try {
      const res = await fetch(`/api/admin/provision-templates?tenant_id=${encodeURIComponent(tenantId)}`);
      const data = await res.json();
      if (data.success) setTemplates(data.templates ?? {});
    } catch {
      // non-fatal
    }
  }, []);

  const selectTenant = async (id: string) => {
    setSelectedId(id);
    setLoadingTenant(true);
    setForm({});
    setTemplates({});
    try {
      const res = await fetch(`/api/admin/provision?tenant_id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.success) {
        const next: TenantForm = {};
        for (const k of ALL_KEYS) next[k] = data.tenant[k] ?? '';
        setForm(next);
        setOwnerEmail(data.tenant.owner_email || '');
        setParentTenantId(data.tenant.parent_tenant_id || '');
      } else {
        toast.error(data.error || 'Failed to load tenant');
      }
    } catch {
      toast.error('Failed to load tenant');
    } finally {
      setLoadingTenant(false);
    }
    // Fetch template statuses in parallel
    fetchTemplateStatuses(id);
  };

  const provisionTemplates = async (forceRetry = false) => {
    if (!selectedId) return;
    setProvisioningTemplates(true);
    try {
      const res = await fetch('/api/admin/provision-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: selectedId, force_retry: forceRetry }),
      });
      const data = await res.json();
      if (data.success) {
        setTemplates(data.templates ?? {});
        const allApproved = Object.values(data.templates ?? {}).every((t: unknown) => (t as TemplateStatus).status === 'APPROVED');
        const anyFailed = Object.values(data.templates ?? {}).some((t: unknown) => (t as TemplateStatus).status === 'FAILED');
        if (allApproved) toast.success('All templates approved — keepalive is fully active');
        else if (anyFailed) toast.error('WABA restricted — client must verify Meta Business Account');
        else toast.success('Templates submitted to Meta — approval usually takes a few minutes');
      } else {
        toast.error(data.error || 'Template provisioning failed');
      }
    } catch {
      toast.error('Template provisioning failed');
    } finally {
      setProvisioningTemplates(false);
    }
  };

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { tenant_id: selectedId };
      for (const k of ALL_KEYS) {
        if (SECRET_KEYS.includes(k) && form[k] === MASK) continue;
        payload[k] = form[k];
      }
      payload.parent_tenant_id = parentTenantId || null;
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
            t.id === selectedId
              ? { ...t, wa_configured: Boolean(form.wa_phone_number_id), business_name: (form.business_name as string) || t.business_name, parent_tenant_id: parentTenantId || null }
              : t
          )
        );
        // Auto-provision templates immediately after saving credentials
        await provisionTemplates();
      } else {
        toast.error(data.error || 'Save failed');
      }
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const loginAsClient = async () => {
    if (!ownerEmail) return;
    const confirmed = window.confirm(
      `Log in as ${ownerEmail}?\n\nThis will replace your current session. Log out and sign back in as yourself when done.`
    );
    if (!confirmed) return;
    setImpersonating(true);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ownerEmail }),
      });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'Failed to generate login link');
        setImpersonating(false);
      }
    } catch {
      toast.error('Failed to impersonate client');
      setImpersonating(false);
    }
  };

  const allTemplatesApproved = Object.keys(TEMPLATE_LABELS).length > 0 &&
    Object.keys(TEMPLATE_LABELS).every(k => templates[k]?.status === 'APPROVED');
  const anyTemplateRestricted = Object.values(templates).some(t => t.status === 'FAILED');

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
            ) : orderedTenants.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No tenants found.</div>
            ) : (
              orderedTenants.map(({ tenant: t, isChild }) => (
                <button
                  key={t.id}
                  onClick={() => selectTenant(t.id)}
                  className={`w-full text-left flex items-start gap-3 transition-colors ${
                    isChild ? 'pl-8 pr-4 py-3' : 'p-4'
                  } ${selectedId === t.id ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'hover:bg-secondary/40'}`}
                >
                  {isChild && (
                    <div className="w-px self-stretch bg-border mr-0 shrink-0" style={{ marginLeft: '-20px', marginRight: '8px' }} />
                  )}
                  <div className={`rounded-lg bg-secondary flex items-center justify-center shrink-0 ${isChild ? 'w-7 h-7' : 'w-9 h-9'}`}>
                    <Building2 className={`text-muted-foreground ${isChild ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
                  </div>
                  <div className="min-w-0">
                    <div className={`font-medium truncate ${isChild ? 'text-xs' : 'text-sm'}`}>{t.business_name || 'Unnamed'}</div>
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
                <div className="flex items-center justify-between gap-4">
                  <div className="text-xs text-muted-foreground">
                    Editing tenant owned by <span className="font-medium text-foreground">{ownerEmail}</span>
                  </div>
                  <button
                    onClick={loginAsClient}
                    disabled={impersonating}
                    className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    {impersonating ? 'Redirecting…' : 'Login as client'}
                  </button>
                </div>
              )}

              {/* ── WhatsApp Alert Templates ── */}
              <section className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold">WhatsApp Alert Templates</h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Required for staff to receive booking, handoff, and payment alerts when their 24h window is closed.
                    </p>
                  </div>
                  <button
                    onClick={() => provisionTemplates(anyTemplateRestricted)}
                    disabled={provisioningTemplates || allTemplatesApproved}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${provisioningTemplates ? 'animate-spin' : ''}`} />
                    {provisioningTemplates ? 'Provisioning…' : anyTemplateRestricted ? 'Retry (after Meta verification)' : allTemplatesApproved ? 'All active' : 'Provision templates'}
                  </button>
                </div>
                <div className="p-5 space-y-3">
                  {Object.entries(TEMPLATE_LABELS).map(([eventType, label]) => {
                    const t = templates[eventType];
                    return (
                      <div key={eventType} className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium">{label}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{eventType}</div>
                        </div>
                        <TemplateStatusBadge status={t?.status ?? 'NOT_REGISTERED'} />
                      </div>
                    );
                  })}

                  {anyTemplateRestricted && (
                    <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
                      <strong>WABA restricted from creating templates.</strong> The client&apos;s Meta Business Account needs to be verified.
                      Guide them to <span className="font-mono">business.facebook.com → Settings → Business Info → Start Verification</span>.
                      Once verified, click &ldquo;Retry&rdquo; above — templates register instantly on a verified WABA.
                    </div>
                  )}

                  {!anyTemplateRestricted && !allTemplatesApproved && Object.keys(templates).length > 0 && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                      Templates submitted to Meta. Approval for UTILITY templates typically takes a few minutes.
                      Refresh to check status.
                    </div>
                  )}

                  {allTemplatesApproved && (
                    <div className="mt-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400">
                      All templates approved. Staff will automatically receive WhatsApp alerts — no manual action needed from their side.
                    </div>
                  )}
                </div>
              </section>

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

              <section className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-secondary/30">
                  <h2 className="text-sm font-semibold">Grouping</h2>
                </div>
                <div className="p-5">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Grouped under (parent tenant)</label>
                  <select
                    value={parentTenantId}
                    onChange={e => setParentTenantId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  >
                    <option value="">— standalone —</option>
                    {tenants
                      .filter(t => t.id !== selectedId && !t.parent_tenant_id)
                      .map(t => (
                        <option key={t.id} value={t.id}>
                          {t.business_name || 'Unnamed'} {t.owner_email ? `(${t.owner_email})` : ''}
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Sets this tenant as a sub-entry shown below the selected parent in the sidebar.
                  </p>
                </div>
              </section>

              <div className="flex justify-end pb-4">
                <button
                  onClick={save}
                  disabled={saving || provisioningTemplates}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving…' : provisioningTemplates ? 'Provisioning templates…' : 'Save & provision'}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
