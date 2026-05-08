"use client";

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  BarChart3,
  ListTree,
  MessageSquare,
  Megaphone,
  Send,
  Zap,
  FileText,
  Upload,
  Plug,
  Users,
  Settings as SettingsIcon,
  HelpCircle,
  ChevronDown,
  LogOut,
  Sparkles,
} from 'lucide-react';

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  badge?: { text: string; tone: 'green' | 'orange' | 'blue' | 'purple' };
};

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
      { label: 'Logs', href: '/dashboard/logs', icon: ListTree },
    ],
  },
  {
    title: 'Channels',
    items: [
      { label: 'Live Chat', href: '/dashboard/conversations', icon: MessageSquare, badge: { text: '12 open', tone: 'orange' } },
      { label: 'Broadcasts', href: '/dashboard/broadcast', icon: Megaphone },
      { label: 'Campaigns', href: '/dashboard/campaigns', icon: Send },
    ],
  },
  {
    title: 'Tools',
    items: [
      { label: 'Automations', href: '/dashboard/workflows', icon: Zap, badge: { text: '7 active', tone: 'green' } },
      { label: 'Templates', href: '/dashboard/templates', icon: FileText },
      { label: 'Import Contacts', href: '/dashboard/import', icon: Upload },
      { label: 'Integrations', href: '/dashboard/integrations', icon: Plug },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Clients', href: '/dashboard/leads', icon: Users },
      { label: 'Settings', href: '/dashboard/settings', icon: SettingsIcon },
      { label: 'Help Centre', href: '/dashboard/help', icon: HelpCircle },
    ],
  },
];

const toneClass: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
};

function NavLinkRow({ item, active }: { item: NavItem; active: boolean }) {
  const Ic = item.icon;
  return (
    <Link
      href={item.href}
      className={[
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
        active
          ? 'bg-emerald-50 text-emerald-700 font-medium'
          : 'text-[#475467] hover:bg-zinc-50 hover:text-[#101828]',
      ].join(' ')}
    >
      {active ? (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[#12B76A]" />
      ) : null}
      <Ic size={18} strokeWidth={1.8} className={active ? 'text-emerald-600' : 'text-[#98A2B3] group-hover:text-[#475467]'} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${toneClass[item.badge.tone]}`}>
          {item.badge.text}
        </span>
      ) : null}
    </Link>
  );
}

export function DashboardShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const initials = userEmail ? userEmail.charAt(0).toUpperCase() : 'S';
  const userName = userEmail
    ? userEmail
        .split('@')[0]
        .replace(/[._-]/g, ' ')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : 'Sakshay Ajwani';

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const el = document.getElementById('topbar-search') as HTMLInputElement | null;
        el?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#101828] antialiased">
      {/* ── Left sidebar (240px, white) ──────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[#EAECF0] bg-white">
        {/* Brand */}
        <div className="px-5 pb-4 pt-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-emerald-100">
              <span className="h-2.5 w-2.5 rounded-full bg-[#12B76A]" />
            </div>
            <span className="text-[15.5px] font-bold tracking-tight text-[#101828]">Aries AI</span>
          </Link>

          {/* Workspace switcher */}
          <button className="mt-3 flex w-full items-center justify-between rounded-xl border border-[#EAECF0] bg-white px-3 py-2 text-left transition hover:bg-zinc-50">
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] uppercase tracking-wider text-[#667085]">Workspace</div>
              <div className="flex items-center gap-2">
                <span className="truncate text-[12.5px] font-semibold text-[#101828]">Aries · Production</span>
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-emerald-700 ring-1 ring-emerald-200">Pro</span>
              </div>
            </div>
            <ChevronDown size={14} className="text-[#98A2B3]" />
          </button>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {SECTIONS.map((sec) => (
            <div key={sec.title} className="mb-3">
              <div className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#98A2B3]">
                {sec.title}
              </div>
              <nav className="flex flex-col gap-0.5">
                {sec.items.map((item) => (
                  <NavLinkRow key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </nav>
            </div>
          ))}
        </div>

        {/* Upgrade banner */}
        <div className="px-3">
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7] p-3.5">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-emerald-700" />
              <span className="text-[12.5px] font-semibold text-emerald-900">Upgrade to Pro</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-emerald-800/80">
              Unlock unlimited broadcasts &amp; AI replies.
            </p>
            <button className="mt-2.5 w-full rounded-lg bg-[#12B76A] px-3 py-2 text-xs font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)] hover:bg-[#0E9E5C] transition">
              Upgrade Plan
            </button>
          </div>
        </div>

        {/* User chip */}
        <div className="border-t border-[#EAECF0] px-3 py-3 mt-3">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-[12px] font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-[#101828]">{userName}</div>
              <div className="truncate text-[10.5px] text-[#667085]">{userEmail || 'sakshayajwani@gmail.com'}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#98A2B3] transition hover:bg-zinc-100 hover:text-[#101828]"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column (children fill, can be 1- or 2-column) ──── */}
      <div className="ml-60 min-h-screen">{children}</div>
    </div>
  );
}
