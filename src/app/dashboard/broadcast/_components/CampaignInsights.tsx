import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Timer, GitBranch, Info } from 'lucide-react';
import { formatDuration } from '@/lib/broadcast/services/campaign-insights.service';
import type { CampaignInsights as CampaignInsightsData } from '@/lib/broadcast/services/campaign-insights.service';

interface CampaignInsightsProps {
  campaignId: string;
}

const FUNNEL_COLORS: Record<string, string> = {
  sent: 'bg-foreground/70',
  delivered: 'bg-emerald-400',
  read: 'bg-blue-400',
};

export function CampaignInsights({ campaignId }: CampaignInsightsProps) {
  const [data, setData] = useState<CampaignInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(`/api/broadcast/campaign/${campaignId}/insights`);
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.insights) {
          setData(json.insights);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground/60 gap-2 border border-border/60 rounded-xl bg-background">
        <div className="w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Loading insights…</span>
      </div>
    );
  }

  // Fail closed: never render fabricated numbers if the fetch failed.
  if (failed || !data) {
    return (
      <div className="flex items-center gap-2 py-4 px-4 text-muted-foreground/70 border border-border/60 rounded-xl bg-background">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px]">Insights are unavailable right now.</span>
      </div>
    );
  }

  const { funnel, failures, readLatency } = data;
  const sent = funnel.stages[0]?.count ?? 0;
  const maxBucket = Math.max(1, ...readLatency.buckets.map((b) => b.count));

  return (
    <div className="space-y-4">
      {/* ── Delivery funnel with absolute counts + drop-off ── */}
      <div className="p-4 border border-border/60 rounded-xl bg-background text-left space-y-3">
        <div className="flex items-center gap-1.5">
          <GitBranch className="w-3.5 h-3.5 text-foreground/60" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Delivery Funnel</p>
        </div>

        {sent === 0 ? (
          <p className="text-[12px] text-muted-foreground py-1">No messages sent yet.</p>
        ) : (
          <div className="space-y-2.5">
            {funnel.stages.map((stage, i) => {
              const prev = i > 0 ? funnel.stages[i - 1] : null;
              const dropoff = prev && prev.count > 0 ? prev.count - stage.count : 0;
              return (
                <div key={stage.key} className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] font-medium text-foreground/80">{stage.label}</span>
                    <span className="text-[12px] tabular-nums">
                      <span className="font-bold text-foreground">{stage.count.toLocaleString()}</span>
                      <span className="text-muted-foreground/70"> · {stage.pctOfSent}%</span>
                    </span>
                  </div>
                  <div className="h-2 bg-secondary/60 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${stage.pctOfSent}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                      className={`h-full rounded-full ${FUNNEL_COLORS[stage.key] || 'bg-foreground/50'}`}
                    />
                  </div>
                  {dropoff > 0 && (
                    <p className="text-[10px] text-muted-foreground/60">
                      −{dropoff.toLocaleString()} dropped from {prev!.label.toLowerCase()}
                    </p>
                  )}
                </div>
              );
            })}
            {funnel.failed > 0 && (
              <div className="flex items-center justify-between pt-1 mt-1 border-t border-border/40">
                <span className="text-[12px] font-medium text-rose-600/80">Failed</span>
                <span className="text-[12px] tabular-nums">
                  <span className="font-bold text-rose-600">{funnel.failed.toLocaleString()}</span>
                  <span className="text-muted-foreground/70"> · {funnel.failedPctOfSent}%</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Failure breakdown ── */}
      {failures.length > 0 && (
        <div className="p-4 border border-border/60 rounded-xl bg-background text-left space-y-2.5">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Why messages failed</p>
          </div>
          <div className="space-y-2">
            {failures.map((f) => (
              <div key={f.key} className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] text-foreground/80">{f.label}</span>
                  <span className="text-[12px] tabular-nums">
                    <span className="font-bold text-foreground">{f.count.toLocaleString()}</span>
                    <span className="text-muted-foreground/70"> · {f.pct}%</span>
                  </span>
                </div>
                <div className="h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${f.pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full bg-rose-400"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Speed to read ── */}
      <div className="p-4 border border-border/60 rounded-xl bg-background text-left space-y-3">
        <div className="flex items-center gap-1.5">
          <Timer className="w-3.5 h-3.5 text-foreground/60" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Speed to read</p>
        </div>

        {readLatency.sampleSize === 0 ? (
          <p className="text-[12px] text-muted-foreground py-1">No reads recorded yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">Median</p>
                <p className="text-[20px] font-semibold text-foreground leading-none tabular-nums">
                  {formatDuration(readLatency.medianSeconds)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">90th percentile</p>
                <p className="text-[20px] font-semibold text-foreground leading-none tabular-nums">
                  {formatDuration(readLatency.p90Seconds)}
                </p>
              </div>
            </div>
            <div className="space-y-1.5 pt-1">
              {readLatency.buckets.map((b) => (
                <div key={b.key} className="flex items-center gap-2">
                  <span className="text-[10.5px] text-muted-foreground/70 w-[72px] shrink-0">{b.label}</span>
                  <div className="flex-1 h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(b.count / maxBucket) * 100}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="h-full rounded-full bg-indigo-400"
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-foreground/80 tabular-nums w-6 text-right">{b.count}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/50">Based on {readLatency.sampleSize.toLocaleString()} read {readLatency.sampleSize === 1 ? 'message' : 'messages'}.</p>
          </>
        )}
      </div>
    </div>
  );
}
