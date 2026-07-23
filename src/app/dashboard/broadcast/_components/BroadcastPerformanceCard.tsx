import React, { useEffect, useState } from 'react';
import { 
  BarChart3, TrendingUp, Eye, MessageSquare, Clock, 
  LayoutTemplate, Compass, ShieldAlert, Sparkles 
} from 'lucide-react';

interface StatsData {
  deliveryRatePct: number;
  readRatePct: number;
  replyRatePct: number;
  bestSendHourText: string;
  bestTemplateName: string;
  totalCampaignsExecuted: number;
}

export function BroadcastPerformanceCard() {
  const [stats, setStats] = useState<StatsData>({
    deliveryRatePct: 0,
    readRatePct: 0,
    replyRatePct: 0,
    bestSendHourText: 'Not enough data',
    bestTemplateName: 'Not enough data',
    totalCampaignsExecuted: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const res = await fetch('/api/broadcasts/performance');
        const data = await res.json();
        if (data.success && data.stats) {
          setStats(data.stats);
        }
      } catch (err) {
        console.error('Failed to load performance intelligence stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/60 gap-1.5 bg-background border border-border/60 rounded-xl p-4">
        <BarChart3 className="w-4 h-4 animate-spin text-indigo-500" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Aggregating historical metrics...</span>
      </div>
    );
  }

  return (
    <div className="border border-border/60 rounded-xl p-4 bg-background space-y-4 text-left">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/25 pb-3">
        <div className="w-6 h-6 rounded bg-secondary flex items-center justify-center">
          <Compass className="w-3.5 h-3.5 text-indigo-500" />
        </div>
        <div className="text-left leading-none">
          <span className="text-[12px] font-bold text-foreground block">30-Day Outreach Intelligence</span>
          <span className="text-[9.5px] text-muted-foreground mt-0.5 block">Aggregated averages across {stats.totalCampaignsExecuted} completed campaigns</span>
        </div>
      </div>

      {/* Numerical Metrics Row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Delivery Rate', value: stats.deliveryRatePct, color: 'text-emerald-600', icon: TrendingUp },
          { label: 'Read Rate',     value: stats.readRatePct,     color: 'text-blue-600',     icon: Eye },
          { label: 'Reply Rate',    value: stats.replyRatePct,    color: 'text-indigo-500',   icon: MessageSquare },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="p-2 border border-border/45 rounded-lg bg-secondary/15 flex flex-col items-start gap-1">
              <div className="flex items-center gap-1">
                <Icon className={`w-3 h-3 ${c.color}`} />
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">{c.label}</span>
              </div>
              <span className={`text-[16px] font-bold leading-none tabular-nums ${c.color}`}>{c.value}%</span>
            </div>
          );
        })}
      </div>

      {/* Intelligence Predictions Checklist */}
      <div className="space-y-2 pt-2 border-t border-border/20">
        {/* Best sending window */}
        <div className="flex items-center justify-between text-[11.5px] py-0.5">
          <div className="flex items-center gap-2 text-foreground/80">
            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground/70">Optimal Send Window</span>
          </div>
          <span className="font-bold text-foreground">
            {stats.bestSendHourText} local time
          </span>
        </div>

        {/* Best performing template */}
        <div className="flex items-center justify-between text-[11.5px] py-0.5">
          <div className="flex items-center gap-2 text-foreground/80">
            <LayoutTemplate className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground/70">Best Outreach Template</span>
          </div>
          <span className="font-bold text-foreground truncate max-w-[150px]">
            {stats.bestTemplateName}
          </span>
        </div>
      </div>
    </div>
  );
}
