"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const agents = [
  { name: "Codex", conversations: 342, resolved: 298, satisfaction: 94 },
  { name: "Cursor", conversations: 289, resolved: 256, satisfaction: 91 },
  { name: "Claude", conversations: 267, resolved: 245, satisfaction: 96 },
  { name: "GPT-4", conversations: 198, resolved: 176, satisfaction: 88 },
  { name: "Gemini", conversations: 156, resolved: 142, satisfaction: 85 },
];

export function AgentPerformance() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Agent Performance</CardTitle>
            <CardDescription>Conversations handled and satisfaction scores</CardDescription>
          </div>
          <Badge variant="outline">Last 24h</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Chart */}
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agents} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis
                  dataKey="name"
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
                  cursor={{ fill: "#F3F4F6" }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12, color: "#6B7280" }}
                />
                <Bar dataKey="conversations" fill="#6366F1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" fill="#6366F1" fillOpacity={0.55} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Agent
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Conversations
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Resolved
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Satisfaction
                  </th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr
                    key={a.name}
                    className="border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{a.name} Agent</td>
                    <td className="px-4 py-3 text-right text-gray-700">{a.conversations}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{a.resolved}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-indigo-600 transition-all"
                            style={{ width: `${a.satisfaction}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-medium text-gray-900">
                          {a.satisfaction}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
