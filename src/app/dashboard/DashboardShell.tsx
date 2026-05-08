"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './_components/Icons';

type NavItem = { label: string; href: string; icon: () => React.ReactElement; badge?: number };

const PRIMARY_NAV: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: Icon.grid },
  { label: 'Workflows', href: '/dashboard/workflows', icon: Icon.flow },
  { label: 'Analytics', href: '/dashboard/analytics', icon: Icon.chart },
  { label: 'Clients', href: '/dashboard/leads', icon: Icon.users },
  { label: 'Integrations', href: '/dashboard/integrations', icon: Icon.plug },
];

const SECONDARY_NAV: NavItem[] = [
  { label: 'Messages', href: '/dashboard/conversations', icon: Icon.msg, badge: 12 },
  { label: 'Logs', href: '/dashboard/logs', icon: Icon.list },
];

const FOOTER_NAV: NavItem[] = [
  { label: 'Settings', href: '/dashboard/settings', icon: Icon.cog },
  { label: 'Help Centre', href: '/dashboard/help', icon: Icon.help },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Ic = item.icon;
  return (
    <Link
      href={item.href}
      className={[
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
        active
          ? 'bg-[#C6F955] text-zinc-900 font-semibold shadow-[0_8px_24px_-12px_rgba(198,249,85,0.6)]'
          : 'text-zinc-400 hover:bg-white/5 hover:text-white',
      ].join(' ')}
    >
      <span className={active ? 'text-zinc-900' : 'text-zinc-500 group-hover:text-zinc-200'}>
        <Ic />
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge != null ? (
        <span className={[
          'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none min-w-5 text-center',
          active ? 'bg-zinc-900 text-[#C6F955]' : 'bg-violet-500 text-white',
        ].join(' ')}>
          {item.badge}
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
  const [now, setNow] = useState<string>('');

  const initials = userEmail ? userEmail.charAt(0).toUpperCase() : 'S';
  const userName = userEmail
    ? userEmail
        .split('@')[0]
        .replace(/[._-]/g, ' ')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : 'Operator';

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  // Page title from pathname
  const segment = pathname.split('/').filter(Boolean)[1];
  const pageTitle =
    !segment
      ? 'Dashboard'
      : segment
          .split('-')
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('topbar-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const update = () =>
      setNow(
        new Date().toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
      );
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 antialiased">
      {/* ── Sidebar ─────────────────────────── */}
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-[#0B0B0E] px-3 py-4 text-zinc-300">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#C6F955] to-[#9BCC2B] text-[13px] font-bold text-zinc-900 shadow-[0_4px_14px_rgba(198,249,85,0.35)]">
            A
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-white">Aries AI</span>
        </Link>

        {/* Workspace switcher */}
        <button className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.06]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Workspace</div>
            <div className="text-[13px] font-medium text-white">Aries · Production</div>
          </div>
          <span className="text-zinc-500">⌄</span>
        </button>

        {/* NAV */}
        <div className="mt-4 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Navigation
        </div>
        <nav className="mt-1 flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </nav>

        <div className="mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Channels
        </div>
        <nav className="mt-1 flex flex-col gap-0.5">
          {SECONDARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer nav */}
        <nav className="flex flex-col gap-0.5">
          {FOOTER_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </nav>

        {/* User card */}
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#C6F955] to-[#84cc16] text-[12px] font-bold text-zinc-900">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-white">{userName}</div>
            <div className="truncate text-[11px] text-zinc-500">{userEmail || 'Owner'}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-white"
          >
            <Icon.logout />
          </button>
        </div>
      </aside>

      {/* ── Main column ─────────────────────── */}
      <div className="ml-64 flex min-h-screen flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/80 px-6 backdrop-blur">
          {/* Search */}
          <div className="flex max-w-md flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 transition focus-within:border-zinc-300 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(0,0,0,0.04)]">
            <span className="text-zinc-400">
              <Icon.search />
            </span>
            <input
              id="topbar-search"
              placeholder="Search leads, conversations, templates…"
              className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 outline-none"
            />
            <kbd className="hidden rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 sm:inline-block">
              ⌘K
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              title="Refresh"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
            >
              <Icon.refresh />
            </button>
            <button
              title="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
            >
              <Icon.bell />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </button>
            <button
              title="Theme"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
            >
              <Icon.moon />
            </button>
            <div className="mx-1 hidden h-6 w-px bg-zinc-200 md:block" />
            <button className="hidden items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 md:inline-flex">
              <Icon.download />
              Export
            </button>
          </div>
        </header>

        {/* Page header */}
        <div className="flex flex-col gap-1 border-b border-zinc-200 bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-zinc-900">{pageTitle}</h1>
            <p className="text-sm text-zinc-500">
              {now ? `${now} · ` : ''}Welcome back, {userName.split(' ')[0]}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Last 7 days
            </button>
            <button className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800">
              + Add widget
            </button>
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
