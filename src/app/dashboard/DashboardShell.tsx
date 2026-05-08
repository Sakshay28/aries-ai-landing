'use client';

import {
  LayoutDashboard,
  Grid2x2,
  TrendingUp,
  BadgeDollarSign,
  Wallet,
  BookOpen,
  Settings,
  ChevronRight,
  CircleHelp,
  MonitorSmartphone,
  MessageCircle,
  MessageSquareDot,
  CircleCheck,
  Clock,
  CreditCard,
  BadgeCheck,
  Archive,
} from 'lucide-react';

export function DashboardShell(_props: { children?: React.ReactNode }) {
  void _props;
  return (
    <div className="flex h-screen bg-indigo-50">
      {/* SIDEBAR */}
      <Sidebar />

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* BANNER */}
        <Banner />

        {/* PAGE CONTENT */}
        <div className="flex-1 overflow-auto">
          <div className="p-8">
            {/* HEADER - Help Icon + Avatar */}
            <div className="flex justify-end items-center gap-3 mb-8">
              <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-50">
                <CircleHelp size={18} />
              </div>
              <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-sm">
                A
              </div>
            </div>

            {/* PAGE TITLE */}
            <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

            {/* STATS GRID - 4 COLUMNS */}
            <div className="grid grid-cols-4 gap-5 mb-10">
              <StatCard
                label="WABAs"
                value="2"
                time="All Time"
                icon={<MonitorSmartphone size={16} />}
              />
              <StatCard
                label="Total conversations"
                value="0"
                time="All Time"
                icon={<MessageCircle size={16} />}
              />
              <StatCard
                label="Total Paid Messages"
                value="0"
                time="All Time"
                icon={<MessageSquareDot size={16} />}
              />
              <StatCard
                label="New live apps"
                value="0"
                time="Current Month"
                icon={<CircleCheck size={16} />}
              />
              <StatCard
                label="New sandbox apps"
                value="2"
                time="Current Month"
                icon={<Clock size={16} />}
              />
              <StatCard
                label="Total Commission ($)"
                value="0"
                time="All Time"
                icon={<CreditCard size={16} />}
              />
              <StatCard
                label="Commission Paid ($)"
                value="0"
                time="All Time"
                icon={<BadgeCheck size={16} />}
              />
              <StatCard
                label="Commission Pending ($)"
                value="0"
                time="All Time"
                icon={<Archive size={16} />}
              />
            </div>

            {/* APP PERFORMANCE SECTION */}
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-5">App performance</h2>

              <div className="flex gap-5">
                {/* LEFT PANEL - 60% */}
                <div className="flex-[1.6] bg-white rounded-xl border border-gray-200 p-6 min-h-80">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">
                    Total messaging volume
                  </h3>
                  <div className="h-64 flex items-center justify-center">
                    <span className="text-sm text-gray-400">No data to show</span>
                  </div>
                </div>

                {/* RIGHT PANEL - 40% */}
                <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6 min-h-80">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Top 10 apps by messaging volume
                    </h3>
                    <button className="border border-gray-200 rounded px-3 py-1.5 text-xs text-gray-600 bg-white hover:bg-gray-50 transition-colors">
                      Current M... ▾
                    </button>
                  </div>

                  {/* TABLE */}
                  <div className="space-y-2">
                    {/* TABLE HEADER */}
                    <div className="grid grid-cols-2 gap-4 bg-indigo-50 px-4 py-3 rounded-lg">
                      <div className="text-xs font-semibold text-indigo-700">App Name</div>
                      <div className="text-xs font-semibold text-indigo-700 text-right">
                        Message volume
                      </div>
                    </div>

                    {/* EMPTY STATE */}
                    <div className="py-12 text-center">
                      <span className="text-sm text-gray-400">
                        There are no records matching your request
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * STAT CARD COMPONENT
 */
function StatCard({
  label,
  value,
  time,
  icon,
}: {
  label: string;
  value: string;
  time: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors">
      {/* TOP ROW: Label + Icon */}
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </span>
        <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0">
          {icon}
        </div>
      </div>

      {/* BOTTOM ROW: Value + Time */}
      <div className="flex justify-between items-end">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
        <span className="text-xs text-gray-400">{time}</span>
      </div>
    </div>
  );
}

/**
 * SIDEBAR COMPONENT
 */
function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col justify-between p-6">
      {/* TOP SECTION */}
      <div>
        {/* LOGO */}
        <div className="flex items-center gap-2 mb-8">
          <LogoMark />
          <div className="text-gray-900 font-bold text-xl leading-tight">
            <div>Aries</div>
            <div className="text-indigo-600 -mt-1">AI</div>
          </div>
        </div>

        {/* NAV ITEMS */}
        <nav className="flex flex-col gap-2">
          <NavItem
            label="Dashboard"
            icon={<LayoutDashboard size={16} />}
            active={true}
          />
          <NavItem label="Apps" icon={<Grid2x2 size={16} />} active={false} />
          <NavItem
            label="Analytics"
            icon={<TrendingUp size={16} />}
            active={false}
            hasChevron={true}
          />
          <NavItem
            label="Commission"
            icon={<BadgeDollarSign size={16} />}
            active={false}
          />
          <NavItem label="Wallet" icon={<Wallet size={16} />} active={false} />
          <NavItem
            label="Resources"
            icon={<BookOpen size={16} />}
            active={false}
            hasChevron={true}
          />
          <NavItem
            label="Settings"
            icon={<Settings size={16} />}
            active={false}
          />
        </nav>
      </div>

      {/* BOTTOM AVATAR */}
      <div className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-sm cursor-pointer hover:bg-violet-700 transition-colors">
        A
      </div>
    </aside>
  );
}

/**
 * NAV ITEM COMPONENT
 */
function NavItem({
  label,
  icon,
  active = false,
  hasChevron = false,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  hasChevron?: boolean;
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm font-medium transition-colors',
        active ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50',
      ].join(' ')}
    >
      <span className={active ? 'text-indigo-600' : 'text-gray-400'}>{icon}</span>
      <span className="flex-1">{label}</span>
      {hasChevron && (
        <ChevronRight
          size={16}
          className={active ? 'text-indigo-600' : 'text-gray-400'}
        />
      )}
    </div>
  );
}

/**
 * LOGO MARK - Two overlapping indigo squares
 */
function LogoMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="4" width="14" height="14" rx="2" fill="#6366F1" />
      <rect x="14" y="14" width="14" height="14" rx="2" fill="#6366F1" opacity="0.6" />
    </svg>
  );
}

/**
 * BANNER COMPONENT
 */
function Banner() {
  return (
    <div className="w-full h-12 bg-purple-50 border-b border-gray-200 flex items-center justify-center px-4">
      <span className="text-sm text-violet-800 text-center">
        Aries AI clients can now add new WhatsApp numbers and resume WABA onboarding w.e.f 12th May 2025.{' '}
        <a href="#" className="underline text-violet-600 hover:text-violet-700 font-medium">
          Read guide
        </a>
      </span>
    </div>
  );
}
