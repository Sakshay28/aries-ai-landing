"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  RefreshCw, CheckCircle, XCircle, AlertTriangle,
  Unlink, ChevronRight, Store, Megaphone, MessageSquare,
  Camera, Phone, BarChart2, Loader2, ExternalLink, Globe, Link2, Workflow,
} from "lucide-react";

// Meta / Facebook brand icon (inline SVG — Lucide removed it from v3+)
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
const Facebook = FacebookIcon;
import { cn } from "@/lib/utils";
import type { ConnectionStatusSummary } from "@/lib/meta-ads/types";

// ─── Status Badge ───
function StatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Connected
      </span>
    );
  }
  if (status === "needs_reauth") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Needs Reauth
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-500">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
      Not Connected
    </span>
  );
}

// ─── Connection Card ───
function ConnectionCard({
  icon: Icon,
  title,
  description,
  status,
  detail,
  iconColor = "text-blue-500",
  iconBg = "bg-blue-500/10",
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  status: string;
  detail?: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-border">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <StatusBadge status={status} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        {detail && <p className="mt-1 text-xs font-medium text-foreground/80 truncate">{detail}</p>}
      </div>
    </div>
  );
}

// ─── Asset Row ───
function AssetRow({
  name,
  meta,
  selected,
  onSelect,
}: {
  name: string;
  meta: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all",
        selected
          ? "bg-blue-500/10 border border-blue-500/30 text-foreground"
          : "border border-transparent hover:bg-muted/60 text-muted-foreground hover:text-foreground"
      )}
    >
      <div className={cn("h-2 w-2 shrink-0 rounded-full", selected ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-600")} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{meta}</p>
      </div>
      {selected && <span className="text-xs font-semibold text-blue-500">Active</span>}
    </button>
  );
}

export function MetaAdsSettingsClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConnectionStatusSummary | null>(null);
  const [accounts, setAccounts] = useState<{
    ad_accounts: any[];
    pages: any[];
    whatsapp_numbers: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const connected = searchParams.get("meta_connected");
    const error = searchParams.get("meta_error");
    if (connected === "1") showToast("success", "Meta account connected successfully!");
    else if (error) {
      const msgs: Record<string, string> = {
        invalid_state: "OAuth state mismatch — please try again.",
        state_signature_mismatch: "Security check failed — please try again.",
        missing_code: "Authorization was not granted by Meta.",
        persist_failed: "Connected but failed to save — please reconnect.",
      };
      showToast("error", msgs[error] || `Connection failed: ${error}`);
    }
  }, [searchParams]);

  const load = async () => {
    setLoading(true);
    try {
      const [statusRes, accountsRes] = await Promise.all([
        fetch("/api/meta-ads/status"),
        fetch("/api/meta-ads/accounts"),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (accountsRes.ok) setAccounts(await accountsRes.json());
    } catch {
      showToast("error", "Failed to load connection status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/meta-ads/connect");
      const { url, error } = await res.json();
      if (url) window.location.href = url;
      else showToast("error", error || "Failed to initiate connection");
    } catch {
      showToast("error", "Failed to initiate Meta connection");
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/meta-ads/sync", { method: "POST" });
      if (res.ok) {
        const { synced } = await res.json();
        showToast("success", `Synced: ${synced.ad_accounts} ad accounts, ${synced.pages} pages, ${synced.whatsapp_numbers} WhatsApp numbers`);
        await load();
      } else {
        const { error } = await res.json();
        showToast("error", error || "Sync failed");
      }
    } catch {
      showToast("error", "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Meta? Your campaigns and historical data will be preserved.")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/meta-ads/disconnect", { method: "POST" });
      if (res.ok) {
        showToast("success", "Meta account disconnected");
        setStatus(null);
        setAccounts(null);
      } else {
        showToast("error", "Failed to disconnect");
      }
    } catch {
      showToast("error", "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  const selectAsset = async (id: string, type: "ad_account" | "page" | "whatsapp_number") => {
    await fetch("/api/meta-ads/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: id, type }),
    });
    await load();
  };

  const isConnected = status?.connection !== null && status?.facebook === "connected";

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg border animate-fade-in",
          toast.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
            : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
        )}>
          {toast.type === "success" ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      <div className="max-w-3xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Meta Ads Connection</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect your Facebook / Meta account to create Click-to-WhatsApp campaigns and track ad performance.
            </p>
          </div>
          {isConnected && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Re-sync"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !isConnected ? (
          /* ── Not Connected ── */
          <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-10 text-center">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-blue-500/10 mb-5">
              <Facebook className="h-8 w-8 text-blue-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Connect Meta Ads</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              Connect your Facebook account to create Click-to-WhatsApp campaigns, track leads from ads, and automatically engage every lead with Aries AI.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
                {connecting ? "Redirecting to Meta…" : "Connect with Facebook"}
              </button>
              <a
                href="https://developers.facebook.com/docs/marketing-api"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Meta Ads Docs
              </a>
            </div>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-left max-w-xl mx-auto">
              {[
                ["Click-to-WhatsApp Ads", "Drive WhatsApp conversations from Facebook & Instagram"],
                ["Lead Attribution", "Track every ad click through to booking"],
                ["AI Auto-Engagement", "Aries AI responds instantly to every ad lead"],
                ["ROI Analytics", "Measure cost per lead, booking, and ROAS"],
              ].map(([t, d]) => (
                <div key={t} className="rounded-xl border border-border/60 bg-card p-3">
                  <p className="text-xs font-semibold text-foreground">{t}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{d}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── Connected ── */
          <div className="space-y-6">
            {/* Connection summary */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600">
                  <Facebook className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground">{status?.connection?.fb_user_name || "Facebook Account"}</p>
                    <StatusBadge status={status?.facebook || "connected"} />
                  </div>
                  {status?.connection?.business_name && (
                    <p className="mt-0.5 text-sm text-muted-foreground flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5" /> {status.connection.business_name}
                    </p>
                  )}
                  {status?.connection?.token_expires_at && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Token expires: {new Date(status.connection.token_expires_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                  Disconnect
                </button>
              </div>
            </div>

            {/* Connection status cards */}
            <div className="grid gap-3 sm:grid-cols-2">
              <ConnectionCard
                icon={Facebook}
                title="Facebook Account"
                description="Your personal or business FB account"
                status={status?.facebook || "not_connected"}
                detail={status?.connection?.fb_user_name || undefined}
                iconColor="text-blue-500"
                iconBg="bg-blue-500/10"
              />
              <ConnectionCard
                icon={Store}
                title="Business Manager"
                description="Meta Business Manager account"
                status={status?.business_manager || "not_connected"}
                detail={status?.connection?.business_name || undefined}
                iconColor="text-violet-500"
                iconBg="bg-violet-500/10"
              />
              <ConnectionCard
                icon={Megaphone}
                title="Ad Accounts"
                description="Facebook Ad Accounts for running campaigns"
                status={(status?.ad_accounts?.count || 0) > 0 ? "connected" : "not_connected"}
                detail={`${status?.ad_accounts?.count || 0} account${status?.ad_accounts?.count !== 1 ? "s" : ""} available`}
                iconColor="text-orange-500"
                iconBg="bg-orange-500/10"
              />
              <ConnectionCard
                icon={Globe}
                title="Facebook Pages"
                description="Pages used for Click-to-WhatsApp ads"
                status={(status?.pages?.count || 0) > 0 ? "connected" : "not_connected"}
                detail={`${status?.pages?.count || 0} page${status?.pages?.count !== 1 ? "s" : ""} available`}
                iconColor="text-blue-400"
                iconBg="bg-blue-400/10"
              />
              <ConnectionCard
                icon={Camera}
                title="Instagram"
                description="Instagram Business accounts linked to Pages"
                status={(status?.instagram?.count || 0) > 0 ? "connected" : "not_connected"}
                detail={`${status?.instagram?.count || 0} account${status?.instagram?.count !== 1 ? "s" : ""} linked`}
                iconColor="text-pink-500"
                iconBg="bg-pink-500/10"
              />
              <ConnectionCard
                icon={Phone}
                title="WhatsApp Numbers"
                description="WhatsApp Business numbers for CTWA ads"
                status={(status?.whatsapp_numbers?.count || 0) > 0 ? "connected" : "not_connected"}
                detail={`${status?.whatsapp_numbers?.count || 0} number${status?.whatsapp_numbers?.count !== 1 ? "s" : ""} available`}
                iconColor="text-emerald-500"
                iconBg="bg-emerald-500/10"
              />
            </div>

            {/* Asset selectors */}
            {accounts && (
              <div className="space-y-4">
                {accounts.ad_accounts.length > 0 && (
                  <div className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Megaphone className="h-4 w-4 text-orange-500" />
                      <h3 className="text-sm font-semibold text-foreground">Active Ad Account</h3>
                      <span className="ml-auto text-xs text-muted-foreground">Select one for campaigns</span>
                    </div>
                    <div className="space-y-1.5">
                      {accounts.ad_accounts.map((acc) => (
                        <AssetRow
                          key={acc.id}
                          name={acc.account_name || acc.account_id}
                          meta={`${acc.currency} · ${acc.account_id}`}
                          selected={acc.is_selected}
                          onSelect={() => selectAsset(acc.id, "ad_account")}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {accounts.pages.length > 0 && (
                  <div className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="h-4 w-4 text-blue-400" />
                      <h3 className="text-sm font-semibold text-foreground">Active Facebook Page</h3>
                      <span className="ml-auto text-xs text-muted-foreground">Used in ad creatives</span>
                    </div>
                    <div className="space-y-1.5">
                      {accounts.pages.map((page) => (
                        <AssetRow
                          key={page.id}
                          name={page.page_name || page.page_id}
                          meta={`Page ID: ${page.page_id}${page.instagram_id ? " · IG linked" : ""}`}
                          selected={page.is_selected}
                          onSelect={() => selectAsset(page.id, "page")}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {accounts.whatsapp_numbers.length > 0 && (
                  <div className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Phone className="h-4 w-4 text-emerald-500" />
                      <h3 className="text-sm font-semibold text-foreground">WhatsApp Number</h3>
                      <span className="ml-auto text-xs text-muted-foreground">Default for CTWA campaigns</span>
                    </div>
                    <div className="space-y-1.5">
                      {accounts.whatsapp_numbers.map((wa) => (
                        <AssetRow
                          key={wa.id}
                          name={wa.verified_name || wa.display_phone || wa.phone_number_id}
                          meta={`${wa.display_phone || wa.phone_number_id}${wa.quality_rating ? ` · Quality: ${wa.quality_rating}` : ""}`}
                          selected={wa.is_selected}
                          onSelect={() => selectAsset(wa.id, "whatsapp_number")}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quick actions */}
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { label: "Create Campaign", href: "/dashboard/meta-ads/campaigns?new=1", icon: Megaphone },
                  { label: "Build Ad Flow", href: "/dashboard/flows/editor/new?type=blank&template=meta-ad-lead", icon: Workflow },
                  { label: "View Analytics", href: "/dashboard/meta-ads/analytics", icon: BarChart2 },
                  { label: "View Leads", href: "/dashboard/meta-ads/leads", icon: MessageSquare },
                ].map(({ label, href, icon: Icon }) => (
                  <a
                    key={label}
                    href={href}
                    className="flex items-center gap-2.5 rounded-lg border border-border/60 p-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all group"
                  >
                    <Icon className="h-4 w-4 shrink-0 group-hover:text-foreground transition-colors" />
                    {label}
                    <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
