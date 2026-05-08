"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const data = [
  { time: "00:00", responses: 240, resolved: 180 },
  { time: "04:00", responses: 320, resolved: 240 },
  { time: "08:00", responses: 480, resolved: 360 },
  { time: "12:00", responses: 620, resolved: 480 },
  { time: "16:00", responses: 540, resolved: 420 },
  { time: "20:00", responses: 380, resolved: 280 },
  { time: "24:00", responses: 290, resolved: 220 },
];

export function ResponseMetrics() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Response Metrics</CardTitle>
            <CardDescription>Conversations and resolutions over time</CardDescription>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-indigo-600" />
              <span className="text-gray-500">Responses</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-indigo-600/50" />
              <span className="text-gray-500">Resolved</span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#9CA3AF"
                style={{ fontSize: "12px" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                stroke="#9CA3AF"
                style={{ fontSize: "12px" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #E5E7EB",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#111827", fontWeight: 600 }}
              />
              <Line
                type="monotone"
                dataKey="responses"
                stroke="#6366F1"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="resolved"
                stroke="#6366F1"
                strokeOpacity={0.5}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
