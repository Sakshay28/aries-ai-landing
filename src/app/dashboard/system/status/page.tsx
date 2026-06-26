"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Database, Zap, Cpu, MailWarning, Radio, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

interface ServiceStatus { status: "up" | "down" | "degraded"; latencyMs?: number; detail?: string; }
interface HealthReport {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  services: {
    db: ServiceStatus;
    redis: ServiceStatus;
    worker: ServiceStatus;
    dlq: ServiceStatus;
    broadcastQueue?: ServiceStatus;
  };
}

const SERVICE_META: Record<string, { label: string; Icon: React.ElementType }> = {
  db:             { label: "Database",         Icon: Database },
  redis:          { label: "Redis / Cache",    Icon: Zap },
  worker:         { label: "Broadcast Worker",  Icon: Cpu },
  dlq:            { label: "Dead Letter Queue", Icon: MailWarning },
  broadcastQueue: { label: "Broadcast Queue",   Icon: Radio },
};

function StatusDot({ status }: { status: string }) {
  if (status === "up")       return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === "down")     return <XCircle className="w-4 h-4 text-red-400" />;
  return <AlertTriangle className="w-4 h-4 text-amber-400" />;
}

const STATUS_COLORS = { healthy: "#22C55E", degraded: "#F59E0B", unhealthy: "#EF4444" };

export default function SystemStatusPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      const json = await res.json();
      setReport(json);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, [load]);

  const overallColor = report ? STATUS_COLORS[report.status] : "#9CA3AF";

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: "#060910", color: "white" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: overallColor, boxShadow: `0 0 8px ${overallColor}` }} />
          <div>
            <h1 className="text-[18px] font-bold">System Status</h1>
            {lastRefresh && <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Last checked: {lastRefresh.toLocaleTimeString()}</p>}
          </div>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px]" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading && !report && (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-7 h-7 animate-spin" style={{ color: overallColor }} /></div>
      )}

      {report && (
        <>
          {/* Overall banner */}
          <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: `${overallColor}0D`, border: `1px solid ${overallColor}25` }}>
            <div className="text-[28px] font-black" style={{ color: overallColor }}>
              {report.status === "healthy" ? "ALL SYSTEMS OPERATIONAL" : report.status === "degraded" ? "PARTIAL DEGRADATION" : "SYSTEM INCIDENT"}
            </div>
          </div>

          {/* Service cards */}
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(SERVICE_META).map(([key, meta]) => {
              const svc = report.services[key as keyof typeof report.services];
              if (!svc) return null;
              return (
                <div key={key} className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <meta.Icon className="w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold">{meta.label}</span>
                      <StatusDot status={svc.status} />
                    </div>
                    {svc.latencyMs !== undefined && (
                      <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{svc.latencyMs}ms</p>
                    )}
                    {svc.detail && (
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: svc.status === "down" ? "#f87171" : svc.status === "degraded" ? "#fbbf24" : "rgba(255,255,255,0.3)" }}>
                        {svc.detail}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timestamp */}
          <p className="text-center text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>
            Last server check: {new Date(report.timestamp).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
