"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonMetric } from "@/components/ui/skeleton";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardStats {
  totalLeads: number;
  activeConversations: number;
  messagesThisMonth: number;
  messageLimit: number;
  newLeadsToday: number;
  confirmedBookings: number;
  conversionRate: string;
}

function formatNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function DashboardMetrics() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setStats(json.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

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
            <CardContent className="p-6">
              <p className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase mb-4">—</p>
              <div className="text-2xl font-semibold text-muted-foreground mb-4">Error</div>
              {i === 0 && (
                <button
                  onClick={load}
                  className="text-xs text-cyan-500 underline underline-offset-2"
                >
                  Retry
                </button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const usagePct = stats.messageLimit > 0
    ? Math.round((stats.messagesThisMonth / stats.messageLimit) * 100)
    : 0;

  const metrics = [
    {
      label: "MESSAGES SENT",
      value: formatNum(stats.messagesThisMonth),
      trend: `${usagePct}% of limit`,
      isPositive: usagePct < 80,
    },
    {
      label: "ACTIVE CHATS",
      value: formatNum(stats.activeConversations),
      trend: "live conversations",
      isPositive: true,
    },
    {
      label: "CONTACTS",
      value: formatNum(stats.totalLeads),
      trend: `+${formatNum(stats.newLeadsToday)} today`,
      isPositive: stats.newLeadsToday > 0,
    },
    {
      label: "CONVERSION",
      value: stats.conversionRate,
      trend: `${formatNum(stats.confirmedBookings)} bookings`,
      isPositive: stats.confirmedBookings > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <Card key={m.label} className="border-border bg-[#F9F9F8] dark:bg-card shadow-none transition-colors">
          <CardContent className="p-6">
            <p className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase mb-4">{m.label}</p>
            <div className="text-4xl font-semibold text-foreground tracking-tight mb-4">{m.value}</div>
            <div className={cn(
              "flex items-center text-sm font-medium",
              m.isPositive ? "text-emerald-500" : "text-destructive"
            )}>
              {m.isPositive
                ? <ArrowUp className="w-3.5 h-3.5 mr-1" />
                : <ArrowDown className="w-3.5 h-3.5 mr-1" />}
              <span>{m.trend}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
