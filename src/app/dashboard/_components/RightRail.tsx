"use client";

import { useEffect, useState } from 'react';
import { Paperclip, Smile, Send, ArrowRight } from 'lucide-react';

const DELIVERY_STATS = [
  { label: 'Messages Sent', value: 91.4, color: 'bg-[#12B76A]' },
  { label: 'Read Rate', value: 71.4, color: 'bg-[#7C3AED]' },
  { label: 'Reply Rate', value: 28.6, color: 'bg-[#2E90FA]' },
  { label: 'Click-through', value: 14.2, color: 'bg-[#F79009]' },
  { label: 'Failed', value: 2.1, color: 'bg-[#F04438]/70' },
];

const AGENTS = [
  { name: 'Sakshay A.', status: 'Available', dot: 'bg-[#12B76A]' },
  { name: 'Kritika M.', status: 'Available', dot: 'bg-[#12B76A]' },
  { name: 'Rohan S.', status: 'Busy', dot: 'bg-[#F79009]' },
  { name: 'Priya K.', status: 'Away', dot: 'bg-[#F04438]' },
  { name: 'Dev T.', status: 'Offline', dot: 'bg-zinc-400' },
];

const SEGMENTS = [
  { label: 'All Customers', count: '12,840', tone: 'gray' },
  { label: 'Premium Clients', count: '430', tone: 'purple' },
  { label: 'New This Week', count: '142', tone: 'green' },
  { label: 'Tagged: Buyers', count: '1,204', tone: 'gray' },
  { label: 'Inactive Users', count: '890', tone: 'orange' },
  { label: 'Opted Out', count: '67', tone: 'red' },
];

const segmentToneClass: Record<string, string> = {
  gray: 'bg-zinc-100 text-zinc-700',
  purple: 'bg-violet-50 text-violet-700',
  green: 'bg-emerald-50 text-emerald-700',
  orange: 'bg-orange-50 text-orange-700',
  red: 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-200',
};

export function RightRail() {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <aside className="hidden w-[300px] shrink-0 border-l border-[#EAECF0] bg-white xl:flex xl:flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {/* Account Health */}
        <section>
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold tracking-tight text-[#101828]">Account Health</h3>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#12B76A] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#12B76A]" />
            </span>
          </div>

          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-[#667085]">API Status</span>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-[#12B76A]" /> Live
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[#667085]">Quality Rating</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">High</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-[#12B76A] transition-all duration-1000" style={{ width: animated ? '85%' : '0%' }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[#667085]">Sending Limit</span>
                <span className="font-mono text-[11px] text-[#101828]">4,200 / 5,000</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-[#F79009] transition-all duration-1000" style={{ width: animated ? '84%' : '0%' }} />
              </div>
              <div className="mt-1 text-[10.5px] text-[#667085]">today</div>
            </div>
          </div>
        </section>

        {/* Delivery Stats */}
        <section>
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold tracking-tight text-[#101828]">Delivery Stats</h3>
            <span className="text-[10.5px] text-[#98A2B3]">Last 7 days</span>
          </div>
          <div className="mt-3 space-y-2.5">
            {DELIVERY_STATS.map((s, i) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-[#475467]">{s.label}</span>
                  <span className="font-mono text-[11.5px] font-semibold text-[#101828]">{s.value.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={`h-full rounded-full ${s.color} transition-all`}
                    style={{ width: animated ? `${s.value}%` : '0%', transitionDuration: `${800 + i * 100}ms`, transitionDelay: `${i * 60}ms` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Agents Online */}
        <section>
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-semibold tracking-tight text-[#101828]">Agents Online</h3>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10.5px] font-semibold text-[#475467]">3 / 5</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {AGENTS.map((a) => (
              <div key={a.name} className="flex items-center gap-2.5 rounded-xl bg-zinc-50 px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[10.5px] font-bold text-[#475467] ring-1 ring-[#EAECF0]">
                  {a.name.charAt(0)}
                </div>
                <span className="flex-1 truncate text-[12px] font-medium text-[#101828]">{a.name}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
                <span className="text-[10.5px] text-[#667085]">{a.status}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Last Broadcast */}
        <section>
          <h3 className="text-[13px] font-semibold tracking-tight text-[#101828]">Last Broadcast</h3>
          <div className="mt-3 rounded-2xl border border-[#EAECF0] bg-white p-4">
            <div className="text-[13px] font-semibold text-[#101828]">Diwali Sale Offer</div>
            <div className="mt-0.5 text-[11px] text-[#667085]">2,841 contacts · WhatsApp</div>
            <div className="text-[11px] text-[#667085]">06 May 2026, 10:30 AM</div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-[#667085]">Read</span>
                <span className="font-mono font-semibold text-[#101828]">68%</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-[#7C3AED] transition-all duration-1000" style={{ width: animated ? '68%' : '0%' }} />
              </div>
              <div className="mt-1.5 text-[10.5px] text-[#667085]">1,932 read · 909 not opened</div>
            </div>
            <a href="#" className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#12B76A] hover:text-[#0E9E5C]">
              View Report <ArrowRight size={13} />
            </a>
          </div>
        </section>

        {/* Segments */}
        <section>
          <h3 className="text-[13px] font-semibold tracking-tight text-[#101828]">Segments</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SEGMENTS.map((s) => (
              <span
                key={s.label}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${segmentToneClass[s.tone]}`}
              >
                {s.label}
                <span className="font-mono text-[10.5px] opacity-80">{s.count}</span>
              </span>
            ))}
          </div>
        </section>
      </div>

      {/* Composer stub */}
      <div className="border-t border-[#EAECF0] p-3">
        <div className="flex items-center gap-1.5 rounded-full border border-[#EAECF0] bg-white px-2.5 py-1.5 focus-within:border-[#D0D5DD]">
          <button className="text-[#98A2B3] hover:text-[#475467]">
            <Paperclip size={15} />
          </button>
          <input
            placeholder="Write a broadcast…"
            className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#98A2B3]"
          />
          <button className="text-[#98A2B3] hover:text-[#475467]">
            <Smile size={15} />
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded-full bg-[#12B76A] text-white shadow-[0_1px_2px_rgba(16,24,40,0.1)] hover:bg-[#0E9E5C]">
            <Send size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
