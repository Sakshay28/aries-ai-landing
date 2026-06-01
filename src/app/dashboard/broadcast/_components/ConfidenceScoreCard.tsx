import React from 'react';
import { ConfidenceScoreService } from '@/lib/broadcast/services/confidence-score.service';
import { CampaignFormValues } from '@/app/dashboard/broadcast/validators/broadcast.validator';
import { CheckCircle2, AlertTriangle, ShieldCheck, Gauge } from 'lucide-react';

interface Props {
  campaign: Partial<CampaignFormValues>;
  detectedVarIndices: string[];
  netRecipients: number;
}

export function ConfidenceScoreCard({ campaign, detectedVarIndices, netRecipients }: Props) {
  // Execute dry scoring
  const breakdown = ConfidenceScoreService.calculate(
    campaign,
    detectedVarIndices,
    netRecipients,
    0, // optedOutCount
    0  // invalidCount
  );

  const getBandStyles = (band: string) => {
    switch (band) {
      case 'High Confidence':
        return { 
          badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/15', 
          text: 'text-emerald-600',
          gauge: 'stroke-emerald-500'
        };
      case 'Moderate Confidence':
        return { 
          badge: 'bg-amber-500/10 text-amber-600 border-amber-500/15', 
          text: 'text-amber-600',
          gauge: 'stroke-amber-500'
        };
      default:
        return { 
          badge: 'bg-red-500/10 text-red-600 border-red-500/15', 
          text: 'text-red-600',
          gauge: 'stroke-red-500'
        };
    }
  };

  const styles = getBandStyles(breakdown.band);

  return (
    <div className="border border-border/60 rounded-xl p-4 bg-background/50 space-y-4 text-left">
      {/* Score Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/8 border border-indigo-500/10 flex items-center justify-center">
            <Gauge className="w-4.5 h-4.5 text-indigo-500" />
          </div>
          <div className="text-left">
            <span className="text-[12.5px] font-bold text-foreground block">Campaign Dispatch Confidence</span>
            <span className={`text-[10px] font-bold border rounded px-1.5 py-0.5 mt-0.5 inline-block ${styles.badge}`}>
              {breakdown.band}
            </span>
          </div>
        </div>

        {/* Circular Gauge */}
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="stroke-secondary"
              strokeWidth="3.5"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className={`transition-all duration-700 ease-out ${styles.gauge}`}
              strokeWidth="3.5"
              strokeDasharray={`${breakdown.score}, 100`}
              strokeLinecap="round"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <span className="absolute text-[12.5px] font-bold tabular-nums text-foreground">{breakdown.score}%</span>
        </div>
      </div>

      {/* Intelligence Subtext */}
      <p className="text-[11.5px] text-muted-foreground leading-normal border-l border-border/70 pl-3">
        {breakdown.label}. This campaign holds a <strong>{breakdown.score}% reliability index</strong> before outbound execution.
      </p>

      {/* Factor Checklist */}
      <div className="space-y-2 pt-1 border-t border-border/20">
        {breakdown.checklist.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-[11.5px] py-0.5">
            <div className="flex items-center gap-2 text-foreground/80">
              {item.passed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              )}
              <span className="font-medium text-foreground/70">{item.label}</span>
            </div>
            <span className={`font-semibold text-[10.5px] ${item.passed ? 'text-emerald-600' : 'text-amber-500'}`}>
              {item.impact}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
