"use client";

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Check, Building2, X } from 'lucide-react';
import toast from 'react-hot-toast';

type PendingTenant = {
  id: string;
  business_name: string;
  plan: string;
  created_at: string;
  owner_email: string;
};

export function ApprovalsClient() {
  const [tenants, setTenants] = useState<PendingTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  const fetchPending = async () => {
    try {
      const res = await fetch('/api/admin/approvals');
      const data = await res.json();
      if (data.success) setTenants(data.tenants);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPending(); }, []);

  const approve = async (t: PendingTenant) => {
    setApproving(t.id);
    try {
      const res = await fetch('/api/admin/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: t.id }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${t.business_name} approved`);
        setTenants(prev => prev.filter(x => x.id !== t.id));
      } else {
        toast.error(data.error || 'Failed to approve');
      }
    } catch {
      toast.error('Failed to approve');
    } finally {
      setApproving(null);
    }
  };

  const reject = async (t: PendingTenant) => {
    if (!confirm(`Reject and permanently remove "${t.business_name}"? This cannot be undone.`)) return;
    setApproving(t.id);
    try {
      const res = await fetch('/api/admin/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: t.id, action: 'reject' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${t.business_name} rejected`);
        setTenants(prev => prev.filter(x => x.id !== t.id));
      } else {
        toast.error(data.error || 'Failed to reject');
      }
    } catch {
      toast.error('Failed to reject');
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[900px] mx-auto w-full space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" /> Pending Approvals
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            New workspaces that signed up and are waiting for activation. Approve to give them access.
          </p>
        </header>

        <div className="bg-card border border-border shadow-sm rounded-2xl">
          <div className="px-6 py-4 border-b border-border bg-secondary/30 rounded-t-2xl">
            <h2 className="text-sm font-semibold">Waiting for approval ({tenants.length})</h2>
          </div>
          <div className="divide-y divide-border/60">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
            ) : tenants.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">🎉 No pending signups. You&apos;re all caught up.</div>
            ) : (
              tenants.map(t => (
                <div key={t.id} className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{t.business_name || 'Unnamed workspace'}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {t.owner_email || 'no email'} · {t.plan} · {new Date(t.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => reject(t)}
                      disabled={approving === t.id}
                      className="flex items-center gap-1.5 border border-border text-muted-foreground hover:text-red-600 hover:border-red-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4" /> Reject
                    </button>
                    <button
                      onClick={() => approve(t)}
                      disabled={approving === t.id}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> {approving === t.id ? 'Approving...' : 'Approve'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
