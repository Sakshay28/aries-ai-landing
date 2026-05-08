"use client";

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Workflows', href: '/dashboard/workflows' },
  { label: 'Analytics', href: '/dashboard/analytics' },
  { label: 'Clients', href: '/dashboard/leads' },
  { label: 'Integrations', href: '/dashboard/integrations' },
  { label: 'Messages', href: '/dashboard/conversations' },
  { label: 'Logs', href: '/dashboard/logs' },
  { label: 'Settings', href: '/dashboard/settings' },
  { label: 'Help Centre', href: '/dashboard/help' },
];

export function DashboardShell({ children, userEmail }: { children: React.ReactNode; userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const initials = userEmail ? userEmail.charAt(0).toUpperCase() : 'S';
  const isActive = (href: string) => href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

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

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
  };
  return (
    <div className="flex min-h-screen bg-zinc-100 text-zinc-900">
      <aside className="fixed top-0 left-0 bottom-0 w-[232px] bg-[#0E0E0E] text-zinc-400 flex flex-col p-4 rounded-r-[22px] z-50">
        <Link href="/" className="flex items-center gap-2.5 px-2 py-3 no-underline">
          <div className="w-8 h-8 rounded-lg bg-[#C6F955] flex items-center justify-center text-[#1f2937] font-bold text-sm">A</div>
          <span className="text-white font-bold text-[17px]">Aries AI</span>
        </Link>

        <div className="text-[10.5px] font-semibold tracking-[0.12em] text-[#5a5a5a] px-3 pt-4 pb-2">NAVIGATION</div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(item => (
            <Link key={item.href} href={item.href}
              className={`px-3 py-2.5 rounded-[10px] text-[13.5px] no-underline ${isActive(item.href) ? 'bg-[#C6F955] text-[#1f2937] font-semibold shadow-[0_4px_16px_rgba(198,249,85,0.45)]' : 'text-[#8B8B8B] font-medium hover:bg-[#1A1A1A] hover:text-[#E5E5E5]'}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-2.5 px-2.5 py-2.5 border-t border-[#1f1f1f]">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C6F955] to-[#84cc16] text-[#1f2937] text-xs font-bold flex items-center justify-center">{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-white truncate">{userEmail || 'User'}</div>
            <div className="text-[11px] text-[#7a7a7a]">Owner</div>
          </div>
          <button onClick={handleLogout} title="Sign out" className="text-[#7a7a7a] hover:text-white p-1.5 rounded-md">
            ↪
          </button>
        </div>
      </aside>

      <div className="flex-1 ml-[232px] flex flex-col min-h-screen">
        <header className="h-16 bg-white border-b border-[#ececec] flex items-center px-6 gap-3 sticky top-0 z-40">
          <div className="flex-1 max-w-[380px] flex items-center gap-2.5 px-3 py-2 bg-zinc-100 rounded-[10px] border border-transparent focus-within:border-zinc-300">
            <span className="text-zinc-400 text-sm">⌕</span>
            <input id="topbar-search" placeholder="Search" className="flex-1 bg-transparent outline-none text-[13.5px]" />
            <kbd className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-white border border-[#ececec] text-zinc-500">⌘K</kbd>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="w-9 h-9 rounded-[9px] bg-white border border-[#ececec] text-zinc-500 hover:bg-zinc-100" title="Refresh">↻</button>
            <button className="w-9 h-9 rounded-[9px] bg-white border border-[#ececec] text-zinc-500 hover:bg-zinc-100 relative" title="Notifications">
              🔔
              <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full bg-[#C6F955] ring-2 ring-white" />
            </button>
            <button className="w-9 h-9 rounded-[9px] bg-white border border-[#ececec] text-zinc-500 hover:bg-zinc-100" title="Theme">☾</button>
            <button className="px-3.5 py-2 rounded-[9px] bg-white border border-[#ececec] text-sm font-semibold hover:bg-zinc-100">Export</button>
          </div>
        </header>

        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h1 className="text-[30px] font-bold tracking-tight">Dashboard</h1>
        </div>

        <main className="flex-1 px-6 pb-9">{children}</main>
      </div>
    </div>
  );
}
