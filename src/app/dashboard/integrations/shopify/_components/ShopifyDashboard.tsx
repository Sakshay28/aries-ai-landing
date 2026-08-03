"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ShoppingBag, CheckCircle2, AlertCircle, RefreshCw, Loader2, Trash2,
  Package, Layers, Users, Receipt, FileText, Percent, BookOpen, Shield,
} from "lucide-react";

interface StatusSummary {
  connected: boolean;
  store_url: string | null;
  api_version: string | null;
  connected_at: string | null;
  last_full_sync_at: string | null;
  sync_status: "idle" | "syncing" | "error" | null;
  sync_error: string | null;
  counts: {
    products: number; variants: number; collections: number; customers: number;
    orders: number; pages: number; articles: number; policies: number; discounts: number;
  };
  pending_jobs: number;
  failed_jobs: number;
}

const RESOURCE_ROWS: Array<{ key: keyof StatusSummary["counts"]; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "products",    label: "Products",    icon: Package },
  { key: "variants",    label: "Variants",    icon: Package },
  { key: "collections", label: "Collections", icon: Layers },
  { key: "customers",   label: "Customers",   icon: Users },
  { key: "orders",      label: "Orders (90d)", icon: Receipt },
  { key: "pages",       label: "Pages",       icon: FileText },
  { key: "articles",    label: "Blog Articles", icon: BookOpen },
  { key: "policies",    label: "Policies",    icon: Shield },
  { key: "discounts",   label: "Discount Codes", icon: Percent },
];

export function ShopifyDashboard() {
  const [status, setStatus] = useState<StatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "connect" | "sync" | "disconnect" | "webhooks">(null);
  const [form, setForm] = useState({ store_url: "", access_token: "", shared_secret: "", api_version: "" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/shopify", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load status");
      setStatus(data);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll while syncing so counts + status refresh live.
  useEffect(() => {
    if (status?.sync_status !== "syncing" && (status?.pending_jobs || 0) === 0) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [status?.sync_status, status?.pending_jobs, load]);

  const connect = async () => {
    if (!form.store_url.trim() || !form.access_token.trim() || !form.shared_secret.trim()) {
      toast.error("Store URL, Access Token and Shared Secret are all required");
      return;
    }
    setBusy("connect");
    try {
      const res = await fetch("/api/integrations/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", ...form }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || "Connect failed");
      toast.success("Connected — initial sync started");
      setForm({ store_url: "", access_token: "", shared_secret: "", api_version: "" });
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runSync = async () => {
    setBusy("sync");
    try {
      const res = await fetch("/api/integrations/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Sync failed");
      toast.success("Full sync queued");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const registerWebhooks = async () => {
    setBusy("webhooks");
    try {
      const res = await fetch("/api/integrations/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register_webhooks" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Webhook registration failed");
      toast.success(`Webhooks — created ${data.result.created}, existing ${data.result.existing}, failed ${data.result.failed}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Shopify? Synced data will be preserved but no further updates will flow in.")) return;
    setBusy("disconnect");
    try {
      const res = await fetch("/api/integrations/shopify", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Disconnect failed");
      toast.success("Disconnected");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
          <ShoppingBag className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Shopify Integration</h1>
          <p className="text-sm text-muted-foreground">Connect a Shopify Custom App to power AI shopping and broadcasts.</p>
        </div>
      </header>

      {status?.connected ? (
        <ConnectedView
          status={status}
          busy={busy}
          onSync={runSync}
          onDisconnect={disconnect}
          onWebhooks={registerWebhooks}
        />
      ) : (
        <ConnectForm form={form} setForm={setForm} onConnect={connect} busy={busy === "connect"} />
      )}
    </div>
  );
}

// ─── Connect form ───────────────────────────────────────────
function ConnectForm({ form, setForm, onConnect, busy }: {
  form: { store_url: string; access_token: string; shared_secret: string; api_version: string };
  setForm: (f: { store_url: string; access_token: string; shared_secret: string; api_version: string }) => void;
  onConnect: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5 space-y-4">
        <div>
          <h2 className="font-medium text-sm">1. Create a Custom App in your Shopify admin</h2>
          <ol className="mt-2 text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Shopify Admin → <b>Settings</b> → <b>Apps and sales channels</b> → <b>Develop apps</b> → <b>Create an app</b>.</li>
            <li>Give it <b>Admin API access scopes</b>: <code className="text-xs">read_products, read_customers, read_orders, read_content, read_online_store_pages, read_price_rules, read_discounts, read_inventory, read_fulfillments, read_shipping</code>, plus <code className="text-xs">write_orders</code> if you want us to tag/annotate orders.</li>
            <li>Install the app and copy the <b>Admin API access token</b> and <b>API secret key</b> (the shared secret).</li>
          </ol>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-5 space-y-4">
        <h2 className="font-medium text-sm">2. Paste your credentials</h2>
        <div className="grid gap-3">
          <label className="text-sm">
            <span className="text-muted-foreground">Store URL</span>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="acme.myshopify.com"
              value={form.store_url}
              onChange={(e) => setForm({ ...form, store_url: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Admin API access token</span>
            <input
              type="password"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
              placeholder="shpat_…"
              value={form.access_token}
              onChange={(e) => setForm({ ...form, access_token: e.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">API secret key (webhook shared secret)</span>
            <input
              type="password"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
              placeholder="Shared secret from the Custom App"
              value={form.shared_secret}
              onChange={(e) => setForm({ ...form, shared_secret: e.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">API version (optional)</span>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
              placeholder="2025-01"
              value={form.api_version}
              onChange={(e) => setForm({ ...form, api_version: e.target.value })}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onConnect}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Connect & start initial sync
        </button>
        <p className="text-xs text-muted-foreground">
          Both secrets are encrypted at rest with our versioned key manager and are never returned to the browser after saving.
        </p>
      </section>
    </div>
  );
}

// ─── Connected view ─────────────────────────────────────────
function ConnectedView({ status, busy, onSync, onWebhooks, onDisconnect }: {
  status: StatusSummary;
  busy: null | "connect" | "sync" | "disconnect" | "webhooks";
  onSync: () => void;
  onWebhooks: () => void;
  onDisconnect: () => void;
}) {
  const badge = status.sync_status === "syncing"
    ? { text: "Syncing…", cls: "bg-blue-50 text-blue-700 border-blue-200" }
    : status.sync_status === "error"
    ? { text: "Error", cls: "bg-rose-50 text-rose-700 border-rose-200" }
    : { text: "Connected", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${badge.cls}`}>
                {status.sync_status === "syncing" && <Loader2 className="w-3 h-3 animate-spin" />}
                {status.sync_status === "error" && <AlertCircle className="w-3 h-3" />}
                {status.sync_status === "idle" && <CheckCircle2 className="w-3 h-3" />}
                {badge.text}
              </span>
              {status.pending_jobs > 0 && (
                <span className="text-xs text-muted-foreground">{status.pending_jobs} job(s) pending</span>
              )}
              {status.failed_jobs > 0 && (
                <span className="text-xs text-rose-600">{status.failed_jobs} failed</span>
              )}
            </div>
            <div className="mt-1 text-sm">
              <span className="font-medium">{status.store_url}</span>
              <span className="text-muted-foreground"> · API {status.api_version}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Connected {status.connected_at ? new Date(status.connected_at).toLocaleString() : "—"}
              {" · "}
              Last full sync {status.last_full_sync_at ? new Date(status.last_full_sync_at).toLocaleString() : "never"}
            </div>
            {status.sync_error && (
              <div className="mt-2 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                {status.sync_error}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onSync}
              disabled={busy !== null || status.sync_status === "syncing"}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Full sync
            </button>
            <button
              onClick={onWebhooks}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              Re-register webhooks
            </button>
            <button
              onClick={onDisconnect}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-100 disabled:opacity-60"
            >
              {busy === "disconnect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Disconnect
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h3 className="font-medium text-sm mb-3">Local mirror</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {RESOURCE_ROWS.map(({ key, label, icon: Icon }) => (
            <div key={key} className="rounded-md border bg-gray-50 p-3 flex items-center gap-3">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="font-semibold">{(status.counts[key] || 0).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
