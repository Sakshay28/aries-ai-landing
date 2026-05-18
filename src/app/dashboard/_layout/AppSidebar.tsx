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
  Network,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";
import { useEffect, useState } from "react";

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
  { 
    label: "Live Chat", 
    icon: MessageSquare, 
    href: "/dashboard/chat", 
    badge: (
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-sidebar-foreground/30" />
        <span className="text-[10px] tracking-wide text-sidebar-foreground/50">12 / 3</span>
      </div>
    ) 
  },
  { 
    label: "AI Agents", 
    icon: Bot, 
    href: "/dashboard/agents",
    badge: (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] tracking-wide text-sidebar-foreground/50">2 Active</span>
      </div>
    ) 
  },
  { 
    label: "AI Flows", 
    icon: Network, 
    href: "/dashboard/flows",
    badge: (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] tracking-wide text-sidebar-foreground/50">Active</span>
      </div>
    ) 
  },
  { label: "Broadcast", icon: Megaphone, href: "/dashboard/broadcast" },
  { label: "Contacts", icon: Users, href: "/dashboard/contacts" },
  { 
    label: "Smart Rules", 
    icon: Workflow, 
    href: "/dashboard/automations",
    badge: <SmartRulesBadge />,
  },
  { label: "Knowledge Base", icon: Library, href: "/dashboard/knowledge" },
  { label: "Agents", icon: Network, href: "/dashboard/agents" },
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

export default function AppSidebar({ userEmail }: { userEmail?: string }) {
  const { isOpen, isMobileOpen, toggle, setMobileOpen } = useSidebar();
  const pathname = usePathname();

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
}: {
  isOpen: boolean;
  onToggle: () => void;
  isActive: (href: string) => boolean;
  initials: string;
  userEmail?: string;
  displayName: string;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-4">
        {isOpen && (
          <Link href="/dashboard" className="flex items-center hover:opacity-90 transition-opacity">
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
          <NavButton key={item.label} item={item} isOpen={isOpen} isActive={isActive(item.href)} />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="space-y-1 border-t border-sidebar-border p-3">
        {bottomItems.map((item) => (
          <NavButton key={item.label} item={item} isOpen={isOpen} isActive={isActive(item.href)} />
        ))}
      </div>

      {/* Profile */}
      {isOpen && (
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-[13px] font-semibold text-sidebar-accent-foreground shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{displayName}</p>
              <p className="truncate text-xs text-sidebar-foreground">{userEmail || "preview@aries.ai"}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NavButton({
  item,
  isOpen,
  isActive,
}: {
  item: NavItem;
  isOpen: boolean;
  isActive: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
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
          {item.badge && (
            <span
              className={cn(
                "inline-flex h-5 items-center justify-center rounded-full px-2 text-[10px] font-semibold border border-sidebar-border",
                "bg-black/5 dark:bg-white/5 text-sidebar-foreground",
              )}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
      {!isOpen && item.badge && (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-sidebar-primary" />
      )}
    </Link>
  );
}
