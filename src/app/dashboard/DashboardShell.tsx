"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ─────────────────────────────────────
// Clean SVG Icons — premium line style
// ─────────────────────────────────────
const Icon = {
  Dashboard: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  ),
  Chat: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  Contacts: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
      <path d="M19 8v6"/><path d="M22 11h-6"/>
    </svg>
  ),
  Broadcast: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  ),
  Templates: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  Analytics: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/>
    </svg>
  ),
  Settings: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  WhatsApp: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  ),
  Billing: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
};

const navItems = [
  { key: "dashboard",     Icon: Icon.Dashboard,  label: "Dashboard",   href: "/dashboard" },
  { key: "chat",          Icon: Icon.Chat,        label: "Live Chat",   href: "/dashboard/conversations" },
  { key: "contacts",      Icon: Icon.Contacts,    label: "Contacts",    href: "/dashboard/leads" },
  { key: "broadcast",     Icon: Icon.Broadcast,   label: "Campaigns",   href: "/dashboard/broadcast" },
  { key: "templates",     Icon: Icon.Templates,   label: "Templates",   href: "/dashboard/templates" },
  { key: "analytics",     Icon: Icon.Analytics,   label: "Analytics",   href: "/dashboard/analytics" },
  { key: "settings",      Icon: Icon.Settings,    label: "Bot Settings",href: "/dashboard/settings" },
  { key: "whatsapp",      Icon: Icon.WhatsApp,    label: "WhatsApp",    href: "/dashboard/whatsapp" },
  { key: "billing",       Icon: Icon.Billing,     label: "Billing",     href: "/dashboard/billing" },
];

interface DashboardShellProps {
  children: React.ReactNode;
  userEmail: string;
  isTokenExpired: boolean;
}

export function DashboardShell({ children, userEmail, isTokenExpired }: DashboardShellProps) {
  const pathname = usePathname();
  const initials = userEmail ? userEmail.charAt(0).toUpperCase() : "U";
  const userName = userEmail
    ? userEmail.split("@")[0].replace(/[._]/g, " ").split(" ")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    : "User";

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      background: "#f0f2f5",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>

      {/* ─────────────── SIDEBAR ─────────────── */}
      <aside style={{
        width: 88,
        background: "#0d3d30",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "fixed",
        top: 0, left: 0, bottom: 0,
        zIndex: 100,
        paddingBottom: 16,
      }}>
        {/* Logo */}
        <Link href="/" style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          width: "100%", height: 68,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          textDecoration: "none", flexShrink: 0,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "rgba(37,211,102,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <img src="/logo.png" alt="Aries AI" style={{ width: 24, height: 24, objectFit: "contain" }} />
          </div>
        </Link>

        {/* Nav */}
        <nav style={{ flex: 1, width: "100%", paddingTop: 8, overflowY: "auto" }}>
          {navItems.map((item) => {
            const isActive = item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  width: "100%",
                  padding: "10px 4px",
                  color: isActive ? "#25D366" : "rgba(255,255,255,0.5)",
                  background: isActive ? "rgba(37,211,102,0.12)" : "transparent",
                  borderRight: isActive ? "3px solid #25D366" : "3px solid transparent",
                  textDecoration: "none",
                  transition: "all 180ms ease",
                  cursor: "pointer",
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.85)";
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                  }
                }}
              >
                <item.Icon />
                <span style={{
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: "0.2px",
                  textAlign: "center",
                  lineHeight: 1.2,
                  maxWidth: 76,
                }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* User avatar */}
        <div
          title={userEmail}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "linear-gradient(135deg, #25D366, #128C7E)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 13, fontWeight: 700,
            cursor: "pointer", flexShrink: 0,
            border: "2px solid rgba(37,211,102,0.3)",
          }}
        >
          {initials}
        </div>
      </aside>

      {/* ─────────────── MAIN ─────────────── */}
      <div style={{ flex: 1, marginLeft: 88, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        {/* Top Status Bar */}
        <header style={{
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          {/* Row 1: business + WA status + plan */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 28px",
            borderBottom: "1px solid #f3f4f6",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Aries AI</span>
              <span style={{ color: "#d1d5db" }}>|</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <span style={{ color: "#6b7280" }}>WhatsApp API:</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontWeight: 700,
                  color: isTokenExpired ? "#ef4444" : "#16a34a",
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: isTokenExpired ? "#ef4444" : "#22c55e",
                    display: "inline-block",
                    boxShadow: isTokenExpired ? "none" : "0 0 0 3px rgba(34,197,94,0.2)",
                  }} />
                  {isTokenExpired ? "Disconnected" : "Connected"}
                </span>
                {isTokenExpired && (
                  <Link href="/dashboard/whatsapp" style={{
                    background: "#ef4444", color: "white",
                    padding: "3px 12px", borderRadius: 6,
                    fontSize: 12, fontWeight: 700, textDecoration: "none",
                  }}>Reconnect →</Link>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>
                Plan: <strong style={{ color: "#111827" }}>Starter</strong>
              </span>
              <Link href="/dashboard/billing" style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: "#f0fdf4", border: "1px solid #86efac",
                color: "#128C7E", padding: "5px 14px", borderRadius: 7,
                fontSize: 12, fontWeight: 700, textDecoration: "none",
              }}>
                Upgrade Plan
              </Link>
            </div>
          </div>

          {/* Row 2: greeting + actions */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 28px",
          }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#111827", letterSpacing: "-0.4px" }}>
              Hey {userName}, Welcome to Aries AI! 👋
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <a href="https://wa.me/919876543210" target="_blank" rel="noreferrer" style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 13, color: "#6b7280", textDecoration: "none", fontWeight: 500,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Schedule Demo
              </a>
              <Link href="/dashboard/whatsapp" style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 13, color: "#6b7280", textDecoration: "none", fontWeight: 500,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                Setup Guide
              </Link>
              {/* Notification bell */}
              <button style={{
                width: 36, height: 36, border: "1px solid #e5e7eb", borderRadius: 8,
                background: "white", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <span style={{ position: "absolute", top: 7, right: 7, width: 7, height: 7, background: "#ef4444", borderRadius: "50%", border: "2px solid white" }} />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div style={{ flex: 1, padding: "24px 28px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
