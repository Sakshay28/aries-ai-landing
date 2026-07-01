"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, CalendarCheck, LifeBuoy, CreditCard, AlertTriangle, MessageSquareWarning, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type NotificationItem = {
  id: string;
  event_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  wa_status: string;
  is_read: boolean;
  created_at: string;
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  booking_confirmation: <CalendarCheck className="h-3.5 w-3.5 text-emerald-500" />,
  booking_reminder:     <CalendarCheck className="h-3.5 w-3.5 text-emerald-500" />,
  reservation_update:   <CalendarCheck className="h-3.5 w-3.5 text-amber-500" />,
  human_assistance:     <LifeBuoy className="h-3.5 w-3.5 text-red-500" />,
  support_response:     <MessageSquareWarning className="h-3.5 w-3.5 text-amber-500" />,
  payment_confirmation: <CreditCard className="h-3.5 w-3.5 text-emerald-500" />,
  staff_keepalive:      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
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

export function BusinessNotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCritical, setHasCritical] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const supabaseRef = useRef(createBrowserSupabaseClient());
  const tenantIdRef = useRef<string | null>(null);

  const pollUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/notifications?unread=1&limit=10");
      if (res.ok) {
        const data = await res.json();
        setUnread(data.unread_count ?? 0);
        setHasCritical((data.notifications || []).some((n: NotificationItem) => n.severity === "critical"));
        tenantIdRef.current = data.tenant_id ?? tenantIdRef.current;
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

  // Realtime — pushes new events instantly instead of waiting for the poll.
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createBrowserSupabaseClient>["channel"]> | null = null;
    let cancelled = false;

    (async () => {
      // Need the tenant id once before we can scope the subscription filter.
      if (!tenantIdRef.current) await pollUnread();
      if (cancelled || !tenantIdRef.current) return;

      const supabase = supabaseRef.current;
      channel = supabase
        .channel(`business-notifications-${tenantIdRef.current}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "business_notifications", filter: `tenant_id=eq.${tenantIdRef.current}` },
          (payload) => {
            const row = payload.new as NotificationItem;
            setUnread((prev) => prev + 1);
            if (row.severity === "critical") {
              setHasCritical(true);
              audioRef.current?.play().catch(() => {});
            }
            if (open) loadNotifications();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabaseRef.current.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab-title badge for unread critical alerts — visible even if the tab isn't focused.
  useEffect(() => {
    const original = document.title.replace(/^\(\d+\)\s*/, "");
    if (hasCritical && unread > 0) {
      document.title = `(${unread}) ${original}`;
    } else {
      document.title = original;
    }
    return () => { document.title = original; };
  }, [unread, hasCritical]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/notifications?limit=20");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnread(data.unread_count ?? 0);
        setHasCritical((data.notifications || []).some((n: NotificationItem) => n.severity === "critical" && !n.is_read));
        tenantIdRef.current = data.tenant_id ?? tenantIdRef.current;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadNotifications();
  }, [open, loadNotifications]);

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
    await fetch(`/api/dashboard/notifications`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnread((prev) => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await fetch(`/api/dashboard/notifications`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: unreadIds }) });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    setHasCritical(false);
  };

  return (
    <div className="relative">
      {/* Short ping — plays only when a critical (guaranteed-delivery failure) event arrives */}
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" type="audio/wav" />
      </audio>

      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          open && "bg-muted text-foreground",
        )}
        aria-label="Business Notifications"
      >
        <Bell className={cn("h-4 w-4", hasCritical && unread > 0 && "animate-pulse text-red-500")} />
        {unread > 0 && (
          <span className={cn(
            "absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white leading-none",
            hasCritical ? "bg-red-500" : "bg-blue-500",
          )}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 lg:right-auto lg:left-0 top-10 z-50 w-80 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-sm font-bold text-foreground">Alerts</span>
              {unread > 0 && (
                <span className={cn(
                  "flex h-4 min-w-[16px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                  hasCritical ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-blue-500/15 text-blue-600 dark:text-blue-400",
                )}>
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

          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <Bell className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No alerts yet — bookings, handoffs, and payments will show up here.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      !n.is_read && n.severity === "critical" && "bg-red-500/5",
                      !n.is_read && n.severity !== "critical" && "bg-blue-500/5",
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      !n.is_read ? (n.severity === "critical" ? "bg-red-500/10" : "bg-blue-500/10") : "bg-muted",
                    )}>
                      {TYPE_ICON[n.event_type] || <Bell className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground">{n.title}</p>
                      {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <div className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.severity === "critical" ? "bg-red-500" : "bg-blue-500")} />
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
