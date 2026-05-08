"use client";

import {
  Calendar,
  ThumbsUp,
  Clock,
  TrendingUp,
  ChevronDown,
  MoreHorizontal,
  Eye,
  Search,
  Terminal,
} from 'lucide-react';
import { PerformanceChart } from './_components/PerformanceChart';
import { RightRail } from './_components/RightRail';

const STATS = [
  {
    icon: ThumbsUp,
    label: 'Finished',
    value: '18',
    delta: '+8 tasks',
    deltaTone: 'green' as const,
  },
  {
    icon: Clock,
    label: 'Tracked',
    value: '31h',
    delta: '-6 hours',
    deltaTone: 'red' as const,
  },
  {
    icon: TrendingUp,
    label: 'Efficiency',
    value: '93%',
    delta: '+12%',
    deltaTone: 'green' as const,
  },
];

const TASKS: {
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
  title: string;
  status: 'In progress' | 'On hold' | 'Done';
  hours: string;
}[] = [
  {
    icon: Eye,
    iconBg: 'bg-[#E5EDFB]',
    iconColor: 'text-[#5B8DEF]',
    title: 'Product Review for UI8 Market',
    status: 'In progress',
    hours: '4h',
  },
  {
    icon: Search,
    iconBg: 'bg-[#FEF3C7]',
    iconColor: 'text-[#F59E0B]',
    title: 'UX Research for Product',
    status: 'On hold',
    hours: '8h',
  },
  {
    icon: Terminal,
    iconBg: 'bg-[#E5F0FB]',
    iconColor: 'text-[#5B8DEF]',
    title: 'App design and development',
    status: 'Done',
    hours: '32h',
  },
];

const statusDot: Record<'In progress' | 'On hold' | 'Done', string> = {
  'In progress': 'bg-[#F59E0B]',
  'On hold': 'bg-[#5B8DEF]',
  Done: 'bg-[#12B76A]',
};

export default function DashboardPage() {
  return (
    <div className="flex">
      {/* Center column */}
      <main className="min-w-0 flex-1 px-10 py-7">
        {/* Header */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight text-[#101828] leading-tight">
              Hello, Margaret
            </h1>
            <p className="mt-1.5 text-[13.5px] text-[#667085]">
              Track team progress here. You almost reach a goal!
            </p>
          </div>
          <div className="flex items-center gap-2.5 text-[12.5px] text-[#475467]">
            <span>16 May, 2023</span>
            <button
              title="Calendar"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#EEF0F4] bg-white text-[#475467] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:bg-zinc-50"
            >
              <Calendar size={15} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        {/* Stats row (no outer border, inline with dividers) */}
        <div className="mt-7 flex items-stretch border-y border-[#EEF0F4]">
          {STATS.map((s, i) => {
            const Ic = s.icon;
            const deltaColor = s.deltaTone === 'green' ? 'text-[#12B76A]' : 'text-[#F04438]';
            const arrowChar = s.deltaTone === 'green' ? '▼' : '▲';
            return (
              <div
                key={s.label}
                className={[
                  'flex flex-1 items-center gap-3 px-2 py-4',
                  i < STATS.length - 1 ? 'border-r border-[#EEF0F4]' : '',
                ].join(' ')}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F2F3F7] text-[#475467]">
                  <Ic size={18} strokeWidth={1.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-[#667085]">{s.label}</div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="text-[22px] font-bold tracking-tight text-[#101828] leading-none">
                      {s.value}
                    </span>
                    <span className={`text-[11.5px] font-semibold ${deltaColor}`}>
                      <span className="mr-0.5">{arrowChar}</span>
                      {s.delta}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Performance */}
        <div className="mt-7">
          <PerformanceChart />
        </div>

        {/* Current tasks */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h2 className="text-[18px] font-bold tracking-tight text-[#101828]">Current Tasks</h2>
              <span className="text-[12px] text-[#98A2B3]">Done <span className="font-semibold text-[#475467]">30%</span></span>
            </div>
            <button className="flex items-center gap-1.5 rounded-full border border-[#EAECF0] bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-[#475467] hover:bg-zinc-50">
              Week <ChevronDown size={13} className="text-[#98A2B3]" />
            </button>
          </div>

          <ul className="mt-4 divide-y divide-[#EEF0F4]">
            {TASKS.map((t) => {
              const Ic = t.icon;
              return (
                <li
                  key={t.title}
                  className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-5 py-4"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${t.iconBg} ${t.iconColor}`}>
                    <Ic size={16} strokeWidth={1.8} />
                  </div>
                  <div className="text-[13.5px] font-semibold text-[#101828]">{t.title}</div>
                  <div className="flex items-center gap-2 text-[12.5px] text-[#475467]">
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDot[t.status]}`} />
                    <span>{t.status}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[12.5px] text-[#475467]">
                    <Clock size={13} className="text-[#98A2B3]" strokeWidth={1.8} />
                    <span>{t.hours}</span>
                  </div>
                  <button className="flex h-7 w-7 items-center justify-center rounded-md text-[#98A2B3] hover:bg-zinc-100 hover:text-[#101828]">
                    <MoreHorizontal size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="h-6" />
      </main>

      {/* Right rail */}
      <RightRail />
    </div>
  );
}
