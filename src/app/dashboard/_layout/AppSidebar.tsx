"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  LayoutDashboard,
  MessageCircle,
  Users,
  Megaphone,
  FileText,
  Workflow,
  PhoneCall,
  BarChart3,
  Phone,
  Plug,
  ListChecks,
  CreditCard,
  Settings,
  HelpCircle,
} from "lucide-react";
import { useSidebar } from "./SidebarContext";

type SubItem = { name: string; path: string };
type NavItem = {
  name: string;
  icon: ReactNode;
  path?: string;
  subItems?: SubItem[];
};

const mainNav: NavItem[] = [
  { name: "Dashboard", icon: <LayoutDashboard size={20} />, path: "/dashboard" },
  { name: "Conversations", icon: <MessageCircle size={20} />, path: "/dashboard/conversations" },
  { name: "Leads", icon: <Users size={20} />, path: "/dashboard/leads" },
  { name: "Broadcasts", icon: <Megaphone size={20} />, path: "/dashboard/broadcast" },
  { name: "Templates", icon: <FileText size={20} />, path: "/dashboard/templates" },
  { name: "Workflows", icon: <Workflow size={20} />, path: "/dashboard/workflows" },
  { name: "Voice AI", icon: <PhoneCall size={20} />, path: "/dashboard/voice" },
  { name: "Analytics", icon: <BarChart3 size={20} />, path: "/dashboard/analytics" },
];

const manageNav: NavItem[] = [
  { name: "WhatsApp", icon: <Phone size={20} />, path: "/dashboard/whatsapp" },
  { name: "Integrations", icon: <Plug size={20} />, path: "/dashboard/integrations" },
  { name: "Logs", icon: <ListChecks size={20} />, path: "/dashboard/logs" },
  { name: "Billing", icon: <CreditCard size={20} />, path: "/dashboard/billing" },
  { name: "Settings", icon: <Settings size={20} />, path: "/dashboard/settings" },
  { name: "Help", icon: <HelpCircle size={20} />, path: "/dashboard/help" },
];

function LogoMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="4" y="4" width="14" height="14" rx="3" fill="#6366F1" />
      <rect x="14" y="14" width="14" height="14" rx="3" fill="#6366F1" opacity="0.55" />
    </svg>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const {
    isExpanded,
    isHovered,
    isMobileOpen,
    setIsHovered,
    openSubmenu,
    toggleSubmenu,
  } = useSidebar();

  const showLabels = isExpanded || isHovered || isMobileOpen;

  const isActive = (path: string) =>
    path === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(path);

  const submenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [submenuHeights, setSubmenuHeights] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!openSubmenu) return;
    const el = submenuRefs.current[openSubmenu];
    if (el) setSubmenuHeights((p) => ({ ...p, [openSubmenu]: el.scrollHeight }));
  }, [openSubmenu]);

  const renderItems = (items: NavItem[], section: string) => (
    <ul className="flex flex-col gap-1">
      {items.map((nav, idx) => {
        const key = `${section}-${idx}`;
        if (nav.subItems) {
          const open = openSubmenu === key;
          const anySubActive = nav.subItems.some((s) => isActive(s.path));
          return (
            <li key={nav.name}>
              <button
                onClick={() => toggleSubmenu(key)}
                className={[
                  "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  anySubActive || open
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-gray-700 hover:bg-gray-50",
                  !showLabels ? "justify-center" : "",
                ].join(" ")}
              >
                <span
                  className={
                    anySubActive || open
                      ? "text-indigo-600"
                      : "text-gray-400 group-hover:text-gray-600"
                  }
                >
                  {nav.icon}
                </span>
                {showLabels && (
                  <>
                    <span className="flex-1 text-left">{nav.name}</span>
                    <ChevronDown
                      size={16}
                      className={[
                        "transition-transform duration-200",
                        open ? "rotate-180 text-indigo-500" : "text-gray-400",
                      ].join(" ")}
                    />
                  </>
                )}
              </button>
              {showLabels && (
                <div
                  ref={(el) => {
                    submenuRefs.current[key] = el;
                  }}
                  className="overflow-hidden transition-[height] duration-300 ease-in-out"
                  style={{ height: open ? `${submenuHeights[key] ?? 0}px` : 0 }}
                >
                  <ul className="mt-1 ml-9 flex flex-col gap-1">
                    {nav.subItems.map((sub) => (
                      <li key={sub.path}>
                        <Link
                          href={sub.path}
                          className={[
                            "block rounded-md px-3 py-2 text-sm transition-colors",
                            isActive(sub.path)
                              ? "bg-indigo-50 text-indigo-600"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                          ].join(" ")}
                        >
                          {sub.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        }

        const active = nav.path ? isActive(nav.path) : false;
        return (
          <li key={nav.name}>
            <Link
              href={nav.path ?? "#"}
              title={!showLabels ? nav.name : undefined}
              className={[
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-indigo-50 text-indigo-600" : "text-gray-700 hover:bg-gray-50",
                !showLabels ? "justify-center" : "",
              ].join(" ")}
            >
              <span
                className={
                  active ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-600"
                }
              >
                {nav.icon}
              </span>
              {showLabels && <span className="flex-1">{nav.name}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  // Width as inline style — never gets purged, never has lg/breakpoint surprises
  const desktopWidth = showLabels ? 260 : 80;

  return (
    <>
      {/* Desktop sidebar — flex item, no fixed positioning */}
      <aside
        onMouseEnter={() => !isExpanded && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ width: desktopWidth }}
        className="hidden shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-300 ease-in-out lg:flex"
      >
        <SidebarBody
          showLabels={showLabels}
          mainContent={renderItems(mainNav, "main")}
          manageContent={renderItems(manageNav, "manage")}
        />
      </aside>

      {/* Mobile drawer — fixed, slides in */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out lg:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <SidebarBody
          showLabels
          mainContent={renderItems(mainNav, "main")}
          manageContent={renderItems(manageNav, "manage")}
        />
      </aside>
    </>
  );
}

function SidebarBody({
  showLabels,
  mainContent,
  manageContent,
}: {
  showLabels: boolean;
  mainContent: ReactNode;
  manageContent: ReactNode;
}) {
  return (
    <>
      <div
        className={[
          "flex items-center gap-2 px-6 py-6",
          !showLabels ? "justify-center px-0" : "",
        ].join(" ")}
      >
        <LogoMark />
        {showLabels && (
          <span className="text-xl font-bold tracking-tight text-gray-900">
            Aries<span className="text-indigo-600">AI</span>
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-6">
        {showLabels ? (
          <h3 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Menu
          </h3>
        ) : (
          <div className="mx-auto mb-3 h-px w-6 bg-gray-200" />
        )}
        {mainContent}

        <div className="mt-8">
          {showLabels ? (
            <h3 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Manage
            </h3>
          ) : (
            <div className="mx-auto mb-3 h-px w-6 bg-gray-200" />
          )}
          {manageContent}
        </div>
      </nav>
    </>
  );
}
