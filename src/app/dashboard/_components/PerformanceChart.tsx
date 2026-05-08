"use client";

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

const DATA = [
  { day: '01', thisMonth: 5.5, lastMonth: 5.0 },
  { day: '02', thisMonth: 6.0, lastMonth: 4.6 },
  { day: '03', thisMonth: 7.0, lastMonth: 6.0 },
  { day: '04', thisMonth: 6.4, lastMonth: 5.2 },
  { day: '05', thisMonth: 7.2, lastMonth: 4.4 },
  { day: '06', thisMonth: 8.1, lastMonth: 4.0 },
  { day: '07', thisMonth: 7.6, lastMonth: 3.4 },
];

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  payload: { day: string; thisMonth: number; lastMonth: number };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-2xl bg-[#0F1626] px-4 py-3 shadow-2xl">
      <div className="text-[12.5px] font-semibold text-white">{`${p.day} May 2023`}</div>
      <div className="mt-2 space-y-1.5 min-w-[140px]">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 rounded-full bg-[#5B8DEF]" />
          <span className="text-[#D0D5DD]">This month</span>
          <span className="ml-auto font-semibold text-white">{p.thisMonth.toFixed(0)}h</span>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
          <span className="text-[#D0D5DD]">Last month</span>
          <span className="ml-auto font-semibold text-white">{p.lastMonth.toFixed(0)}h</span>
        </div>
      </div>
    </div>
  );
}

export function PerformanceChart() {
  const [activeDay] = useState('03');

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-tight text-[#101828]">Performance</h2>
        <button className="flex items-center gap-1.5 rounded-full border border-[#EAECF0] bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-[#475467] hover:bg-zinc-50">
          01-07 May <ChevronDown size={13} className="text-[#98A2B3]" />
        </button>
      </div>

      <div className="mt-4 h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={DATA} margin={{ top: 20, right: 16, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#F1F2F4" />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#98A2B3', fontSize: 12 }}
              dy={6}
            />
            <YAxis
              ticks={[0, 2, 6, 8, 12]}
              domain={[0, 12]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#98A2B3', fontSize: 11 }}
              tickFormatter={(v) => `${v}h`}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={false}
            />
            <ReferenceLine x={activeDay} stroke="#D0D5DD" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="thisMonth"
              stroke="#5B8DEF"
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 5, fill: '#5B8DEF', stroke: '#fff', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="lastMonth"
              stroke="#F59E0B"
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 5, fill: '#F59E0B', stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
