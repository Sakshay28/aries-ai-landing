"use client";

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  LayoutGrid,
  CheckSquare,
  Users,
  Settings,
  Plus,
  Info,
  LogOut,
} from 'lucide-react';
import { RightRail } from './_components/RightRail';

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  addable?: boolean;
};

const NAV: NavItem[] = [
  { label: 'Home', href: '/dashboard', icon: Home },
  { label: 'Projects', href: '/dashboard/leads', icon: LayoutGrid, addable: true },
  { label: 'Tasks', href: '/dashboard/workflows', icon: CheckSquare, addable: true },
  { label: 'Team', href: '/dashboard/conversations', icon: Users },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" transform="rotate(-12 8 8)" fill="#101828" />
      <rect x="6" y="6" width="11" height="11" rx="1.5" transform="rotate(20 11.5 11.5)" fill="#101828" />
    </svg>
  );
}

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
  userEmail?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#F5F6FA] text-[#101828] antialiased">
      {/* ── Left sidebar ────────────────────────────────────────── */}
      <aside className="sticky top-0 z-30 hidden h-screen w-[220px] shrink-0 flex-col border-r border-[#EEF0F4] bg-white px-5 py-6 md:flex">
        <Link href="/dashboard" className="flex items-center gap-2.5 pb-8">
          <LogoMark />
          <span className="text-[20px] font-bold tracking-tight text-[#101828]">logip</span>
        </Link>

        <nav className="flex flex-col gap-1.5">
          {NAV.map((item) => {
            const Ic = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition',
                  active
                    ? 'bg-[#1A1A2E] text-white font-semibold'
                    : 'text-[#667085] hover:bg-zinc-50 hover:text-[#101828]',
                ].join(' ')}
              >
                <Ic
                  size={18}
                  strokeWidth={1.8}
                  className={active ? 'text-white' : 'text-[#98A2B3] group-hover:text-[#475467]'}
                />
                <span className="flex-1">{item.label}</span>
                {item.addable ? (
                  <span
                    className={[
                      'flex h-5 w-5 items-center justify-center rounded-md',
                      active ? 'bg-white/10 text-white' : 'bg-zinc-100 text-[#667085]',
                    ].join(' ')}
                  >
                    <Plus size={12} strokeWidth={2.4} />
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="rounded-2xl bg-[#F2F3F7] p-4">
          <div className="text-[13px] font-bold text-[#101828]">Upgrade to Pro</div>
          <div className="mt-1 text-[11.5px] leading-snug text-[#667085]">
            Get 1 month free and unlock
          </div>
          <button className="mt-3 w-full rounded-full bg-[#9DBFF9] px-4 py-2 text-[12.5px] font-semibold text-[#0B2A66] transition hover:bg-[#8BB1F5]">
            Upgrade
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-1">
          <button className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-[#667085] transition hover:bg-zinc-50 hover:text-[#101828]">
            <Info size={16} strokeWidth={1.8} className="text-[#98A2B3]" />
            <span>Help &amp; information</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-[#667085] transition hover:bg-zinc-50 hover:text-[#101828]"
          >
            <LogOut size={16} strokeWidth={1.8} className="text-[#98A2B3]" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* ── Main content slot (children expand here) ───────────── */}
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>

      {/* ── Right rail (sticky, xl+) ───────────────────────────── */}
      <RightRail />
    </div>
  );
}
