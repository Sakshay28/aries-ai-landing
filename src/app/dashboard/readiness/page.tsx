"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw, Rocket, ShieldCheck, Zap, CreditCard, GitBranch, Activity } from "lucide-react";
import type { ReadinessReport } from "@/lib/readiness/score";

const CATEGORY_META: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  security:   { label: "Security",   Icon: ShieldCheck, color: "#3B82F6" },
  whatsapp:   { label: "WhatsApp",   Icon: Zap,         color: "#22C55E" },
  billing:    { label: "Billing",    Icon: CreditCard,  color: "#A855F7" },
  flows:      { label: "Flows",      Icon: GitBranch,   color: "#F59E0B" },
  monitoring: { label: "Monitoring", Icon: Activity,    color: "#EC4899" },
};

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 36; const circ = 2 * Math.PI * r;
  const offset = circ - (score / 10) * circ;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      <text x="44" y="49" textAnchor="middle" fill="white" fontSize="17" fontWeight="700">{score}/10</text>
    </svg>
  );
}

export default function ReadinessPage() {
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/dashboard/readiness");
      const json = await res.json();
      if (json.success) setReport(json.data);
      else setError(json.error || "Failed to load");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const goColor = report?.recommendation === "GO" ? "#22C55E" : "#EF4444";

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: "#060910", color: "white" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <Rocket className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold">Go-Live Readiness</h1>
            <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>Production launch checklist</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-medium" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && !report && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl text-[13px]" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {report && (
        <>
          {/* Overall Score Banner */}
          <div className="rounded-2xl p-6 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${goColor}10 0%, rgba(255,255,255,0.02) 100%)`, border: `1px solid ${goColor}25` }}>
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-[28px] font-black" style={{ background: `${goColor}15`, border: `2px solid ${goColor}40`, color: goColor }}>
                {report.overallScore}%
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[22px] font-black" style={{ color: goColor }}>{report.recommendation}</span>
                  {report.recommendation === "GO"
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    : <XCircle className="w-5 h-5 text-red-400" />}
                </div>
                <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {report.recommendation === "GO"
                    ? "All critical checks pass. Safe to go live."
                    : `${report.criticalFailed.length} critical issue${report.criticalFailed.length > 1 ? "s" : ""} must be resolved before launch.`}
                </p>
                {report.criticalFailed.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {report.criticalFailed.map(f => (
                      <span key={f} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>{f}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Category Scores */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const score = report.scores[key] ?? 0;
              return (
                <div key={key} className="rounded-2xl p-4 flex flex-col items-center gap-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <ScoreRing score={score} color={meta.color} />
                  <div className="flex items-center gap-1.5">
                    <meta.Icon className="w-3 h-3" style={{ color: meta.color }} />
                    <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>{meta.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Checklist */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="px-5 py-3" style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-[12px] font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Checklist</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {report.checks.map((check) => {
                const catMeta = CATEGORY_META[check.category];
                return (
                  <div key={check.id} className="flex items-start gap-4 px-5 py-3.5">
                    <div className="mt-0.5 flex-shrink-0">
                      {check.passed
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        : check.severity === "critical"
                          ? <XCircle className="w-4 h-4 text-red-400" />
                          : <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium" style={{ color: check.passed ? "rgba(255,255,255,0.85)" : check.severity === "critical" ? "#f87171" : "#fbbf24" }}>
                          {check.label}
                        </span>
                        {check.severity === "critical" && !check.passed && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>CRITICAL</span>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{check.description}</p>
                    </div>
                    <div className="flex-shrink-0">
                      {catMeta && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: `${catMeta.color}12`, color: catMeta.color, border: `1px solid ${catMeta.color}25` }}>
                          {catMeta.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
