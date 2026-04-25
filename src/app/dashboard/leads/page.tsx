"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/leads?limit=100")
      .then(res => res.json())
      .then(data => {
        if (data.success) setLeads(data.data || []);
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
            { icon: "👥", label: "Leads", href: "/dashboard/leads", active: true },
            { icon: "💬", label: "Conversations", href: "/dashboard/conversations" },
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
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>👥 All Leads</h1>
        <div className="glass-card" style={{ padding: "1.5rem" }}>
          {loading ? (
             <p>Loading leads...</p>
          ) : leads.length === 0 ? (
             <p style={{ color: "var(--text-muted)" }}>No leads captured yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Name", "Phone", "Status", "Score", "Channel"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 600, fontSize: "0.9rem" }}>{lead.name || "Unknown"}</td>
                    <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{lead.phone}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <span style={{ padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: "rgba(108, 92, 231, 0.1)", color: "#6C5CE7" }}>{lead.lead_status}</span>
                    </td>
                    <td style={{ padding: "0.75rem", fontWeight: 700 }}>{lead.lead_score}</td>
                    <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{lead.channel}</td>
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
