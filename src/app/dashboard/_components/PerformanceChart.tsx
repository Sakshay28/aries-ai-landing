"use client";

import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const SERIES = {
  '7D': [
    { date: '01 May', sent: 5840, read: 4180 },
    { date: '02 May', sent: 6120, read: 4400 },
    { date: '03 May', sent: 7240, read: 5180 },
    { date: '04 May', sent: 6890, read: 4980 },
    { date: '05 May', sent: 7820, read: 5610 },
    { date: '06 May', sent: 8540, read: 6120 },
    { date: '07 May', sent: 7960, read: 5680 },
    { date: '08 May', sent: 9120, read: 6520 },
  ],
  '14D': [
    { date: '25 Apr', sent: 4220, read: 3010 },
    { date: '26 Apr', sent: 4640, read: 3290 },
    { date: '27 Apr', sent: 5180, read: 3620 },
    { date: '28 Apr', sent: 4980, read: 3490 },
    { date: '29 Apr', sent: 5320, read: 3780 },
    { date: '30 Apr', sent: 5870, read: 4140 },
    { date: '01 May', sent: 5840, read: 4180 },
    { date: '02 May', sent: 6120, read: 4400 },
    { date: '03 May', sent: 7240, read: 5180 },
    { date: '04 May', sent: 6890, read: 4980 },
    { date: '05 May', sent: 7820, read: 5610 },
    { date: '06 May', sent: 8540, read: 6120 },
    { date: '07 May', sent: 7960, read: 5680 },
    { date: '08 May', sent: 9120, read: 6520 },
  ],
  '30D': [
    { date: '09 Apr', sent: 3210, read: 2240 },
    { date: '11 Apr', sent: 3480, read: 2440 },
    { date: '13 Apr', sent: 3720, read: 2610 },
    { date: '15 Apr', sent: 4010, read: 2820 },
    { date: '17 Apr', sent: 4180, read: 2950 },
    { date: '19 Apr', sent: 4420, read: 3110 },
    { date: '21 Apr', sent: 4630, read: 3260 },
    { date: '23 Apr', sent: 4180, read: 2940 },
    { date: '25 Apr', sent: 4220, read: 3010 },
    { date: '27 Apr', sent: 5180, read: 3620 },
    { date: '29 Apr', sent: 5320, read: 3780 },
    { date: '01 May', sent: 5840, read: 4180 },
    { date: '03 May', sent: 7240, read: 5180 },
    { date: '05 May', sent: 7820, read: 5610 },
    { date: '07 May', sent: 7960, read: 5680 },
    { date: '08 May', sent: 9120, read: 6520 },
  ],
};

type RangeKey = keyof typeof SERIES;
const RANGES: RangeKey[] = ['7D', '14D', '30D'];

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  payload: { date: string; sent: number; read: number };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl bg-[#1D2939] px-3.5 py-2.5 shadow-xl">
      <div className="text-[11.5px] font-semibold text-white">{p.date}</div>
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#12B76A]" />
          <span className="text-[#D0D5DD]">Messages Sent</span>
          <span className="ml-auto font-mono font-semibold text-white">{p.sent.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />
          <span className="text-[#D0D5DD]">Read</span>
          <span className="ml-auto font-mono font-semibold text-white">{p.read.toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>
  );
}

export function PerformanceChart() {
  const [range, setRange] = useState<RangeKey>('7D');
  const data = SERIES[range];

  return (
    <div className="rounded-2xl border border-[#EAECF0] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-[#101828]">Message Performance</h3>
          <p className="text-[11.5px] text-[#667085]">Sent vs read across selected window</p>
        </div>
        <div className="relative flex items-center rounded-full bg-zinc-100 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={[
                'relative z-10 rounded-full px-3 py-1 text-[11.5px] font-semibold transition',
                range === r ? 'bg-[#12B76A] text-white shadow-sm' : 'text-[#475467] hover:text-[#101828]',
              ].join(' ')}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#12B76A" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#12B76A" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gRead" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#EAECF0" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#667085', fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#667085', fontSize: 11 }}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#D0D5DD', strokeDasharray: '3 3' }} />
            <Area
              type="monotone"
              dataKey="sent"
              stroke="#12B76A"
              strokeWidth={2.2}
              fill="url(#gSent)"
              activeDot={{ r: 4, fill: '#12B76A', stroke: '#fff', strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="read"
              stroke="#7C3AED"
              strokeWidth={2.2}
              fill="url(#gRead)"
              activeDot={{ r: 4, fill: '#7C3AED', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
