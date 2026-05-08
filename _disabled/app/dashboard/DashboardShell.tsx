"use client";

// ═══════════════════════════════════════════════════════════
// 🎨 Aries AI Dashboard Shell — Production Premium
// ═══════════════════════════════════════════════════════════
// Dark left sidebar (LeadLogic-inspired) with lime active
// states, slim top bar (search ⌘K, refresh, bell, dark-mode,
// export, statistics dropdown, +Add Widget), light main canvas.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

// ─── Design tokens ─────────────────────────
const SIDE_BG = "#0E0E0E";
const SIDE_HOVER = "#1A1A1A";
const SIDE_TEXT = "#8B8B8B";
const SIDE_TEXT_HOVER = "#E5E5E5";

const LIME = "#C6F955";          // primary lime accent
const LIME_DARK = "#1f2937";     // text on lime
const LIME_GLOW = "rgba(198,249,85,0.45)";

const PURPLE = "#7C3AED";

const INK = "#0a0a0a";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const LINE = "#ececec";
const SURFACE = "#ffffff";
const APP_BG = "#f4f4f5";

// ─── Icons (line, 18px) ─────────────────────
const I = {
  grid: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>),
  flow: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h7a3 3 0 0 1 3 3v6"/><path d="M15 18H8a3 3 0 0 1-3-3V9"/></svg>),
  chart: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/></svg>),
  users: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>),
  plug: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2v6"/><path d="M15 2v6"/><path d="M5 8h14a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-1v3a5 5 0 0 1-10 0v-3H5a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2z"/></svg>),
  msg: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>),
  list: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>),
  cog: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>),
  help: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>),
  logout: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>),
  search: () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>),
  refresh: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>),
  bell: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>),
  moon: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>),
  sun: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>),
  download: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>),
  plus: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>),
  cal: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>),
  chev: () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>),
};

// ─── Nav definitions ─────────────────────────
const NAV = [
  { key: "overview", icon: I.grid, label: "Overview", href: "/dashboard" },
  { key: "workflows", icon: I.flow, label: "Workflows", href: "/dashboard/workflows" },
  { key: "analytics", icon: I.chart, label: "Analytics", href: "/dashboard/analytics" },
  { key: "clients", icon: I.users, label: "Clients", href: "/dashboard/leads" },
  { key: "integrations", icon: I.plug, label: "Integrations", href: "/dashboard/integrations" },
];

const SETTINGS_NAV = [
  { key: "messages", icon: I.msg, label: "Messages", href: "/dashboard/conversations", badge: 12 },
  { key: "logs", icon: I.list, label: "Logs", href: "/dashboard/logs" },
];

interface DashboardShellProps {
  children: React.ReactNode;
  userEmail: string;
  isTokenExpired: boolean;
}

export function DashboardShell({ children, userEmail, isTokenExpired }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [statsRange, setStatsRange] = useState("Last week");
  const [statsOpen, setStatsOpen] = useState(false);
  const [exportPulse, setExportPulse] = useState(false);

  const initials = userEmail ? userEmail.charAt(0).toUpperCase() : "S";
  const userName = userEmail
    ? userEmail.split("@")[0].replace(/[._-]/g, " ").split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    : "Sakshay";

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
  };

  const handleExport = () => {
    setExportPulse(true);
    setTimeout(() => setExportPulse(false), 600);
  };

  // ⌘K listener for search shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("topbar-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      background: APP_BG,
      color: INK,
      fontFamily: "var(--font-dm-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <style jsx global>{`
        body { margin: 0; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 8px; }
        ::-webkit-scrollbar-thumb:hover { background: #a1a1aa; }

        .heading-syne { font-family: var(--font-syne), sans-serif; letter-spacing: -0.02em; }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes pulseLime { 0% { box-shadow: 0 0 0 0 ${LIME_GLOW}; } 70% { box-shadow: 0 0 0 14px rgba(198,249,85,0); } 100% { box-shadow: 0 0 0 0 rgba(198,249,85,0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: scale(1); } }
        @keyframes growBar { from { width: 0; } }

        .anim-fade-up { animation: fadeUp 500ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .anim-scale-in { animation: scaleIn 600ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .anim-pulse { animation: pulseLime 700ms ease-out; }
        .anim-grow-bar { animation: growBar 1.2s cubic-bezier(0.16, 1, 0.3, 1) both; }

        .kpi-card { transition: transform 250ms cubic-bezier(0.16,1,0.3,1), box-shadow 250ms ease; }
        .kpi-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px -10px rgba(0,0,0,0.12); }
      `}</style>

      {/* ─────────────── SIDEBAR ─────────────── */}
      <aside style={{
        width: 232,
        background: SIDE_BG,
        position: "fixed",
        top: 0, left: 0, bottom: 0,
        display: "flex", flexDirection: "column",
        padding: "18px 14px",
        zIndex: 100,
        borderRadius: "0 22px 22px 0",
      }}>
        {/* Logo */}
        <Link href="/" style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 10px 14px",
          textDecoration: "none",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: LIME,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 0 1px rgba(198,249,85,0.3), 0 4px 14px ${LIME_GLOW}`,
            overflow: "hidden",
          }}>
            <Image src="/logo.png" alt="Aries AI" width={22} height={22} style={{ objectFit: "contain" }} />
          </div>
          <span className="heading-syne" style={{
            color: "white", fontSize: 17, fontWeight: 700,
          }}>
            Aries AI
          </span>
        </Link>

        {/* NAVIGATION group */}
        <div style={{
          fontSize: 10.5, fontWeight: 600,
          letterSpacing: "0.12em", color: "#5a5a5a",
          padding: "16px 12px 8px",
        }}>
          NAVIGATION
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(item => {
            const isActive = item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
            const isHover = hovered === item.key;
            const Ic = item.icon;
            return (
              <Link key={item.key} href={item.href}
                onMouseEnter={() => setHovered(item.key)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  textDecoration: "none",
                  background: isActive ? LIME : (isHover ? SIDE_HOVER : "transparent"),
                  color: isActive ? LIME_DARK : (isHover ? SIDE_TEXT_HOVER : SIDE_TEXT),
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                  transition: "all 180ms ease",
                  boxShadow: isActive ? `0 4px 16px ${LIME_GLOW}` : "none",
                }}>
                <Ic />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* SETTINGS group */}
        <div style={{
          fontSize: 10.5, fontWeight: 600,
          letterSpacing: "0.12em", color: "#5a5a5a",
          padding: "20px 12px 8px",
        }}>
          SETTINGS
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SETTINGS_NAV.map(item => {
            const isActive = pathname.startsWith(item.href);
            const isHover = hovered === item.key;
            const Ic = item.icon;
            return (
              <Link key={item.key} href={item.href}
                onMouseEnter={() => setHovered(item.key)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  textDecoration: "none",
                  background: isActive ? LIME : (isHover ? SIDE_HOVER : "transparent"),
                  color: isActive ? LIME_DARK : (isHover ? SIDE_TEXT_HOVER : SIDE_TEXT),
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                  transition: "all 180ms ease",
                }}>
                <Ic />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge != null && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700,
                    padding: "2px 7px", borderRadius: 100,
                    background: PURPLE, color: "white",
                    minWidth: 18, textAlign: "center",
                  }}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom: Settings + Help */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 14 }}>
          {[
            { key: "settings", icon: I.cog, label: "Settings", href: "/dashboard/settings" },
            { key: "help", icon: I.help, label: "Help Centre", href: "/dashboard/help" },
          ].map(item => {
            const isHover = hovered === item.key;
            const Ic = item.icon;
            return (
              <Link key={item.key} href={item.href}
                onMouseEnter={() => setHovered(item.key)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  textDecoration: "none",
                  background: isHover ? SIDE_HOVER : "transparent",
                  color: isHover ? SIDE_TEXT_HOVER : SIDE_TEXT,
                  fontSize: 13.5,
                  fontWeight: 500,
                  transition: "all 180ms ease",
                }}>
                <Ic />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* User card */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 10px",
          borderTop: "1px solid #1f1f1f",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: `linear-gradient(135deg, ${LIME}, #84cc16)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: LIME_DARK, fontSize: 12, fontWeight: 700,
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12.5, fontWeight: 600, color: "white",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {userName}
            </div>
            <div style={{ fontSize: 11, color: "#7a7a7a" }}>Owner</div>
          </div>
          <button onClick={handleLogout} title="Sign out" style={{
            background: "transparent", border: "none", cursor: "pointer",
            padding: 6, borderRadius: 6,
            color: "#7a7a7a", display: "flex",
            transition: "color 150ms",
          }}
            onMouseEnter={e => (e.currentTarget.style.color = "white")}
            onMouseLeave={e => (e.currentTarget.style.color = "#7a7a7a")}
          >
            <I.logout />
          </button>
        </div>
      </aside>

      {/* ─────────────── MAIN ─────────────── */}
      <div style={{
        flex: 1, marginLeft: 232,
        display: "flex", flexDirection: "column",
        minHeight: "100vh",
      }}>
        {/* TOP BAR */}
        <header style={{
          height: 64,
          background: SURFACE,
          borderBottom: `1px solid ${LINE}`,
          display: "flex", alignItems: "center",
          padding: "0 24px",
          gap: 14,
          position: "sticky", top: 0, zIndex: 50,
        }}>
          {/* Search */}
          <div style={{
            flex: 1, maxWidth: 380,
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px",
            background: APP_BG, borderRadius: 10,
            border: `1px solid transparent`,
            transition: "border 180ms",
          }}
            onFocus={e => (e.currentTarget.style.border = `1px solid #d4d4d8`)}
          >
            <span style={{ color: FAINT, display: "flex" }}><I.search /></span>
            <input id="topbar-search" placeholder="Search" style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontSize: 13.5, color: INK,
              fontFamily: "inherit",
            }} />
            <kbd style={{
              fontSize: 10.5, fontWeight: 600,
              padding: "2px 6px", borderRadius: 5,
              background: "white", border: `1px solid ${LINE}`,
              color: MUTED, fontFamily: "inherit",
            }}>⌘K</kbd>
          </div>

          {/* Right group */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            {/* WhatsApp connection status */}
            {isTokenExpired ? (
              <Link href="/dashboard/whatsapp" style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 11.5, fontWeight: 600,
                padding: "6px 10px", borderRadius: 8,
                color: "#dc2626", background: "#fef2f2",
                border: "1px solid #fecaca", textDecoration: "none",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: "#ef4444",
                }} />
                Reconnect WhatsApp
              </Link>
            ) : null}

            {[
              { Ic: I.refresh, label: "Refresh" },
              { Ic: I.bell, label: "Notifications", dot: true },
              { Ic: I.moon, label: "Theme" },
            ].map((b, i) => (
              <button key={i} title={b.label} style={{
                width: 36, height: 36, borderRadius: 9,
                background: "white", border: `1px solid ${LINE}`,
                color: MUTED, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative",
                transition: "all 150ms ease",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = APP_BG; e.currentTarget.style.color = INK; }}
                onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.color = MUTED; }}
              >
                <b.Ic />
                {b.dot && (
                  <span style={{
                    position: "absolute", top: 7, right: 7,
                    width: 7, height: 7, borderRadius: "50%",
                    background: LIME,
                    boxShadow: "0 0 0 2px white",
                  }} />
                )}
              </button>
            ))}

            <button onClick={handleExport}
              className={exportPulse ? "anim-pulse" : ""}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 14px", borderRadius: 9,
                background: "white", border: `1px solid ${LINE}`,
                color: INK, fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 150ms ease",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = APP_BG)}
              onMouseLeave={e => (e.currentTarget.style.background = "white")}
            >
              <I.download />
              Export
            </button>
          </div>
        </header>

        {/* SUB BAR — page title + statistics dropdown + add widget */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "26px 24px 18px",
        }}>
          <h1 className="heading-syne" style={{
            fontSize: 30, fontWeight: 700, margin: 0,
            color: INK,
          }}>
            Dashboard
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
            {/* Statistics dropdown */}
            <button onClick={() => setStatsOpen(!statsOpen)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px",
              background: "white", border: `1px solid ${LINE}`,
              borderRadius: 10, cursor: "pointer",
              fontFamily: "inherit",
            }}>
              <I.cal />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.2 }}>
                <span style={{ fontSize: 10, color: MUTED }}>Statistics</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{statsRange}</span>
              </div>
              <I.chev />
            </button>

            {statsOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 122,
                background: "white", border: `1px solid ${LINE}`,
                borderRadius: 10, padding: 4,
                boxShadow: "0 12px 32px -8px rgba(0,0,0,0.12)",
                minWidth: 160, zIndex: 60,
              }}>
                {["Last week", "Last month", "Last quarter", "Last year"].map(opt => (
                  <button key={opt} onClick={() => { setStatsRange(opt); setStatsOpen(false); }} style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 12px", borderRadius: 7,
                    background: opt === statsRange ? "#f4f4f5" : "transparent",
                    border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: opt === statsRange ? 600 : 500,
                    color: INK,
                    fontFamily: "inherit",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f4f4f5")}
                    onMouseLeave={e => (e.currentTarget.style.background = opt === statsRange ? "#f4f4f5" : "transparent")}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            <button style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 14px", borderRadius: 10,
              background: INK, color: "white",
              border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600,
              fontFamily: "inherit",
              transition: "transform 150ms",
            }}
              onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "none")}
            >
              <I.plus />
              Add widget
            </button>
          </div>
        </div>

        {/* PAGE CONTENT */}
        <main style={{
          flex: 1,
          padding: "0 24px 36px",
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}
