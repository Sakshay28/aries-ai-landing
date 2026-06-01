import React, { useEffect, useState, useMemo } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { 
  Users, CheckCircle2, AlertTriangle, Eye, Send, 
  Hourglass, Activity, RefreshCw, BarChart2
} from 'lucide-react';

interface Stats {
  queuedCount: number;
  processingCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  retryingCount: number;
  failedCount: number;
  totalRecipientCount: number;
  throughputPerMin: number;
  etaSecondsRemaining: number;
}

interface QueueStatusCardProps {
  campaignId: string;
}

export function QueueStatusCard({ campaignId }: QueueStatusCardProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [stats, setStats] = useState<Stats>({
    queuedCount: 0,
    processingCount: 0,
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    retryingCount: 0,
    failedCount: 0,
    totalRecipientCount: 0,
    throughputPerMin: 300,
    etaSecondsRemaining: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/broadcasts/observability?campaignId=${campaignId}`);
      const data = await res.json();
      if (data.success && data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to load queue status observability statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  // 1. Initial Fetch
  useEffect(() => {
    fetchStats();
  }, [campaignId]);

  // 2. Periodic reconciliation poll (every 5 seconds) + realtime listeners
  useEffect(() => {
    const interval = setInterval(fetchStats, 5000);

    // Bind real-time Postgres channels for database mutations
    const analyticsChannel = supabase
      .channel(`analytics_q:${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'broadcast_analytics',
          filter: `campaign_id=eq.${campaignId}`
        },
        () => {
          fetchStats(); // Hot-reload data instantly on updates
        }
      )
      .subscribe();

    const queueChannel = supabase
      .channel(`queue_q:${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'broadcast_queue',
          filter: `campaign_id=eq.${campaignId}`
        },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(analyticsChannel);
      supabase.removeChannel(queueChannel);
    };
  }, [campaignId, supabase]);

  const formatETA = (seconds: number) => {
    if (seconds <= 0) return 'Complete';
    if (seconds < 60) return `${seconds}s remaining`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s remaining`;
  };

  const isTransmitting = stats.queuedCount > 0 || stats.processingCount > 0 || stats.retryingCount > 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/60 gap-1.5 bg-background border border-border/60 rounded-xl p-4">
        <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Hydrating queue indicators...</span>
      </div>
    );
  }

  // Calculate percentages
  const pctSent = stats.totalRecipientCount > 0 
    ? Math.round(((stats.sentCount + stats.failedCount) / stats.totalRecipientCount) * 100) 
    : 0;

  return (
    <div className="border border-border/60 rounded-xl p-4 bg-background space-y-4 text-left">
      {/* Header: ETA & Live Status */}
      <div className="flex items-start justify-between gap-3 border-b border-border/25 pb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isTransmitting ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`} />
          <div className="text-left leading-none">
            <span className="text-[11.5px] font-bold text-foreground block">
              {isTransmitting ? 'Transmission Outbox Active' : 'Delivery Cycle Closed'}
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5 block">
              Throttled at {stats.throughputPerMin} msgs/min
            </span>
          </div>
        </div>

        {isTransmitting ? (
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/15">
            <Activity className="w-3 h-3 animate-pulse" />
            <span>{formatETA(stats.etaSecondsRemaining)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/15">
            <CheckCircle2 className="w-3 h-3" />
            <span>Completed</span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {isTransmitting && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10.5px]">
            <span className="font-semibold text-muted-foreground">Dispatch Progress</span>
            <span className="font-bold text-foreground tabular-nums">{pctSent}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden border border-border/30">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-700 ease-out" 
              style={{ width: `${pctSent}%` }}
            />
          </div>
        </div>
      )}

      {/* Observability Grid */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        {[
          { label: 'Queued',   value: stats.queuedCount,       color: 'text-muted-foreground', icon: Hourglass },
          { label: 'Sending',  value: stats.processingCount,   color: 'text-indigo-500',      icon: Activity },
          { label: 'Sent',     value: stats.sentCount,         color: 'text-foreground',      icon: Send },
          { label: 'Delivered',value: stats.deliveredCount,    color: 'text-emerald-600',     icon: CheckCircle2 },
          { label: 'Read',     value: stats.readCount,         color: 'text-blue-600',        icon: Eye },
          { label: 'Retrying', value: stats.retryingCount,     color: 'text-amber-500',       icon: RefreshCw },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="p-2 border border-border/45 rounded-lg bg-secondary/20 flex flex-col items-start gap-1">
              <div className="flex items-center gap-1">
                <Icon className={`w-3 h-3 ${c.color} ${c.label === 'Sending' ? 'animate-pulse' : ''}`} />
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">{c.label}</span>
              </div>
              <span className={`text-[15px] font-bold leading-none tabular-nums ${c.color}`}>{c.value.toLocaleString()}</span>
            </div>
          );
        })}
      </div>

      {stats.failedCount > 0 && (
        <div className="flex items-center gap-2 p-2 border border-red-500/10 rounded-lg bg-red-500/5 text-red-600 text-[11px] leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span><strong>{stats.failedCount} failed deliveries:</strong> permanent bounce or unreachable subscriber lines.</span>
        </div>
      )}
    </div>
  );
}
