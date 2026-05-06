"use client";

import { useState } from "react";
import Link from "next/link";

const sidebarLinks = [
  { icon: "🏠", label: "Overview", href: "/admin" },
  { icon: "🏢", label: "All Clients", href: "/admin/clients" },
  { icon: "💰", label: "Revenue", href: "/admin/revenue" },
  { icon: "📊", label: "Analytics", href: "/admin/analytics" },
  { icon: "⚙️", label: "Platform Settings", href: "/admin/settings", active: true },
];

export default function AdminSettingsPage() {
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <aside style={{ width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", padding: "1.5rem 0", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Admin Panel</span>
          </Link>
        </div>
        <nav>{sidebarLinks.map(item => (
          <Link key={item.label} href={item.href} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem", color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none", background: item.active ? "rgba(108,92,231,0.1)" : "transparent", borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent", fontSize: "0.9rem", fontWeight: item.active ? 600 : 400 }}>
            <span>{item.icon}</span><span>{item.label}</span>
          </Link>
        ))}</nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 50 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>⚙️ Platform Settings</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Env-controlled configuration — edit in Vercel Dashboard</p>
        </header>

        <div style={{ padding: "2rem", maxWidth: "800px" }}>
          {toast && <div style={{ position: "fixed", bottom: "2rem", right: "2rem", background: "#6C5CE7", color: "white", padding: "0.75rem 1.5rem", borderRadius: "10px", fontWeight: 600, zIndex: 999, boxShadow: "0 4px 20px rgba(108,92,231,0.4)" }}>{toast}</div>}

          {/* Admin Access */}
          <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>🛡️ Admin Access</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
              Admin access is controlled by the <code style={{ background: "var(--bg-tertiary)", padding: "0.1rem 0.4rem", borderRadius: "4px", fontSize: "0.8rem" }}>PLATFORM_ADMIN_EMAIL</code> environment variable.
              Only users whose email matches AND have <code style={{ background: "var(--bg-tertiary)", padding: "0.1rem 0.4rem", borderRadius: "4px", fontSize: "0.8rem" }}>is_platform_admin = true</code> in the database can access this panel.
            </p>
            <div style={{ background: "var(--bg-tertiary)", borderRadius: "8px", padding: "1rem", border: "1px solid var(--border)" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>To grant admin access to your account, run this SQL in Supabase SQL Editor:</p>
              <pre style={{ color: "#00B894", fontSize: "0.85rem", margin: 0, overflowX: "auto" }}>{`UPDATE users\nSET is_platform_admin = true\nWHERE email = 'your-real-email@gmail.com';`}</pre>
              <button onClick={() => { navigator.clipboard.writeText(`UPDATE users\nSET is_platform_admin = true\nWHERE email = 'your-real-email@gmail.com';`); showToast("SQL copied!"); }} style={{ marginTop: "0.75rem", padding: "0.4rem 1rem", background: "rgba(0,184,148,0.15)", border: "1px solid #00B894", borderRadius: "6px", color: "#00B894", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>📋 Copy SQL</button>
            </div>
          </div>

          {/* Environment Variables Reference */}
          <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>🔑 Environment Variables Checklist</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>All env vars must be set in <strong>Vercel → Project → Settings → Environment Variables</strong>. <code>.env.local</code> is NOT read by Vercel.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {[
                { group: "Supabase", vars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] },
                { group: "AI", vars: ["GEMINI_API_KEY"] },
                { group: "Meta / WhatsApp", vars: ["META_APP_SECRET", "GLOBAL_WEBHOOK_VERIFY_TOKEN", "NEXT_PUBLIC_META_APP_ID", "NEXT_PUBLIC_META_CONFIG_ID"] },
                { group: "Payments", vars: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_PLAN_STARTER", "RAZORPAY_PLAN_GROWTH", "RAZORPAY_PLAN_PRO"] },
                { group: "Redis (Upstash)", vars: ["REDIS_URL"] },
                { group: "Email (Resend)", vars: ["RESEND_API_KEY", "RESEND_FROM_ARIES", "RESEND_FROM_LIBRA"] },
                { group: "Security", vars: ["ENCRYPTION_KEY", "JWT_SECRET", "CRON_SECRET", "PLATFORM_ADMIN_EMAIL"] },
                { group: "App", vars: ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_APP_NAME"] },
              ].map(g => (
                <div key={g.group} style={{ background: "var(--bg-tertiary)", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
                  <div style={{ padding: "0.6rem 1rem", background: "rgba(108,92,231,0.1)", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: "0.85rem", color: "var(--primary)" }}>{g.group}</div>
                  <div style={{ padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {g.vars.map(v => (
                      <div key={v} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <code style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{v}</code>
                        <button onClick={() => { navigator.clipboard.writeText(v); showToast(`Copied: ${v}`); }} style={{ padding: "0.2rem 0.6rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.7rem" }}>Copy</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Plan Prices Reference */}
          <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>💰 Razorpay Plan IDs to Create</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>Create these plans in Razorpay → Subscriptions → Plans, then add their IDs to env vars.</p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Plan Key", "Brand", "Price/mo", "Env Var"].map(h => <th key={h} style={{ textAlign: "left", padding: "0.6rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  { key: "aries_starter", brand: "Aries", price: "₹999", env: "RAZORPAY_PLAN_STARTER" },
                  { key: "aries_growth", brand: "Aries", price: "₹2,499", env: "RAZORPAY_PLAN_GROWTH" },
                  { key: "aries_pro", brand: "Aries", price: "₹6,999", env: "RAZORPAY_PLAN_PRO" },
                  { key: "libra_starter", brand: "Libra", price: "₹999", env: "RAZORPAY_PLAN_LIBRA_STARTER" },
                  { key: "libra_growth", brand: "Libra", price: "₹2,499", env: "RAZORPAY_PLAN_LIBRA_GROWTH" },
                  { key: "libra_pro", brand: "Libra", price: "₹6,999", env: "RAZORPAY_PLAN_LIBRA_PRO" },
                ].map(p => (
                  <tr key={p.key} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.6rem", fontFamily: "monospace", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{p.key}</td>
                    <td style={{ padding: "0.6rem", fontSize: "0.85rem" }}>{p.brand}</td>
                    <td style={{ padding: "0.6rem", fontWeight: 600, color: "#00B894", fontSize: "0.85rem" }}>{p.price}</td>
                    <td style={{ padding: "0.6rem" }}><code style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{p.env}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Links */}
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>🔗 Quick Links</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {[
                { label: "Vercel Dashboard", url: "https://vercel.com/dashboard", icon: "▲" },
                { label: "Supabase Dashboard", url: "https://supabase.com/dashboard", icon: "🔵" },
                { label: "Razorpay Dashboard", url: "https://dashboard.razorpay.com", icon: "💳" },
                { label: "Upstash Console", url: "https://console.upstash.com", icon: "⚡" },
                { label: "Resend Dashboard", url: "https://resend.com/dashboard", icon: "📧" },
                { label: "Meta Developers", url: "https://developers.facebook.com", icon: "🌐" },
              ].map(link => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", textDecoration: "none", color: "var(--text-primary)", fontSize: "0.85rem", transition: "border-color 0.2s" }}>
                  <span style={{ fontSize: "1.1rem" }}>{link.icon}</span><span>{link.label}</span><span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: "0.75rem" }}>↗</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
