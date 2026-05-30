"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  MessageSquare,
  Megaphone,
  Users,
  Workflow,
  Network,
  FileText,
  Puzzle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Settings,
  Zap,
  Bot,
  UserCog,
  Library,
  Activity,
  CalendarDays,
  UtensilsCrossed,
  CalendarX,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";
import { useEffect, useState } from "react";
import { detectBrandFromHost, BRANDS } from "@/lib/brand";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function SmartRulesBadge() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/dashboard/automations')
      .then(r => r.json())
      .then(d => setCount((d.rules as unknown[])?.filter((r: unknown) => (r as { status: string }).status === 'active').length ?? 0))
      .catch(() => {});
  }, []);
  if (count === null || count === 0) return null;
  return <span className="text-[10px] tracking-wide text-sidebar-foreground/50">{count}</span>;
}

type NavItem = {
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: React.ReactNode;
};

const navigationItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Live Chat", icon: MessageSquare, href: "/dashboard/chat" },
  { label: "AI Assistant", icon: Bot, href: "/dashboard/agents" },
  { label: "AI Flows", icon: Network, href: "/dashboard/flows" },
  { label: "Broadcast", icon: Megaphone, href: "/dashboard/broadcast" },
  { label: "Contacts", icon: Users, href: "/dashboard/contacts" },
  { 
    label: "Smart Rules", 
    icon: Workflow, 
    href: "/dashboard/automations",
    badge: <SmartRulesBadge />,
  },
  { label: "Templates", icon: FileText, href: "/dashboard/templates" },
  { label: "Event Logs", icon: Activity, href: "/dashboard/logs" },
  { label: "Integrations", icon: Puzzle, href: "/dashboard/integrations" },
];

const bottomItems: NavItem[] = [
  { label: "Team", icon: Users, href: "/dashboard/team" },
  { label: "Billing", icon: CreditCard, href: "/dashboard/billing" },
  { label: "Business Profile", icon: UserCog, href: "/dashboard/settings/profile" },
  { label: "Settings", icon: Settings, href: "/dashboard/settings" },
];


export default function AppSidebar({ userEmail, modules = [] }: { userEmail?: string; modules?: string[] }) {
  const { isOpen, isMobileOpen, toggle, setMobileOpen } = useSidebar();
  const pathname = usePathname();

  const hasRestaurant = true; // Temporarily force true for visual review

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const initials = (userEmail?.[0] ?? "A").toUpperCase();
  const displayName = userEmail ? userEmail.split("@")[0] : "Account";

  return (
    <>
      {/* Desktop — flex item */}
      <DesktopSidebar
        isOpen={isOpen}
        onToggle={toggle}
        pathname={pathname}
        isActive={isActive}
        initials={initials}
        userEmail={userEmail}
        displayName={displayName}
        hasRestaurant={hasRestaurant}
      />

      {/* Mobile — fixed drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-in-out lg:hidden",
          "shadow-[inset_-1px_0_rgba(255,255,255,0.4)] dark:shadow-[4px_0_24px_-4px_rgba(0,0,0,0.8)]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarBody
          isOpen
          onToggle={() => setMobileOpen(false)}
          isActive={isActive}
          initials={initials}
          userEmail={userEmail}
          displayName={displayName}
          hasRestaurant={hasRestaurant}
        />
      </aside>
    </>
  );
}

function DesktopSidebar(props: {
  isOpen: boolean;
  onToggle: () => void;
  pathname: string;
  isActive: (href: string) => boolean;
  initials: string;
  userEmail?: string;
  displayName: string;
  hasRestaurant: boolean;
}) {
  return (
    <aside
      style={{ width: props.isOpen ? 220 : 64 }}
      className="hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-in-out lg:flex relative z-20"
    >
      <SidebarBody
        isOpen={props.isOpen}
        onToggle={props.onToggle}
        isActive={props.isActive}
        initials={props.initials}
        userEmail={props.userEmail}
        displayName={props.displayName}
        hasRestaurant={props.hasRestaurant}
      />
    </aside>
  );
}

function SidebarBody({
  isOpen,
  onToggle,
  isActive,
  initials,
  userEmail,
  displayName,
  hasRestaurant,
}: {
  isOpen: boolean;
  onToggle: () => void;
  isActive: (href: string) => boolean;
  initials: string;
  userEmail?: string;
  displayName: string;
  hasRestaurant: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsideClick = () => setMenuOpen(false);
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [menuOpen]);

  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  };

  const handleLogout = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        // Dynamic redirect based on the brand host
        const host = typeof window !== "undefined" ? window.location.host : "";
        const brand = detectBrandFromHost(host);
        const domain = BRANDS[brand]?.domain || "ariesai.in";
        window.location.href = `https://${domain}`;
      } else {
        console.error("Failed to log out");
      }
    } catch (err) {
      console.error("Logout request error:", err);
    } finally {
      setLoggingOut(false);
    }
  };

  const plan = "pro";

  return (
    <>
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-4">
        {isOpen && (
          <Link href="/" prefetch={false} className="flex items-center hover:opacity-90 transition-opacity">
            <Image 
              src="/logo.png" 
              alt="Aries AI" 
              width={100} 
              height={36} 
              className="object-contain h-9 w-auto"
              priority
            />
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-7 w-7 text-sidebar-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-sidebar-accent-foreground"
          aria-label="Toggle sidebar"
        >
          {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        {navigationItems.map((item) => (
          <NavButton key={item.label} item={item} isOpen={isOpen} isActive={isActive(item.href)} userPlan={plan} />
        ))}

        {/* Restaurant section — module-gated */}
        {hasRestaurant && (
          <>
            {isOpen && (
              <p className="mt-4 mb-1 px-3 text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase select-none">
                Restaurant
              </p>
            )}
            {!isOpen && <div className="my-2 border-t border-sidebar-border/40" />}
            <NavButton
              item={{ label: "Overview", icon: CalendarDays, href: "/dashboard/restaurant" }}
              isOpen={isOpen}
              isActive={isActive("/dashboard/restaurant")}
              userPlan={plan}
            />
            <NavButton
              item={{ label: "Bookings", icon: UtensilsCrossed, href: "/dashboard/restaurant/bookings" }}
              isOpen={isOpen}
              isActive={isActive("/dashboard/restaurant/bookings")}
              userPlan={plan}
            />
            <NavButton
              item={{ label: "Slot Management", icon: Clock, href: "/dashboard/restaurant/slots" }}
              isOpen={isOpen}
              isActive={isActive("/dashboard/restaurant/slots")}
              userPlan={plan}
            />
            <NavButton
              item={{ label: "Block Dates", icon: CalendarX, href: "/dashboard/restaurant/blocked-dates" }}
              isOpen={isOpen}
              isActive={isActive("/dashboard/restaurant/blocked-dates")}
              userPlan={plan}
            />
          </>
        )}
      </nav>

      {/* Bottom nav */}
      <div className="space-y-1 border-t border-sidebar-border p-3">
        {bottomItems.map((item) => (
          <NavButton key={item.label} item={item} isOpen={isOpen} isActive={isActive(item.href)} userPlan={plan} />
        ))}
      </div>


      {/* Profile Section */}
      <div className="border-t border-sidebar-border p-3 relative">
        {isOpen ? (
          <button
            onClick={handleProfileClick}
            className="flex w-full items-center gap-3 rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 text-left active:scale-[0.98]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-[13px] font-semibold text-sidebar-accent-foreground shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{displayName}</p>
              <p className="truncate text-xs text-sidebar-foreground/75">{userEmail || "preview@aries.ai"}</p>
            </div>
          </button>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={handleProfileClick}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-[13px] font-semibold text-sidebar-accent-foreground shadow-sm hover:bg-black/10 dark:hover:bg-white/15 transition-all duration-200 active:scale-95"
            >
              {initials}
            </button>
          </div>
        )}

        {/* Profile Menu Dropdown */}
        {menuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute bottom-[calc(100%-4px)] z-50 rounded-xl border border-sidebar-border bg-popover/95 backdrop-blur-md p-1.5 shadow-xl transition-all animate-fade-in",
              isOpen ? "left-3 right-3" : "left-14 w-48"
            )}
          >
            {/* Header (mainly for collapsed mode) */}
            {!isOpen && (
              <div className="px-2.5 py-1.5 border-b border-sidebar-border/40 mb-1">
                <p className="truncate text-xs font-semibold text-sidebar-accent-foreground">{displayName}</p>
                <p className="truncate text-[10px] text-sidebar-foreground/75">{userEmail || "preview@aries.ai"}</p>
              </div>
            )}

            <Link
              href="/dashboard/settings/profile"
              prefetch={false}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-sidebar-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-sidebar-accent-foreground transition-colors"
            >
              <UserCog className="h-3.5 w-3.5" />
              <span>Business Profile</span>
            </Link>

            <Link
              href="/dashboard/settings"
              prefetch={false}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-sidebar-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-sidebar-accent-foreground transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Settings</span>
            </Link>

            <Link
              href="/dashboard/billing"
              prefetch={false}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-sidebar-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-sidebar-accent-foreground transition-colors"
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span>Billing</span>
            </Link>

            <div className="my-1 border-t border-sidebar-border/40" />

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-red-500 hover:bg-red-500/10 transition-colors text-left font-medium active:scale-[0.98]"
            >
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>{loggingOut ? "Signing out..." : "Sign Out"}</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function NavButton({
  item,
  isOpen,
  isActive,
  userPlan: _userPlan,
}: {
  item: NavItem;
  isOpen: boolean;
  isActive: boolean;
  userPlan: string;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      prefetch={false}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
        isActive
          ? "bg-black/5 dark:bg-white/5 text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 hover:text-sidebar-accent-foreground",
        !isOpen && "justify-center",
      )}
      title={!isOpen ? item.label : undefined}
    >
      <Icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground/80")} />
      {isOpen && (
        <>
          <span className="flex-1 text-left">{item.label}</span>
          {item.badge ? (
            <span
              className={cn(
                "inline-flex h-5 items-center justify-center rounded-full px-2 text-[10px] font-semibold border border-sidebar-border",
                "bg-black/5 dark:bg-white/5 text-sidebar-foreground",
              )}
            >
              {item.badge}
            </span>
          ) : null}
        </>
      )}
      {!isOpen && item.badge ? (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-sidebar-primary" />
      ) : null}
    </Link>
  );
}

