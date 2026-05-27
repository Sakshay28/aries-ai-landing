"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, RefreshCw, RotateCcw, EyeOff, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface DLQEntry {
  id: string;
  tenant_id: string;
  job_type: string;
  flow_id?: string;
  conversation_id?: string;
  payload: string;
  error_message: string;
  retry_count: number;
  failed_at: string;
  status: "pending" | "retried" | "ignored";
}

const JOB_COLORS: Record<string, string> = {
  followup: "#A855F7",
  broadcast: "#F59E0B",
  webhook_sync: "#3B82F6",
  crm_push: "#22C55E",
  email: "#EC4899",
  ai_job: "#06B6D4",
  payment: "#EF4444",
};

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    pending: { bg: "rgba(239,68,68,0.12)", color: "#f87171" },
    retried: { bg: "rgba(34,197,94,0.12)", color: "#4ade80" },
    ignored: { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ background: c.bg, color: c.color }}>
      {status}
    </span>
  );
}

export default function DeadLetterPage() {
  const [entries, setEntries] = useState<DLQEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/dashboard/system/dlq");
    const json = await res.json();
    if (json.success) setEntries(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: "retry" | "ignore") {
    setActing(id);
    await fetch("/api/dashboard/system/dlq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    await load();
    setActing(null);
  }

  const pending = entries.filter(e => e.status === "pending");

  return (
    <div className="min-h-screen p-6 space-y-5" style={{ background: "#060910", color: "white" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold">Dead Letter Queue</h1>
            <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>{pending.length} pending failures</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px]" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading && entries.length === 0 && (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-7 h-7 animate-spin text-red-400" /></div>
      )}

      {!loading && entries.length === 0 && (
        <div className="text-center py-16 text-[13px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          No failed jobs 🎉
        </div>
      )}

      <div className="space-y-2">
        {entries.map(entry => {
          const jobColor = JOB_COLORS[entry.job_type] ?? "#9CA3AF";
          const isExp = expanded === entry.id;
          return (
            <div key={entry.id} className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-4 px-4 py-3.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: jobColor }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold" style={{ color: jobColor }}>{entry.job_type}</span>
                    <StatusBadge status={entry.status} />
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>retries: {entry.retry_count}</span>
                  </div>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{entry.error_message}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>{new Date(entry.failed_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {entry.status === "pending" && (
                    <>
                      <button onClick={() => act(entry.id, "retry")} disabled={acting === entry.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80" }}>
                        {acting === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Retry
                      </button>
                      <button onClick={() => act(entry.id, "ignore")} disabled={acting === entry.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                        <EyeOff className="w-3 h-3" /> Ignore
                      </button>
                    </>
                  )}
                  <button onClick={() => setExpanded(isExp ? null : entry.id)} className="p-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                    {isExp ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.3)" }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />}
                  </button>
                </div>
              </div>
              {isExp && (
                <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  <p className="text-[10px] font-semibold uppercase mb-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Payload</p>
                  <pre className="text-[10px] rounded-lg p-3 overflow-x-auto" style={{ background: "rgba(0,0,0,0.3)", color: "#86efac", maxHeight: 200 }}>
                    {entry.payload}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
