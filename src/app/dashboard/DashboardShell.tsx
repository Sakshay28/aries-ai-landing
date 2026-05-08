"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

type NavKey = 'Home' | 'Projects' | 'Tasks' | 'Team' | 'Settings';

const NAV: { key: NavKey; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; addable?: boolean }[] = [
  { key: 'Home', label: 'Home', icon: Home },
  { key: 'Projects', label: 'Projects', icon: LayoutGrid, addable: true },
  { key: 'Tasks', label: 'Tasks', icon: CheckSquare, addable: true },
  { key: 'Team', label: 'Team', icon: Users },
  { key: 'Settings', label: 'Settings', icon: Settings },
];

function LogoMark() {
  // Two overlapping rotated squares
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
  const router = useRouter();
  const [active, setActive] = useState<NavKey>('Tasks');

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[#F5F6FA] text-[#101828] antialiased">
      {/* Left sidebar (220px, white) */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col border-r border-[#EEF0F4] bg-white px-5 py-6">
        {/* Logo */}
        <div className="flex items-center gap-2.5 pb-8">
          <LogoMark />
          <span className="text-[20px] font-bold tracking-tight text-[#101828]">logip</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1.5">
          {NAV.map((item) => {
            const Ic = item.icon;
            const isActive = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActive(item.key)}
                className={[
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] transition',
                  isActive
                    ? 'bg-[#1A1A2E] text-white font-semibold'
                    : 'text-[#667085] hover:bg-zinc-50 hover:text-[#101828]',
                ].join(' ')}
              >
                <Ic size={18} strokeWidth={1.8} className={isActive ? 'text-white' : 'text-[#98A2B3] group-hover:text-[#475467]'} />
                <span className="flex-1">{item.label}</span>
                {item.addable ? (
                  <span
                    className={[
                      'flex h-5 w-5 items-center justify-center rounded-md',
                      isActive ? 'bg-white/10 text-white' : 'bg-zinc-100 text-[#667085]',
                    ].join(' ')}
                  >
                    <Plus size={12} strokeWidth={2.4} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Upgrade card */}
        <div className="rounded-2xl bg-[#F2F3F7] p-4">
          <div className="text-[13px] font-bold text-[#101828]">Upgrade to Pro</div>
          <div className="mt-1 text-[11.5px] leading-snug text-[#667085]">Get 1 month free and unlock</div>
          <button className="mt-3 w-full rounded-full bg-[#9DBFF9] px-4 py-2 text-[12.5px] font-semibold text-[#0B2A66] transition hover:bg-[#8BB1F5]">
            Upgrade
          </button>
        </div>

        {/* Bottom links */}
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

      {/* Main column */}
      <div className="ml-[220px] min-h-screen">{children}</div>
    </div>
  );
}
