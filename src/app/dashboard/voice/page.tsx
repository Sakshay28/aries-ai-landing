"use client";

import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════
// 🎙️ AI Voice — outbound call trigger + history + live calls
// ═══════════════════════════════════════

interface CallLog {
  id: string;
  phone_number: string;
  caller_name?: string;
  duration_seconds: number;
  summary?: string;
  transcript?: string;
  was_booked?: boolean;
  sentiment?: string;
  created_at: string;
}

interface ActiveCall {
  room_id: string;
  phone: string;
  caller_name?: string;
  status: string;
  started_at: string;
}

const G = "#25D366";

function fmtDuration(sec: number) {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function VoicePage() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [active, setActive] = useState<ActiveCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [callerName, setCallerName] = useState("");
  const [dialing, setDialing] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [selected, setSelected] = useState<CallLog | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [logsRes, activeRes] = await Promise.all([
        fetch("/api/calls?limit=50"),
        fetch("/api/calls/active"),
      ]);
      if (logsRes.ok) {
        const data = await logsRes.json();
        setCalls(data.calls || []);
      }
      if (activeRes.ok) {
        const data = await activeRes.json();
        setActive(data.active_calls || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void (async () => { await fetchAll(); })();
    // Live calls poll every 5s; logs refresh every 30s.
    const liveInterval = setInterval(() => { void (async () => { await fetchAll(); })(); }, 5000);
    return () => clearInterval(liveInterval);
  }, [fetchAll]);

  async function handleCall(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!phone.trim().startsWith("+")) {
      setMsg({ type: "err", text: "Phone number must start with country code (e.g. +91...)." });
      return;
    }
    setDialing(true);
    try {
      const res = await fetch("/api/calls/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), caller_name: callerName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: data.error || "Failed to dispatch call." });
      } else {
        setMsg({ type: "ok", text: `📞 Call dispatched to ${phone}. The agent will dial momentarily.` });
        setPhone("");
        setCallerName("");
        setTimeout(fetchAll, 1500);
      }
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Network error" });
    } finally {
      setDialing(false);
    }
  }

  const totalCalls = calls.length;
  const bookings = calls.filter(c => c.was_booked).length;
  const avgDuration = calls.length
    ? Math.round(calls.reduce((s, c) => s + (c.duration_seconds || 0), 0) / calls.length)
    : 0;

  return (
    <div style={{ padding: "32px 40px", fontFamily: "'Inter', sans-serif", maxWidth: 1200, margin: "0 auto" }}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "#111" }}>AI Voice</h1>
        <p style={{ fontSize: 14, color: "#666", marginTop: 4, marginBottom: 0 }}>
          Trigger outbound AI phone calls and review your tenant&apos;s call history. Live transcripts stream into Supabase.
        </p>
      </div>

      {/* ── Stat tiles ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        <StatTile label="Total calls" value={totalCalls} />
        <StatTile label="Bookings made" value={bookings} accent={G} />
        <StatTile label="Avg duration" value={fmtDuration(avgDuration)} />
        <StatTile label="Active now" value={active.length} accent={active.length > 0 ? "#f59e0b" : undefined} />
      </div>

      {/* ── Active calls strip (only when something is live) ───────── */}
      {active.length > 0 && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#9a3412", marginBottom: 8 }}>🔴 Live calls in progress</div>
          {active.map(a => (
            <div key={a.room_id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14, color: "#7c2d12" }}>
              <span><strong>{a.caller_name || a.phone}</strong> — {a.status}</span>
              <span style={{ color: "#9a3412", fontSize: 12 }}>started {fmtDate(a.started_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Outbound call trigger ─────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: 24, marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 16, color: "#111" }}>
          📞 Place an outbound call
        </h2>
        <form onSubmit={handleCall} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Phone number" required>
            <input
              type="tel"
              placeholder="+919876543210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
              style={inputStyle}
            />
          </Field>
          <Field label="Caller name (optional)">
            <input
              type="text"
              placeholder="Ravi Sharma"
              value={callerName}
              onChange={e => setCallerName(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <button
            type="submit"
            disabled={dialing}
            style={{
              background: dialing ? "#aaa" : G,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "11px 22px",
              fontSize: 14,
              fontWeight: 700,
              cursor: dialing ? "not-allowed" : "pointer",
              minWidth: 140,
            }}
          >
            {dialing ? "Dialing..." : "Start call →"}
          </button>
        </form>
        {msg && (
          <div style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            background: msg.type === "ok" ? "#ecfdf5" : "#fef2f2",
            color: msg.type === "ok" ? "#065f46" : "#991b1b",
            border: `1px solid ${msg.type === "ok" ? "#a7f3d0" : "#fecaca"}`,
          }}>
            {msg.text}
          </div>
        )}
        <p style={{ fontSize: 12, color: "#777", marginTop: 12, marginBottom: 0 }}>
          Voice calling requires the <strong>Pro</strong> or <strong>Ultra Premium</strong> plan and a configured voice-agent server.
          Rate limit: 30 calls / minute per tenant.
        </p>
      </div>

      {/* ── Call history table ────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#111" }}>Call history</h2>
          <span style={{ fontSize: 12, color: "#888" }}>Latest {calls.length} calls</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999" }}>Loading...</div>
        ) : calls.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999" }}>
            No calls yet. Trigger your first one above.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fafafa", color: "#555", textAlign: "left" }}>
                  <Th>When</Th>
                  <Th>Phone</Th>
                  <Th>Caller</Th>
                  <Th>Duration</Th>
                  <Th>Outcome</Th>
                  <Th>Summary</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {calls.map(c => (
                  <tr key={c.id} style={{ borderTop: "1px solid #f3f3f3" }}>
                    <Td>{fmtDate(c.created_at)}</Td>
                    <Td><code style={{ fontSize: 12 }}>{c.phone_number}</code></Td>
                    <Td>{c.caller_name || "—"}</Td>
                    <Td>{fmtDuration(c.duration_seconds)}</Td>
                    <Td>
                      {c.was_booked
                        ? <span style={{ color: "#065f46", fontWeight: 600 }}>✓ Booked</span>
                        : <span style={{ color: "#888" }}>No booking</span>}
                    </Td>
                    <Td style={{ maxWidth: 280, color: "#444" }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.summary || "—"}
                      </div>
                    </Td>
                    <Td>
                      <button
                        onClick={() => setSelected(c)}
                        style={{ background: "transparent", border: "1px solid #ddd", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#555", cursor: "pointer" }}
                      >
                        View
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Transcript drawer ─────────────────────────────────────── */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "flex-end", zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: "min(560px, 100vw)", height: "100%", background: "#fff", padding: 24, overflowY: "auto", boxShadow: "-4px 0 12px rgba(0,0,0,0.1)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Call details</h3>
              <button onClick={() => setSelected(null)} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#666" }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.7, marginBottom: 16 }}>
              <div><strong>Phone:</strong> {selected.phone_number}</div>
              <div><strong>Caller:</strong> {selected.caller_name || "Unknown"}</div>
              <div><strong>When:</strong> {fmtDate(selected.created_at)}</div>
              <div><strong>Duration:</strong> {fmtDuration(selected.duration_seconds)}</div>
              <div><strong>Outcome:</strong> {selected.was_booked ? "Booking confirmed" : "No booking"}</div>
              {selected.sentiment && <div><strong>Sentiment:</strong> {selected.sentiment}</div>}
            </div>
            {selected.summary && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6 }}>Summary</div>
                <div style={{ fontSize: 13, color: "#444", background: "#fafafa", padding: 12, borderRadius: 8, marginBottom: 16, lineHeight: 1.6 }}>
                  {selected.summary}
                </div>
              </>
            )}
            {selected.transcript && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6 }}>Transcript</div>
                <pre style={{ fontSize: 12, color: "#333", background: "#fafafa", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", lineHeight: 1.6 }}>
                  {selected.transcript}
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  border: "1px solid #ddd", borderRadius: 8, padding: "10px 12px", fontSize: 14, minWidth: 220, outline: "none",
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: "#555", fontWeight: 600, gap: 6 }}>
      {label}{required && <span style={{ color: "#dc2626" }}> *</span>}
      {children}
    </label>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: 18 }}>
      <div style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent || "#111", marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{children}</th>;
}
function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "12px 16px", verticalAlign: "middle", ...style }}>{children}</td>;
}
