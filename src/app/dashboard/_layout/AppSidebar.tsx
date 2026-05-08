"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Sparkles,
  MessageSquare,
  Users,
  Workflow,
  BarChart3,
  Puzzle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Settings,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";

type NavItem = {
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: string;
};

const navigationItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "AI Agents", icon: Sparkles, href: "/dashboard/voice", badge: "3" },
  { label: "Conversations", icon: MessageSquare, href: "/dashboard/conversations", badge: "12" },
  { label: "Leads", icon: Users, href: "/dashboard/leads" },
  { label: "Workflows", icon: Workflow, href: "/dashboard/workflows" },
  { label: "Analytics", icon: BarChart3, href: "/dashboard/analytics" },
  { label: "Integrations", icon: Puzzle, href: "/dashboard/integrations" },
];

const bottomItems: NavItem[] = [
  { label: "Billing", icon: CreditCard, href: "/dashboard/billing" },
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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out lg:hidden",
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
      style={{ width: props.isOpen ? 256 : 80 }}
      className="hidden shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-300 ease-in-out lg:flex"
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
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
        {isOpen && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 shadow-sm">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight text-gray-900">Aries</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Toggle sidebar"
        >
          {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {navigationItems.map((item) => (
          <NavButton key={item.label} item={item} isOpen={isOpen} isActive={isActive(item.href)} />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="space-y-1 border-t border-gray-200 p-2">
        {bottomItems.map((item) => (
          <NavButton key={item.label} item={item} isOpen={isOpen} isActive={isActive(item.href)} />
        ))}
      </div>

      {/* Profile */}
      {isOpen && (
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
              <p className="truncate text-xs text-gray-500">{userEmail || "preview@aries.ai"}</p>
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
        "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-indigo-50 text-indigo-700"
          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
        !isOpen && "justify-center",
      )}
      title={!isOpen ? item.label : undefined}
    >
      <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-indigo-600" : "text-gray-500")} />
      {isOpen && (
        <>
          <span className="flex-1 text-left">{item.label}</span>
          {item.badge && (
            <span
              className={cn(
                "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                isActive ? "bg-indigo-600 text-white" : "bg-indigo-600 text-white",
              )}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
      {!isOpen && item.badge && (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-indigo-600" />
      )}
    </Link>
  );
}
