"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function BillingPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/stats").then(res => res.json()),
      fetch("/api/dashboard/billing").then(res => res.json())
    ]).then(([statsRes, billingRes]) => {
      setTenant({
        plan_type: billingRes.data?.plan || "starter",
        plan_status: billingRes.data?.status || "active",
        message_limit: statsRes.data?.messageLimit || 1000,
        messages_used: statsRes.data?.messagesThisMonth || 0,
        invoices: billingRes.data?.invoices || []
      });
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
            { icon: "💬", label: "Conversations", href: "/dashboard/conversations" },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📈", label: "Analytics", href: "/dashboard/analytics" },
            { icon: "💳", label: "Billing", href: "/dashboard/billing", active: true },
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
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>💳 Billing & Usage</h1>
        <div className="glass-card" style={{ padding: "2rem", maxWidth: "800px" }}>
          {loading ? (
             <p>Loading billing info...</p>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Current Plan: <span style={{ textTransform: "capitalize", color: "var(--primary)" }}>{tenant?.plan_type}</span></h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Status: <span style={{ color: "#00B894", fontWeight: 600 }}>{tenant?.plan_status}</span></p>
                </div>
                <button className="btn btn-primary" style={{ padding: "0.75rem 1.5rem", borderRadius: "8px", fontWeight: 600 }}>Upgrade Plan</button>
              </div>

              <div style={{ marginBottom: "2rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Monthly Usage</h3>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>AI Messages</span>
                  <span style={{ fontWeight: 600 }}>{tenant?.messages_used} / {tenant?.message_limit}</span>
                </div>
                <div style={{ width: "100%", height: "8px", background: "var(--bg-tertiary)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (tenant?.messages_used / tenant?.message_limit) * 100)}%`, height: "100%", background: "var(--primary)", transition: "width 0.5s" }} />
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Invoice History</h3>
                <div style={{ border: "1px solid var(--border)", borderRadius: "8px" }}>
                  {tenant?.invoices && tenant.invoices.length > 0 ? (
                    tenant.invoices.map((inv: any) => (
                      <div key={inv.id} style={{ padding: "1rem", display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{tenant.plan_type} Plan</div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{new Date(inv.date).toLocaleDateString()}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                          <span style={{ fontWeight: 700 }}>₹{inv.amount}</span>
                          <span style={{ padding: "0.25rem 0.5rem", background: "rgba(0,184,148,0.1)", color: "#00B894", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 600, textTransform: "capitalize" }}>{inv.status}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      No invoices found.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
