"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonMetric } from "@/components/ui/skeleton";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

interface KPIStats {
  totalMessages: number;
  messagesThisWeek: number;
  totalConversations: number;
  conversationsToday: number;
  avgResponseTimeSec: number | null;
  hoursSaved: number;
  automationPct: number;
  tenantId: string | null;
}

function formatLargeNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  return n.toLocaleString();
}

// Smooth animated counter — re-runs whenever `target` changes.
function AnimatedValue({ target, format = formatLargeNum }: { target: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const startTime = performance.now();
    const duration = 400;

    cancelAnimationFrame(frameRef.current);
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
      const current = Math.round(from + (target - from) * eased);
      setDisplay(current);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  return <>{format(display)}</>;
}

export function DashboardMetrics() {
  const [stats, setStats] = useState<KPIStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Separated so realtime increments don't re-trigger the full fetch
  const [msgCount, setMsgCount] = useState(0);
  const [msgWeekCount, setMsgWeekCount] = useState(0);
  const [convCount, setConvCount] = useState(0);
  const [convTodayCount, setConvTodayCount] = useState(0);
  const statsRef = useRef<KPIStats | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch('/api/dashboard/kpi-stats');
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      const data: KPIStats = json.data;
      setStats(data);
      statsRef.current = data;
      setMsgCount(data.totalMessages);
      setMsgWeekCount(data.messagesThisWeek);
      setConvCount(data.totalConversations);
      setConvTodayCount(data.conversationsToday);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh computed metrics (avg response time, hours saved) every 60s
  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Supabase Realtime — live increments when new messages / conversations arrive
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createBrowserSupabaseClient>['channel']> | null = null;

    const setupRealtime = (tenantId: string) => {
      const supabase = createBrowserSupabaseClient();
      const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      channel = supabase
        .channel(`dashboard-kpis-${tenantId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantId}` },
          (payload) => {
            if (!payload.new || !('id' in payload.new)) return;
            const row = payload.new as { created_at?: string };
            setMsgCount(n => n + 1);
            if (row.created_at && new Date(row.created_at).getTime() >= weekAgoMs) {
              setMsgWeekCount(n => n + 1);
            }
          })
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'conversations', filter: `tenant_id=eq.${tenantId}` },
          (payload) => {
            if (!payload.new || !('id' in payload.new)) return;
            const row = payload.new as { created_at?: string };
            setConvCount(n => n + 1);
            if (row.created_at && new Date(row.created_at).getTime() >= todayStart.getTime()) {
              setConvTodayCount(n => n + 1);
            }
          })
        .subscribe();
    };

    // Wait for tenantId from initial load
    const checkInterval = setInterval(() => {
      if (statsRef.current?.tenantId) {
        clearInterval(checkInterval);
        setupRealtime(statsRef.current.tenantId);
      }
    }, 200);

    return () => {
      clearInterval(checkInterval);
      if (channel) {
        createBrowserSupabaseClient().removeChannel(channel);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <SkeletonMetric key={i} />)}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-border bg-[#F9F9F8] dark:bg-card shadow-none">
            <CardContent className="p-4 sm:p-6">
              <p className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase mb-2 sm:mb-4">—</p>
              <div className="text-xl sm:text-2xl font-semibold text-muted-foreground mb-2 sm:mb-4">
                Unable to load
              </div>
              {i === 0 && (
                <button onClick={load} className="text-xs text-cyan-500 underline underline-offset-2">
                  Retry
                </button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const avgDisplay = stats.avgResponseTimeSec != null
    ? `${stats.avgResponseTimeSec.toFixed(1)} sec`
    : '–';
  const avgSubtitle = stats.avgResponseTimeSec != null ? 'Instant AI replies' : 'Waiting for data';

  const metrics = [
    {
      label: 'TOTAL MESSAGES',
      valueNode: <AnimatedValue target={msgCount} />,
      trend: `+${formatLargeNum(msgWeekCount)} this week`,
      isPositive: true,
    },
    {
      label: 'TOTAL CHATS',
      valueNode: <AnimatedValue target={convCount} />,
      trend: `+${formatLargeNum(convTodayCount)} today`,
      isPositive: true,
    },
    {
      label: 'AVG RESPONSE TIME',
      valueNode: <>{avgDisplay}</>,
      trend: avgSubtitle,
      isPositive: stats.avgResponseTimeSec != null,
      staticValue: true,
    },
    {
      label: 'HOURS SAVED',
      valueNode: <AnimatedValue target={stats.hoursSaved} format={(n) => `${formatLargeNum(n)} hrs`} />,
      trend: `${stats.automationPct}% automated`,
      isPositive: stats.automationPct > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <Card key={m.label} className="border-border bg-[#F9F9F8] dark:bg-card shadow-none transition-colors">
          <CardContent className="p-4 sm:p-6">
            <p className="text-[10px] sm:text-[11px] font-bold tracking-widest text-muted-foreground uppercase mb-2 sm:mb-4 truncate">
              {m.label}
            </p>
            <div className="text-2xl sm:text-4xl font-semibold text-foreground tracking-tight mb-2 sm:mb-4">
              {m.valueNode}
            </div>
            <div className={cn(
              "flex items-center text-sm font-medium",
              m.isPositive ? "text-emerald-500" : "text-muted-foreground"
            )}>
              {m.isPositive && <ArrowUp className="w-3.5 h-3.5 mr-1 shrink-0" />}
              <span>{m.trend}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
