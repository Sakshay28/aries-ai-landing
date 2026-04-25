"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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
        body: JSON.stringify({
          template_name: templateName,
          filter_status: filterStatus.length > 0 ? filterStatus : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || "Broadcast failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setSending(false);
    }
  }

  const statusOptions = ["new", "hot", "warm", "cold", "converted"];

  function toggleStatus(s: string) {
    setFilterStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  const selectedCount = filterStatus.length > 0 && stats
    ? filterStatus.reduce((sum, s) => sum + (stats.byStatus[s] || 0), 0)
    : stats?.total || 0;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <aside style={{ width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <img src="/logo.png" alt="Aries AI" style={{ height: "36px" }} />
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast", active: true },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 50 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>📢 Broadcast</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Send template messages to your leads at scale.</p>
        </header>

        <div style={{ padding: "2rem", maxWidth: "700px" }}>
          {/* Audience Stats */}
          {stats && (
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>📊 Your Audience</h2>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ padding: "0.75rem 1.25rem", background: "rgba(108, 92, 231, 0.1)", borderRadius: "8px" }}>
                  <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--primary)" }}>{stats.total}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "0.5rem" }}>Total leads with phone</span>
                </div>
                {Object.entries(stats.byStatus).map(([status, count]) => (
                  <div key={status} style={{ padding: "0.5rem 0.75rem", background: "var(--bg-tertiary)", borderRadius: "6px" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{count}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginLeft: "0.4rem", textTransform: "capitalize" }}>{status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Broadcast Form */}
          <div className="glass-card" style={{ padding: "2rem" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>✉️ New Broadcast</h2>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem", fontWeight: 600 }}>
                Template Name *
              </label>
              <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., follow_up_reminder, special_offer"
                style={{ width: "100%", padding: "0.75rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "0.9rem" }}
              />
              <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: "0.25rem" }}>
                Must be an approved template in your Meta Business Manager.
              </p>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.75rem", fontWeight: 600 }}>
                Filter by Lead Status (optional)
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {statusOptions.map((s) => (
                  <button key={s} onClick={() => toggleStatus(s)} style={{
                    padding: "0.4rem 1rem", border: filterStatus.includes(s) ? "2px solid var(--primary)" : "1px solid var(--border)",
                    borderRadius: "20px", background: filterStatus.includes(s) ? "rgba(108, 92, 231, 0.15)" : "transparent",
                    color: filterStatus.includes(s) ? "var(--primary)" : "var(--text-secondary)",
                    cursor: "pointer", fontSize: "0.8rem", textTransform: "capitalize", fontWeight: filterStatus.includes(s) ? 600 : 400,
                  }}>{s}</button>
                ))}
              </div>
            </div>

            <div style={{ padding: "1rem", background: "var(--bg-tertiary)", borderRadius: "8px", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Recipients:</span>
              <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--primary)" }}>{selectedCount} leads</span>
            </div>

            {error && (
              <div style={{ padding: "0.75rem", background: "rgba(225, 112, 85, 0.1)", borderRadius: "8px", marginBottom: "1rem", color: "#E17055", fontSize: "0.85rem" }}>
                ❌ {error}
              </div>
            )}

            {result && (
              <div style={{ padding: "1rem", background: "rgba(0, 184, 148, 0.1)", borderRadius: "8px", marginBottom: "1rem", border: "1px solid rgba(0, 184, 148, 0.3)" }}>
                <p style={{ color: "#00B894", fontWeight: 700, marginBottom: "0.5rem" }}>✅ Broadcast Complete</p>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Sent: {result.sent} · Failed: {result.failed} · Total: {result.total}
                </p>
              </div>
            )}

            <button onClick={handleSend} disabled={sending || !templateName.trim() || selectedCount === 0} style={{
              width: "100%", padding: "0.85rem", background: sending ? "var(--bg-tertiary)" : "var(--gradient-primary)",
              border: "none", borderRadius: "10px", color: "white", fontWeight: 700, fontSize: "1rem",
              cursor: sending ? "wait" : "pointer", opacity: !templateName.trim() || selectedCount === 0 ? 0.5 : 1,
            }}>
              {sending ? "📡 Sending..." : `📢 Send to ${selectedCount} leads`}
            </button>
          </div>

          {/* Important Notice */}
          <div style={{ marginTop: "1.5rem", padding: "1rem", background: "rgba(253, 203, 110, 0.1)", borderRadius: "8px", border: "1px solid rgba(253, 203, 110, 0.3)" }}>
            <p style={{ color: "#FDCB6E", fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem" }}>⚠️ Important</p>
            <ul style={{ color: "var(--text-muted)", fontSize: "0.8rem", paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <li>Templates must be pre-approved in Meta Business Manager</li>
              <li>Rate limited to 5 broadcasts per hour</li>
              <li>Messages sent outside 24h window require template messages</li>
              <li>Broadcasts cannot be undone once sent</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
