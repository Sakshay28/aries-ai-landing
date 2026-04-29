"use client";

import { useState, useEffect, useCallback } from "react";

interface BroadcastStats {
  total: number;
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
}

export default function BroadcastPage() {
  const [stats, setStats] = useState<BroadcastStats | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/broadcast");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setStats(data.data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  async function handleSend() {
    if (!templateName.trim()) { setError("Template name is required."); return; }
    setSending(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_name: templateName, filter_status: filterStatus.length > 0 ? filterStatus : undefined }),
      });
      const data = await res.json();
      if (data.success) setResult(data.data);
      else setError(data.error || "Broadcast failed");
    } catch { setError("Network error"); }
    finally { setSending(false); }
  }

  const statusOptions = ["new", "hot", "warm", "cold", "converted"];
  function toggleStatus(s: string) { setFilterStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]); }

  const selectedCount = filterStatus.length > 0 && stats
    ? filterStatus.reduce((sum, s) => sum + (stats.byStatus[s] || 0), 0)
    : stats?.total || 0;

  const inputStyle = { width: "100%", padding: "12px 14px", background: "#fafbfc", border: "1px solid #e5e7eb", borderRadius: "10px", fontSize: "14px", color: "#111827", fontFamily: "inherit" as const, outline: "none" };

  return (
    <div style={{ maxWidth: "720px" }}>
      {/* Audience Stats */}
      {stats && (
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "24px", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "16px" }}>📊 Your Audience</h2>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ padding: "12px 20px", background: "#f0fdf4", borderRadius: "10px", border: "1px solid #dcfce7" }}>
              <span style={{ fontSize: "24px", fontWeight: 800, color: "#128C7E" }}>{stats.total}</span>
              <span style={{ color: "#6b7280", fontSize: "13px", marginLeft: "8px" }}>Total leads with phone</span>
            </div>
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <div key={status} style={{ padding: "8px 14px", background: "#fafbfc", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                <span style={{ fontWeight: 700, fontSize: "14px" }}>{count}</span>
                <span style={{ color: "#9ca3af", fontSize: "12px", marginLeft: "6px", textTransform: "capitalize" }}>{status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Broadcast Form */}
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "16px", padding: "28px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "24px" }}>✉️ New Broadcast</h2>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", color: "#374151", fontSize: "13px", marginBottom: "6px", fontWeight: 600 }}>Template Name *</label>
          <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g., follow_up_reminder, special_offer" style={inputStyle} />
          <p style={{ color: "#9ca3af", fontSize: "12px", marginTop: "4px" }}>Must be an approved template in your Meta Business Manager.</p>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", color: "#374151", fontSize: "13px", marginBottom: "10px", fontWeight: 600 }}>Filter by Lead Status (optional)</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {statusOptions.map((s) => (
              <button key={s} onClick={() => toggleStatus(s)} style={{
                padding: "8px 18px", border: filterStatus.includes(s) ? "2px solid #25D366" : "1px solid #e5e7eb",
                borderRadius: "100px", background: filterStatus.includes(s) ? "#f0fdf4" : "white",
                color: filterStatus.includes(s) ? "#128C7E" : "#6b7280", cursor: "pointer", fontSize: "13px",
                textTransform: "capitalize", fontWeight: filterStatus.includes(s) ? 700 : 500, fontFamily: "inherit",
              }}>{s}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: "14px 20px", background: "#fafbfc", borderRadius: "10px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e5e7eb" }}>
          <span style={{ color: "#6b7280", fontSize: "14px" }}>Recipients:</span>
          <span style={{ fontWeight: 800, fontSize: "18px", color: "#128C7E" }}>{selectedCount} leads</span>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", borderRadius: "10px", marginBottom: "16px", color: "#dc2626", fontSize: "13px", border: "1px solid #fca5a5" }}>❌ {error}</div>
        )}
        {result && (
          <div style={{ padding: "16px", background: "#f0fdf4", borderRadius: "10px", marginBottom: "16px", border: "1px solid #86efac" }}>
            <p style={{ color: "#16a34a", fontWeight: 700, marginBottom: "4px" }}>✅ Broadcast Complete</p>
            <p style={{ fontSize: "13px", color: "#6b7280" }}>Sent: {result.sent} · Failed: {result.failed} · Total: {result.total}</p>
          </div>
        )}

        <button onClick={handleSend} disabled={sending || !templateName.trim() || selectedCount === 0} style={{
          width: "100%", padding: "14px", background: sending ? "#e5e7eb" : "#25D366",
          border: "none", borderRadius: "12px", color: "white", fontWeight: 700, fontSize: "15px",
          cursor: sending ? "wait" : "pointer", opacity: !templateName.trim() || selectedCount === 0 ? 0.5 : 1,
          fontFamily: "inherit", boxShadow: "0 4px 14px rgba(37,211,102,0.25)", transition: "all 200ms",
        }}>
          {sending ? "📡 Sending..." : `📢 Send to ${selectedCount} leads`}
        </button>
      </div>

      {/* Important Notice */}
      <div style={{ marginTop: "20px", padding: "16px 20px", background: "#fffbeb", borderRadius: "12px", border: "1px solid #fcd34d" }}>
        <p style={{ color: "#92400e", fontWeight: 700, fontSize: "13px", marginBottom: "8px" }}>⚠️ Important</p>
        <ul style={{ color: "#6b7280", fontSize: "13px", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <li>Templates must be pre-approved in Meta Business Manager</li>
          <li>Rate limited to 5 broadcasts per hour</li>
          <li>Messages sent outside 24h window require template messages</li>
          <li>Broadcasts cannot be undone once sent</li>
        </ul>
      </div>
    </div>
  );
}
