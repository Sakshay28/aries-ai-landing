"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ClipboardList, RefreshCw, Loader2, User, Calendar, ShieldAlert } from "lucide-react";

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
  data_export_requested: "#0EA5E9",
  account_deletion_requested: "#EF4444",
  account_deletion_cancelled: "#22C55E",
  // Platform-admin (Aries AI support staff) actions — deliberately distinct
  // from the team's own colors above so they stand out at a glance.
  platform_admin_viewed_credentials: "#FB923C",
  platform_admin_edited_tenant:      "#FB923C",
  platform_admin_impersonated:       "#F43F5E",
  platform_admin_approved_signup:    "#FB923C",
};

// Human-readable labels for entries whose raw action name reads like an
// internal log line — these are written for the client reading their own
// account's history, not for an engineer reading a database column.
const READABLE_LABELS: Record<string, string> = {
  platform_admin_viewed_credentials: "Aries AI support viewed your account settings",
  platform_admin_edited_tenant:      "Aries AI support updated your account settings",
  platform_admin_impersonated:       "Aries AI support logged in to your account (support session)",
  platform_admin_approved_signup:    "Aries AI support approved your account",
  data_export_requested:             "Your data was exported",
  account_deletion_requested:        "Account deletion was requested",
  account_deletion_cancelled:        "Account deletion was cancelled",
};

const isPlatformAdminAction = (action: string) => action.startsWith("platform_admin_");

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
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <ClipboardList className="w-4 h-4" style={{ color: "#3B82F6" }} />
          </div>
          <div>
            <h1 className="text-[18px] font-bold" style={{ color: "var(--foreground)" }}>Audit Log</h1>
            <p className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
              Every configuration change, sorted by latest, including any time Aries AI support accessed this account
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-medium transition-opacity hover:opacity-80"
          style={{ background: "var(--secondary)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading && entries.length === 0 && (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-7 h-7 animate-spin" style={{ color: "#3B82F6" }} /></div>
      )}
      {!loading && entries.length === 0 && (
        <div className="text-center py-16 text-[13px] rounded-2xl border" style={{ color: "var(--muted-foreground)", borderColor: "var(--border)", background: "var(--card)" }}>
          No audit events yet
        </div>
      )}

      {entries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          {entries.map((entry, i) => {
            const color = ACTION_COLORS[entry.action] ?? "var(--muted-foreground)";
            const isExp = expanded === entry.id;
            const isSupportAccess = isPlatformAdminAction(entry.action);
            const label = READABLE_LABELS[entry.action] ?? entry.action.replace(/_/g, " ");
            return (
              <div
                key={entry.id}
                className={i > 0 ? "border-t" : ""}
                style={{ borderColor: "var(--border)", background: isSupportAccess ? "rgba(251,146,60,0.06)" : undefined }}
              >
                <button
                  onClick={() => setExpanded(isExp ? null : entry.id)}
                  className="w-full flex items-start gap-4 px-5 py-3.5 text-left transition-colors hover:opacity-90"
                >
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium capitalize" style={{ color: "var(--foreground)" }}>{label}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}>{entry.entity}</span>
                      {isSupportAccess && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(251,146,60,0.14)", color: "#EA580C" }}>
                          <ShieldAlert className="w-2.5 h-2.5" />Support access
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {entry.actor_email && (
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                          <User className="w-2.5 h-2.5" />{isSupportAccess ? "Aries AI Support" : entry.actor_email}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                        <Calendar className="w-2.5 h-2.5" />{new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </button>
                {isExp && (entry.old_value || entry.new_value) && (
                  <div className="px-5 pb-4 grid grid-cols-2 gap-3">
                    {entry.old_value && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--muted-foreground)" }}>Before</p>
                        <pre className="text-[10px] p-2 rounded-lg overflow-x-auto" style={{ background: "rgba(239,68,68,0.06)", color: "#DC2626", maxHeight: 120 }}>{entry.old_value}</pre>
                      </div>
                    )}
                    {entry.new_value && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--muted-foreground)" }}>After</p>
                        <pre className="text-[10px] p-2 rounded-lg overflow-x-auto" style={{ background: "rgba(34,197,94,0.06)", color: "#16A34A", maxHeight: 120 }}>{entry.new_value}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
