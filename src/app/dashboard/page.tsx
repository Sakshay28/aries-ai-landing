"use client";

import {
  MessageCircle,
  Users,
  Megaphone,
  Activity,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Badge,
  Card,
  ChartCard,
  DataTable,
  MetricCard,
  type Column,
} from "./_components/ui";

/* ─────────────────── Sample data ─────────────────── */
const messagingTrend = [
  { day: "Mon", inbound: 320, outbound: 540 },
  { day: "Tue", inbound: 410, outbound: 620 },
  { day: "Wed", inbound: 380, outbound: 590 },
  { day: "Thu", inbound: 520, outbound: 720 },
  { day: "Fri", inbound: 610, outbound: 810 },
  { day: "Sat", inbound: 480, outbound: 690 },
  { day: "Sun", inbound: 520, outbound: 740 },
];

type Conversation = {
  id: string;
  contact: string;
  channel: "WhatsApp" | "Voice" | "Instagram";
  status: "Open" | "Resolved" | "Awaiting";
  updated: string;
};

const recent: Conversation[] = [
  { id: "1", contact: "Riya Sharma", channel: "WhatsApp", status: "Open", updated: "2m ago" },
  { id: "2", contact: "Aarav Patel", channel: "Voice", status: "Awaiting", updated: "8m ago" },
  { id: "3", contact: "Diya Kumar", channel: "WhatsApp", status: "Resolved", updated: "21m ago" },
  { id: "4", contact: "Karan Mehta", channel: "Instagram", status: "Open", updated: "33m ago" },
  { id: "5", contact: "Sara Iyer", channel: "WhatsApp", status: "Resolved", updated: "1h ago" },
];

const recentColumns: Column<Conversation>[] = [
  { key: "contact", header: "Contact" },
  {
    key: "channel",
    header: "Channel",
    render: (r) => <Badge color="info">{r.channel}</Badge>,
  },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <Badge
        color={
          r.status === "Resolved" ? "success" : r.status === "Awaiting" ? "warning" : "neutral"
        }
      >
        {r.status}
      </Badge>
    ),
  },
  { key: "updated", header: "Updated", align: "right" },
];

/* ─────────────────── Page ─────────────────── */
export default function DashboardOverviewPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back — here's what's happening across your inbox today.
          </p>
        </div>
        <Badge color="info" className="hidden md:inline-flex">
          Last 7 days
        </Badge>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <MetricCard
            label="Conversations"
            value="3,782"
            delta="11.01%"
            trend="up"
            icon={<MessageCircle size={22} />}
            helper="vs. last week"
          />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <MetricCard
            label="New leads"
            value="1,209"
            delta="6.4%"
            trend="up"
            icon={<Users size={22} />}
            helper="vs. last week"
          />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <MetricCard
            label="Broadcasts sent"
            value="48"
            delta="9.05%"
            trend="down"
            icon={<Megaphone size={22} />}
            helper="vs. last week"
          />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <MetricCard
            label="Resolution rate"
            value="92.3%"
            delta="2.1%"
            trend="up"
            icon={<Activity size={22} />}
            helper="vs. last week"
          />
        </div>
      </div>

      {/* Chart + side card */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <ChartCard
          title="Messaging volume"
          subtitle="Inbound vs outbound, last 7 days"
          className="col-span-12 xl:col-span-8"
          actions={
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-500" /> Outbound
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Inbound
              </span>
            </div>
          }
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={messagingTrend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#9CA3AF", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#9CA3AF", fontSize: 12 }}
                  width={32}
                />
                <Tooltip
                  cursor={{ stroke: "#E5E7EB", strokeWidth: 1 }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="outbound"
                  stroke="#6366F1"
                  strokeWidth={2}
                  fill="url(#g-out)"
                />
                <Area
                  type="monotone"
                  dataKey="inbound"
                  stroke="#10B981"
                  strokeWidth={2}
                  fill="url(#g-in)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <Card className="col-span-12 xl:col-span-4">
          <h3 className="text-base font-semibold text-gray-900">Today at a glance</h3>
          <p className="mt-0.5 text-sm text-gray-500">Live operational signals</p>

          <ul className="mt-5 space-y-4">
            <li className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Active agents</span>
              <span className="text-sm font-semibold text-gray-900">12</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Avg response time</span>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                47s
                <span className="inline-flex items-center text-emerald-600">
                  <ArrowUpRight size={14} />
                </span>
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Queued conversations</span>
              <span className="text-sm font-semibold text-gray-900">28</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-sm text-gray-600">SLA breaches</span>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                2
                <span className="inline-flex items-center text-rose-600">
                  <ArrowDownRight size={14} />
                </span>
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Voice calls today</span>
              <span className="text-sm font-semibold text-gray-900">86</span>
            </li>
          </ul>
        </Card>
      </div>

      {/* Recent table */}
      <ChartCard
        title="Recent conversations"
        subtitle="Most recently updated threads across all channels"
        actions={
          <a
            href="/dashboard/conversations"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            View all →
          </a>
        }
      >
        <DataTable<Conversation>
          columns={recentColumns}
          rows={recent}
          empty="No recent conversations"
        />
      </ChartCard>
    </div>
  );
}
