"use client";

import { useEffect, useState, useCallback } from "react";
import { ClipboardList, RefreshCw, Loader2, User, Calendar } from "lucide-react";

interface AuditEntry {
  id: string;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_value: string | null;
  new_value: string | null;
  ip_address: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  flow_published:       "#22C55E",
  flow_restored:        "#A855F7",
  flow_deleted:         "#EF4444",
  greeting_updated:     "#3B82F6",
  api_token_updated:    "#F59E0B",
  billing_plan_changed: "#EC4899",
  team_member_invited:  "#06B6D4",
  team_member_removed:  "#EF4444",
  bot_paused:           "#F59E0B",
  bot_resumed:          "#22C55E",
  broadcast_sent:       "#A855F7",
  settings_updated:     "#9CA3AF",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/settings/audit-log");
      const json = await res.json();
      if (json.success) setEntries(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen p-6 space-y-5" style={{ background: "#060910", color: "white" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <ClipboardList className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold">Audit Log</h1>
            <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>All configuration changes, sorted by latest</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px]" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading && entries.length === 0 && (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-7 h-7 animate-spin text-blue-400" /></div>
      )}
      {!loading && entries.length === 0 && (
        <div className="text-center py-16 text-[13px]" style={{ color: "rgba(255,255,255,0.3)" }}>No audit events yet</div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        {entries.map((entry, i) => {
          const color = ACTION_COLORS[entry.action] ?? "#9CA3AF";
          const isExp = expanded === entry.id;
          return (
            <div key={entry.id} className={i > 0 ? "border-t" : ""} style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              <button onClick={() => setExpanded(isExp ? null : entry.id)} className="w-full flex items-start gap-4 px-5 py-3.5 text-left hover:bg-white/[0.02] transition-colors">
                <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium" style={{ color }}>{entry.action.replace(/_/g, " ")}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}>{entry.entity}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {entry.actor_email && (
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                        <User className="w-2.5 h-2.5" />{entry.actor_email}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                      <Calendar className="w-2.5 h-2.5" />{new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              </button>
              {isExp && (entry.old_value || entry.new_value) && (
                <div className="px-5 pb-4 grid grid-cols-2 gap-3">
                  {entry.old_value && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "rgba(255,255,255,0.25)" }}>Before</p>
                      <pre className="text-[10px] p-2 rounded-lg overflow-x-auto" style={{ background: "rgba(239,68,68,0.06)", color: "#f87171", maxHeight: 120 }}>{entry.old_value}</pre>
                    </div>
                  )}
                  {entry.new_value && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "rgba(255,255,255,0.25)" }}>After</p>
                      <pre className="text-[10px] p-2 rounded-lg overflow-x-auto" style={{ background: "rgba(34,197,94,0.06)", color: "#4ade80", maxHeight: 120 }}>{entry.new_value}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
