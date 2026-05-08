import { StatCard } from './_components/StatCard';

const ICONS = {
  users: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  ),
  msg: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  flow: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M9 6h7a3 3 0 0 1 3 3v6" />
    </svg>
  ),
  rupee: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12" />
      <path d="M6 8h12" />
      <path d="M6 13l8.5 8" />
      <path d="M6 13h3a5 5 0 0 0 0-10" />
    </svg>
  ),
};

const RECENT = [
  { name: 'Priya Sharma', channel: 'WhatsApp', time: '2 min ago', status: 'New lead', tone: 'emerald' },
  { name: 'Rohan Mehta', channel: 'Instagram', time: '14 min ago', status: 'Replied', tone: 'sky' },
  { name: 'Anjali Verma', channel: 'WhatsApp', time: '1 hr ago', status: 'Qualified', tone: 'violet' },
  { name: 'Karan Singh', channel: 'WhatsApp', time: '3 hr ago', status: 'Follow-up', tone: 'amber' },
];

const toneClass: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Leads" value="1,284" delta="8.2%" trend="up" hint="vs last week" icon={ICONS.users} />
        <StatCard label="Conversations" value="3,672" delta="12.4%" trend="up" hint="vs last week" icon={ICONS.msg} />
        <StatCard label="Active Workflows" value="14" delta="2" trend="up" hint="new this week" icon={ICONS.flow} />
        <StatCard label="Revenue" value="₹2.41L" delta="3.1%" trend="down" hint="vs last week" icon={ICONS.rupee} />
      </div>

      {/* Two-column: activity + quick actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent activity */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:col-span-2">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-zinc-900">Recent activity</h3>
              <p className="text-xs text-zinc-500">Latest leads across channels</p>
            </div>
            <button className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              View all
            </button>
          </div>
          <ul className="divide-y divide-zinc-100">
            {RECENT.map((r) => (
              <li key={r.name} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-zinc-100 to-zinc-200 text-xs font-semibold text-zinc-700">
                  {r.name.split(' ').map((p) => p[0]).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-900">{r.name}</div>
                  <div className="text-xs text-zinc-500">{r.channel} · {r.time}</div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${toneClass[r.tone]}`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-900">Quick actions</h3>
          <p className="text-xs text-zinc-500">Common operator tasks</p>
          <div className="mt-4 space-y-2">
            {[
              { label: 'Send broadcast', desc: 'WhatsApp / Instagram', href: '/dashboard/broadcast' },
              { label: 'Create template', desc: 'Reply with structure', href: '/dashboard/templates' },
              { label: 'Connect WhatsApp', desc: 'Gupshup BSP', href: '/dashboard/whatsapp' },
              { label: 'View leads', desc: 'Pipeline & filters', href: '/dashboard/leads' },
            ].map((a) => (
              <a
                key={a.href}
                href={a.href}
                className="group flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:border-zinc-300 hover:bg-zinc-50"
              >
                <div>
                  <div className="font-medium text-zinc-900">{a.label}</div>
                  <div className="text-xs text-zinc-500">{a.desc}</div>
                </div>
                <span className="text-zinc-400 group-hover:text-zinc-700">→</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Channel performance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[
          { name: 'WhatsApp', value: '2,841', share: 78, color: 'bg-emerald-500' },
          { name: 'Instagram', value: '831', share: 22, color: 'bg-violet-500' },
        ].map((c) => (
          <div key={c.name} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold tracking-tight text-zinc-900">{c.name}</h3>
              <span className="text-2xl font-semibold tracking-tight text-zinc-900">{c.value}</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div className={`h-full ${c.color} rounded-full transition-all`} style={{ width: `${c.share}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
              <span>{c.share}% of conversations</span>
              <span className="text-emerald-600 font-semibold">↑ 6.4%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
