"use client";

import {
  Calendar,
  ChevronDown,
  Download,
  MessageCircle,
  Megaphone,
  Upload,
  Zap,
  FileText,
  Plug,
  Send,
  Eye,
  MessageSquare,
  Users,
  MoreHorizontal,
  ArrowUpRight,
} from 'lucide-react';

import { CountUp } from './_components/CountUp';
import { PerformanceChart } from './_components/PerformanceChart';
import { RightRail } from './_components/RightRail';

const QUICK_ACTIONS = [
  {
    label: 'Live Chat',
    line1: '12 open',
    line2: '4 unassigned',
    line2Class: 'text-orange-500',
    icon: MessageCircle,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-[#12B76A]',
    extra: (
      <div className="mt-2 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[#12B76A]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#12B76A]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#F79009]" />
      </div>
    ),
  },
  {
    label: 'Broadcast',
    line1: 'Send to segment',
    line2: 'Bulk & targeted',
    line2Class: 'text-[#667085]',
    icon: Megaphone,
    iconBg: 'bg-violet-50',
    iconColor: 'text-[#7C3AED]',
  },
  {
    label: 'Import Contacts',
    line1: 'CSV / Excel / API',
    line2: '12,840 in store',
    line2Class: 'text-[#667085]',
    icon: Upload,
    iconBg: 'bg-zinc-100',
    iconColor: 'text-[#475467]',
  },
  {
    label: 'Automations',
    line1: '7 active flows',
    line2: '3 drafts',
    line2Class: 'text-emerald-600',
    icon: Zap,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-[#12B76A]',
  },
  {
    label: 'Templates',
    line1: 'Create · Approve · Send',
    line2: '24 approved',
    line2Class: 'text-[#667085]',
    icon: FileText,
    iconBg: 'bg-blue-50',
    iconColor: 'text-[#2E90FA]',
  },
  {
    label: 'Integrations',
    line1: 'CRM · Shopify · Zapier',
    line2: '5 connected',
    line2Class: 'text-[#667085]',
    icon: Plug,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
  },
];

const STATS = [
  {
    label: 'Messages Sent',
    value: 48291,
    formatter: (n: number) => Math.round(n).toLocaleString('en-IN'),
    deltaText: '18.2%',
    deltaDir: 'up' as const,
    deltaHint: 'vs last week',
    icon: Send,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-[#12B76A]',
  },
  {
    label: 'Open Rate',
    value: 71.4,
    formatter: (n: number) => `${n.toFixed(1)}%`,
    deltaText: '4.1%',
    deltaDir: 'up' as const,
    deltaHint: 'vs last week',
    icon: Eye,
    iconBg: 'bg-violet-50',
    iconColor: 'text-[#7C3AED]',
  },
  {
    label: 'Active Chats (live)',
    value: 38,
    formatter: (n: number) => Math.round(n).toString(),
    deltaText: '2',
    deltaDir: 'down' as const,
    deltaHint: 'from yesterday',
    icon: MessageSquare,
    iconBg: 'bg-orange-50',
    iconColor: 'text-[#F79009]',
    pulse: true,
  },
  {
    label: 'Total Contacts',
    value: 12840,
    formatter: (n: number) => Math.round(n).toLocaleString('en-IN'),
    deltaText: '+142',
    deltaDir: 'up' as const,
    deltaHint: 'new this week',
    icon: Users,
    iconBg: 'bg-blue-50',
    iconColor: 'text-[#2E90FA]',
  },
];

type BroadcastStatus = 'Delivered' | 'Partial' | 'Scheduled' | 'Failed';

const BROADCASTS: { name: string; segment: string; sent: string; readPct: string; status: BroadcastStatus }[] = [
  { name: 'Diwali Sale Offer', segment: 'All Customers', sent: '2,841', readPct: '68%', status: 'Delivered' },
  { name: 'Restock Alert', segment: 'Tagged: Buyers', sent: '1,204', readPct: '74%', status: 'Delivered' },
  { name: 'Feedback Request', segment: 'Inactive Users', sent: '890', readPct: '41%', status: 'Partial' },
  { name: 'New Feature Drop', segment: 'Premium Clients', sent: '430', readPct: '82%', status: 'Scheduled' },
];

const statusClass: Record<BroadcastStatus, string> = {
  Delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Partial: 'bg-orange-50 text-orange-700 ring-orange-200',
  Scheduled: 'bg-blue-50 text-blue-700 ring-blue-200',
  Failed: 'bg-red-50 text-red-700 ring-red-200',
};

export default function DashboardPage() {
  return (
    <div className="flex">
      {/* Center column */}
      <main className="min-w-0 flex-1 px-8 py-6">
        {/* Header row */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-[#101828]">
              Good morning, Sakshay <span className="ml-1">👋</span>
            </h1>
            <p className="mt-0.5 text-[14px] text-[#667085]">
              Here&apos;s what&apos;s happening with your automations today.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-[#EAECF0] bg-white px-3 py-1.5 text-[12px] text-[#475467]">
              <Calendar size={13} className="text-[#98A2B3]" />
              08 May 2026
            </div>
            <button className="flex items-center gap-1.5 rounded-full border border-[#EAECF0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475467] hover:bg-zinc-50">
              Last 7 days <ChevronDown size={13} className="text-[#98A2B3]" />
            </button>
            <button className="flex items-center gap-1.5 rounded-lg border border-[#EAECF0] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475467] hover:bg-zinc-50">
              <Download size={13} /> Export
            </button>
          </div>
        </header>

        {/* Quick actions */}
        <div className="mt-5 -mx-1 overflow-x-auto pb-1">
          <div className="flex gap-3 px-1">
            {QUICK_ACTIONS.map((a) => {
              const Ic = a.icon;
              return (
                <button
                  key={a.label}
                  className="group flex w-[200px] shrink-0 items-start gap-3 rounded-xl border border-[#EAECF0] bg-white px-4 py-3 text-left transition hover:border-[#D0D5DD] hover:shadow-[0_4px_12px_-4px_rgba(16,24,40,0.08)]"
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${a.iconBg}`}>
                    <Ic size={16} className={a.iconColor} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-[#101828]">{a.label}</div>
                    <div className="text-[11px] font-medium text-[#101828]">{a.line1}</div>
                    <div className={`text-[10.5px] ${a.line2Class}`}>{a.line2}</div>
                    {a.extra}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stat cards */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => {
            const Ic = s.icon;
            const deltaUp = s.deltaDir === 'up';
            return (
              <div
                key={s.label}
                className="group rounded-2xl border border-[#EAECF0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(16,24,40,0.18)]"
              >
                <div className="flex items-start justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.iconBg}`}>
                    <Ic size={17} className={s.iconColor} strokeWidth={2} />
                  </div>
                  {s.pulse ? (
                    <span className="relative mt-1 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#12B76A] opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#12B76A]" />
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <CountUp
                    end={s.value}
                    format={s.formatter}
                    className="font-mono text-[32px] font-semibold leading-none tracking-tight text-[#101828]"
                  />
                </div>
                <div className="mt-1.5 text-[12.5px] text-[#667085]">{s.label}</div>
                <div className="mt-3 flex items-center gap-1.5 text-[11.5px]">
                  <span className={`font-semibold ${deltaUp ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {deltaUp ? '▲' : '▼'} {s.deltaText}
                  </span>
                  <span className="text-[#98A2B3]">{s.deltaHint}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Performance chart */}
        <div className="mt-5">
          <PerformanceChart />
        </div>

        {/* Recent broadcasts */}
        <div className="mt-5 rounded-2xl border border-[#EAECF0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between border-b border-[#EAECF0] px-5 py-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[15px] font-semibold tracking-tight text-[#101828]">Recent Broadcasts</h3>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10.5px] font-semibold text-[#475467]">
                Done <span className="font-mono">4 / 6</span>
              </span>
            </div>
            <a href="/dashboard/broadcast" className="flex items-center gap-1 text-[12px] font-semibold text-[#12B76A] hover:text-[#0E9E5C]">
              View all <ArrowUpRight size={13} />
            </a>
          </div>
          <div className="px-2 py-1">
            <div className="grid grid-cols-[1.6fr_1.2fr_0.8fr_0.6fr_0.9fr_0.4fr] gap-4 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-[#98A2B3]">
              <div>Broadcast Name</div>
              <div>Segment</div>
              <div>Sent</div>
              <div>Read</div>
              <div>Status</div>
              <div></div>
            </div>
            <ul className="divide-y divide-[#EAECF0]">
              {BROADCASTS.map((b) => (
                <li
                  key={b.name}
                  className="grid grid-cols-[1.6fr_1.2fr_0.8fr_0.6fr_0.9fr_0.4fr] items-center gap-4 px-3 py-3.5 transition-colors hover:bg-zinc-50"
                >
                  <div className="text-[13px] font-semibold text-[#101828]">{b.name}</div>
                  <div className="text-[12.5px] text-[#667085]">{b.segment}</div>
                  <div className="font-mono text-[12.5px] text-[#101828]">{b.sent}</div>
                  <div className="font-mono text-[12.5px] font-semibold text-[#101828]">{b.readPct}</div>
                  <div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset ${statusClass[b.status]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                      {b.status}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <button className="flex h-7 w-7 items-center justify-center rounded-md text-[#98A2B3] hover:bg-white hover:text-[#101828]">
                      <MoreHorizontal size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="h-6" />
      </main>

      {/* Right rail (xl+ only) */}
      <RightRail />
    </div>
  );
}
