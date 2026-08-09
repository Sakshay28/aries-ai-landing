"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Truck, CheckCircle2, AlertCircle, Loader2, Trash2, Copy, Package, RefreshCw,
} from "lucide-react";

interface StatusSummary {
  connected: boolean;
  email: string | null;
  status: "disconnected" | "connected" | "error";
  last_auth_error: string | null;
  connected_at: string | null;
  last_token_refresh_at: string | null;
  default_pickup_location: string | null;
  default_item_weight_kg: number | null;
  default_package_length_cm: number | null;
  default_package_breadth_cm: number | null;
  default_package_height_cm: number | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  counts: Record<string, number>;
  pending_jobs: number;
  failed_jobs: number;
}

interface ShipmentRow {
  shopify_order_id: string;
  order_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  shipment: {
    id: string;
    status: string;
    status_raw: string | null;
    courier_name: string | null;
    awb_code: string | null;
    label_url: string | null;
    last_error: string | null;
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", creating: "Creating…", created: "Created",
  awb_assigned: "Courier assigned", pickup_scheduled: "Pickup scheduled",
  label_generated: "Label ready", in_transit: "In transit",
  out_for_delivery: "Out for delivery", delivered: "Delivered",
  cancelled: "Cancelled", failed: "Failed", rto: "RTO",
};

export function ShiprocketDashboard() {
  const [tab, setTab] = useState<"connection" | "shipments">("connection");
  const [status, setStatus] = useState<StatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "connect" | "test" | "disconnect" | "defaults">(null);
  const [form, setForm] = useState({ email: "", password: "" });
  const [defaults, setDefaultsForm] = useState({
    default_item_weight_kg: "", default_package_length_cm: "", default_package_breadth_cm: "", default_package_height_cm: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/shiprocket", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load status");
      setStatus(data);
      setDefaultsForm({
        default_item_weight_kg: String(data.default_item_weight_kg ?? ""),
        default_package_length_cm: String(data.default_package_length_cm ?? ""),
        default_package_breadth_cm: String(data.default_package_breadth_cm ?? ""),
        default_package_height_cm: String(data.default_package_height_cm ?? ""),
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (status?.connected) setTab((t) => (t === "connection" && status.default_pickup_location ? "shipments" : t));
  }, [status?.connected, status?.default_pickup_location]);

  const connect = async () => {
    if (!form.email.trim() || !form.password.trim()) {
      toast.error("Email and password are both required");
      return;
    }
    setBusy("connect");
    try {
      const res = await fetch("/api/integrations/shiprocket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", ...form }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || "Connect failed");
      toast.success("Connected to Shiprocket");
      setForm({ email: "", password: "" });
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const testConnection = async () => {
    setBusy("test");
    try {
      const res = await fetch("/api/integrations/shiprocket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_connection" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Test failed");
      toast.success("Connection is healthy");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveDefaults = async () => {
    setBusy("defaults");
    try {
      const res = await fetch("/api/integrations/shiprocket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_defaults",
          default_item_weight_kg: parseFloat(defaults.default_item_weight_kg) || undefined,
          default_package_length_cm: parseFloat(defaults.default_package_length_cm) || undefined,
          default_package_breadth_cm: parseFloat(defaults.default_package_breadth_cm) || undefined,
          default_package_height_cm: parseFloat(defaults.default_package_height_cm) || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      toast.success("Defaults saved");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const setPickupLocation = async (pickup_location: string) => {
    try {
      const res = await fetch("/api/integrations/shiprocket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_pickup_location", pickup_location }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      toast.success("Pickup location saved");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Shiprocket? Existing shipment history will be preserved but no further shipments can be created.")) return;
    setBusy("disconnect");
    try {
      const res = await fetch("/api/integrations/shiprocket", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Disconnect failed");
      toast.success("Disconnected");
      setTab("connection");
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
        <div className="p-2 rounded-lg bg-sky-50 border border-sky-200">
          <Truck className="w-6 h-6 text-sky-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Shiprocket Integration</h1>
          <p className="text-sm text-muted-foreground">Ship orders, track deliveries, and send WhatsApp shipment updates.</p>
        </div>
      </header>

      {status?.connected && (
        <div className="flex gap-1 border-b">
          {(["connection", "shipments"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === t ? "border-sky-600 text-sky-700 font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t === "connection" ? "Connection" : "Shipments"}
            </button>
          ))}
        </div>
      )}

      {tab === "connection" || !status?.connected ? (
        status?.connected ? (
          <ConnectedView
            status={status}
            busy={busy}
            defaults={defaults}
            setDefaultsForm={setDefaultsForm}
            onSaveDefaults={saveDefaults}
            onSetPickupLocation={setPickupLocation}
            onTest={testConnection}
            onDisconnect={disconnect}
          />
        ) : (
          <ConnectForm form={form} setForm={setForm} onConnect={connect} busy={busy === "connect"} status={status} />
        )
      ) : (
        <ShipmentsTab defaultPickupLocation={status.default_pickup_location} />
      )}
    </div>
  );
}

// ─── Connect form ───────────────────────────────────────────
function ConnectForm({ form, setForm, onConnect, busy, status }: {
  form: { email: string; password: string };
  setForm: (f: { email: string; password: string }) => void;
  onConnect: () => void;
  busy: boolean;
  status: StatusSummary | null;
}) {
  return (
    <div className="space-y-6">
      {status?.status === "error" && status.last_auth_error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Last connection attempt failed</div>
            <div className="text-xs mt-0.5">{status.last_auth_error}</div>
          </div>
        </div>
      )}
      <section className="rounded-lg border bg-white p-5 space-y-4">
        <h2 className="font-medium text-sm">Connect your Shiprocket account</h2>
        <p className="text-sm text-muted-foreground">
          Use the same email and password you use to log in at{" "}
          <a href="https://app.shiprocket.in" target="_blank" rel="noreferrer" className="underline">app.shiprocket.in</a>.
        </p>
        <div className="grid gap-3 max-w-sm">
          <label className="text-sm">
            <span className="text-muted-foreground">Email</span>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Password</span>
            <input
              type="password"
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="off"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onConnect}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Connect
        </button>
        <p className="text-xs text-muted-foreground">
          Your password is encrypted at rest with our versioned key manager and is never returned to the browser after saving.
        </p>
      </section>
    </div>
  );
}

// ─── Connected view ─────────────────────────────────────────
function ConnectedView({ status, busy, defaults, setDefaultsForm, onSaveDefaults, onSetPickupLocation, onTest, onDisconnect }: {
  status: StatusSummary;
  busy: null | "connect" | "test" | "disconnect" | "defaults";
  defaults: { default_item_weight_kg: string; default_package_length_cm: string; default_package_breadth_cm: string; default_package_height_cm: string };
  setDefaultsForm: (d: { default_item_weight_kg: string; default_package_length_cm: string; default_package_breadth_cm: string; default_package_height_cm: string }) => void;
  onSaveDefaults: () => void;
  onSetPickupLocation: (v: string) => void;
  onTest: () => void;
  onDisconnect: () => void;
}) {
  const [pickupInput, setPickupInput] = useState(status.default_pickup_location || "");

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </span>
            <div className="mt-1 text-sm font-medium">{status.email}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Connected {status.connected_at ? new Date(status.connected_at).toLocaleString() : "—"}
              {" · "}
              Token last refreshed {status.last_token_refresh_at ? new Date(status.last_token_refresh_at).toLocaleString() : "—"}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onTest}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Test connection
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

      <section className="rounded-lg border bg-white p-5 space-y-3">
        <h3 className="font-medium text-sm">Webhook — paste into Shiprocket</h3>
        <p className="text-xs text-muted-foreground">
          In Shiprocket: Settings → API → Configure a webhook with this URL and API key so shipment status updates flow back into Aries AI.
        </p>
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-gray-50 px-3 py-2 text-xs truncate">{status.webhook_url}</code>
            <button onClick={() => copy(status.webhook_url || "", "Webhook URL")} className="p-2 rounded-md border hover:bg-gray-50" title="Copy">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-gray-50 px-3 py-2 text-xs truncate">{status.webhook_secret}</code>
            <button onClick={() => copy(status.webhook_secret || "", "API key")} className="p-2 rounded-md border hover:bg-gray-50" title="Copy">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-5 space-y-3">
        <h3 className="font-medium text-sm">Pickup location</h3>
        <div className="flex items-center gap-2 max-w-md">
          <input
            className="flex-1 rounded-md border px-3 py-2 text-sm"
            placeholder="Pickup location nickname from Shiprocket"
            value={pickupInput}
            onChange={(e) => setPickupInput(e.target.value)}
          />
          <button
            onClick={() => onSetPickupLocation(pickupInput)}
            disabled={!pickupInput.trim()}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Save
          </button>
        </div>
        {!status.default_pickup_location && (
          <p className="text-xs text-amber-600">Set a pickup location before creating shipments.</p>
        )}
      </section>

      <section className="rounded-lg border bg-white p-5 space-y-3">
        <h3 className="font-medium text-sm">Default package weight &amp; dimensions</h3>
        <p className="text-xs text-muted-foreground">
          Used when an order&apos;s items don&apos;t have synced weight data, or as the package size for every shipment (Shopify has no dimension data).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl">
          {([
            ["default_item_weight_kg", "Weight (kg)"],
            ["default_package_length_cm", "Length (cm)"],
            ["default_package_breadth_cm", "Breadth (cm)"],
            ["default_package_height_cm", "Height (cm)"],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-sm">
              <span className="text-muted-foreground text-xs">{label}</span>
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                value={defaults[key]}
                onChange={(e) => setDefaultsForm({ ...defaults, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <button
          onClick={onSaveDefaults}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
        >
          {busy === "defaults" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save defaults
        </button>
      </section>
    </div>
  );
}

// ─── Shipments tab ──────────────────────────────────────────
function ShipmentsTab({ defaultPickupLocation }: { defaultPickupLocation: string | null }) {
  const [rows, setRows] = useState<ShipmentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/shiprocket/shipments", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load shipments");
      setRows(data.rows || []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const call = async (path: string, body: Record<string, unknown>, busyKey: string, successMsg: string) => {
    setRowBusy(busyKey);
    try {
      const res = await fetch(`/api/integrations/shiprocket/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || `${path} failed`);
      toast.success(successMsg);
      await load();
      return data;
    } catch (err) {
      toast.error((err as Error).message);
      return null;
    } finally {
      setRowBusy(null);
    }
  };

  const actionFor = (row: ShipmentRow) => {
    const s = row.shipment;
    if (!s || s.status === "failed") {
      return {
        label: s?.status === "failed" ? "Retry" : "Create shipment",
        onClick: () => call("create-shipment", { shopify_order_id: row.shopify_order_id }, row.shopify_order_id, "Shipment created"),
      };
    }
    if (s.status === "pending" || s.status === "creating") return null;
    if (s.status === "created") {
      return { label: "Assign courier", onClick: () => call("assign-awb", { shipment_id: s.id }, s.id, "Courier & AWB assigned") };
    }
    if (s.status === "awb_assigned") {
      return { label: "Schedule pickup", onClick: () => call("schedule-pickup", { shipment_id: s.id }, s.id, "Pickup scheduled") };
    }
    if (s.status === "pickup_scheduled") {
      return {
        label: "Generate label", onClick: async () => {
          const data = await call("generate-label", { shipment_id: s.id }, s.id, "Label generated");
          if (data?.label_url) window.open(data.label_url, "_blank");
        },
      };
    }
    if (s.label_url && ["label_generated", "in_transit", "out_for_delivery"].includes(s.status)) {
      return { label: "Refresh tracking", onClick: () => call("track", { shipment_id: s.id }, s.id, "Tracking refreshed") };
    }
    return null;
  };

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      {!defaultPickupLocation && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> Set a pickup location on the Connection tab before creating shipments.
        </div>
      )}
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Order</th>
              <th className="text-left px-4 py-2 font-medium">Customer</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Courier / AWB</th>
              <th className="text-right px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                <Package className="w-6 h-6 mx-auto mb-2 opacity-40" /> No Shopify orders found yet.
              </td></tr>
            )}
            {(rows || []).map((row) => {
              const action = actionFor(row);
              const s = row.shipment;
              return (
                <tr key={row.shopify_order_id} className="border-t">
                  <td className="px-4 py-2 font-medium">{row.order_number || "—"}</td>
                  <td className="px-4 py-2">
                    <div>{row.customer_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{row.customer_phone || ""}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs bg-gray-50">
                      {STATUS_LABEL[s?.status || "pending"] || s?.status || "Not shipped"}
                    </span>
                    {s?.last_error && <div className="text-xs text-rose-600 mt-1 max-w-[16rem] truncate" title={s.last_error}>{s.last_error}</div>}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {s?.courier_name ? <div>{s.courier_name}</div> : null}
                    {s?.awb_code ? <div className="font-mono text-muted-foreground">{s.awb_code}</div> : null}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {action && (
                      <button
                        onClick={action.onClick}
                        disabled={rowBusy !== null || (!defaultPickupLocation && !s)}
                        className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-60"
                      >
                        {rowBusy === (s?.id || row.shopify_order_id) ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {action.label}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
