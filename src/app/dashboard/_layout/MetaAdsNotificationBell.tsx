"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, TrendingUp, PhoneCall, AlertTriangle, PauseCircle, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  data?: Record<string, unknown>;
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  new_lead:          <PhoneCall className="h-3.5 w-3.5 text-blue-500" />,
  high_spend:        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
  campaign_paused:   <PauseCircle className="h-3.5 w-3.5 text-zinc-500" />,
  campaign_approved: <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />,
  campaign_rejected: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
  new_booking:       <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />,
  token_expiring:    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
};

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MetaAdsNotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Poll for unread count every 60 seconds
  const pollUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/meta-ads/notifications?unread=1&limit=1");
      if (res.ok) {
        const data = await res.json();
        setUnread(data.unread_count ?? 0);
      }
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    pollUnread();
    const interval = setInterval(pollUnread, 60_000);
    return () => clearInterval(interval);
  }, [pollUnread]);

  // Load full notifications when panel opens
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/meta-ads/notifications?limit=20");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnread(data.unread_count ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadNotifications();
  }, [open, loadNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const markRead = async (id: string) => {
    await fetch(`/api/meta-ads/notifications`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnread((prev) => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await fetch(`/api/meta-ads/notifications`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: unreadIds }) });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  };

  if (unread === 0 && !open) {
    // Don't render bell if no unread and panel not open (optionally always render)
    // Actually always render for discoverability
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          open && "bg-muted text-foreground",
        )}
        aria-label="Meta Ads Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-sm font-bold text-foreground">Meta Ads</span>
              {unread > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500/15 px-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                  {unread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="rounded-md px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted text-muted-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <Bell className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      !n.is_read && "bg-blue-500/5",
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      !n.is_read ? "bg-blue-500/10" : "bg-muted",
                    )}>
                      {TYPE_ICON[n.type] || <Bell className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-semibold text-foreground", !n.is_read && "text-foreground")}>{n.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
