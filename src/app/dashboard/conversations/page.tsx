"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/conversations?limit=100")
      .then(res => res.json())
      .then(data => {
        if (data.success) setConversations(data.data || []);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{ width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <img src="/logo.png" alt="Aries AI" style={{ height: "36px" }} />
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "👥", label: "Leads", href: "/dashboard/leads" },
            { icon: "💬", label: "Conversations", href: "/dashboard/conversations", active: true },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📈", label: "Analytics", href: "/dashboard/analytics" },
            { icon: "💳", label: "Billing", href: "/dashboard/billing" },
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

      <main style={{ flex: 1, marginLeft: "260px", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>💬 Live Conversations</h1>
        <div className="glass-card" style={{ padding: "1.5rem" }}>
          {loading ? (
             <p>Loading conversations...</p>
          ) : conversations.length === 0 ? (
             <p style={{ color: "var(--text-muted)" }}>No active conversations.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["User", "Status", "Step", "Escalated", "Last Message"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conversations.map((conv) => (
                  <tr key={conv.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 600, fontSize: "0.9rem" }}>{conv.sender_name || conv.sender_id}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <span style={{ padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: conv.is_active ? "rgba(0, 184, 148, 0.1)" : "rgba(99, 110, 114, 0.1)", color: conv.is_active ? "#00B894" : "#636E72" }}>{conv.is_active ? "Active" : "Closed"}</span>
                      {conv.bot_paused && <span style={{ marginLeft: '0.5rem', padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: "rgba(253, 203, 110, 0.1)", color: "#FDCB6E" }}>Paused</span>}
                    </td>
                    <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{conv.current_step}</td>
                    <td style={{ padding: "0.75rem" }}>
                      {conv.escalated && <span style={{ padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: "rgba(225, 112, 85, 0.1)", color: "#E17055" }}>Escalated</span>}
                    </td>
                    <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{new Date(conv.last_message_at).toLocaleString()}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <button 
                        onClick={async () => {
                          await fetch(`/api/dashboard/conversations/${conv.id}/pause`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bot_paused: !conv.bot_paused }) });
                          setConversations(conversations.map(c => c.id === conv.id ? { ...c, bot_paused: !conv.bot_paused } : c));
                        }}
                        style={{ padding: "0.4rem 0.8rem", borderRadius: "6px", border: "1px solid var(--border)", background: conv.bot_paused ? "#00B894" : "var(--bg-tertiary)", color: conv.bot_paused ? "white" : "var(--text-secondary)", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}
                      >
                        {conv.bot_paused ? "Resume Bot" : "Take Over"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
