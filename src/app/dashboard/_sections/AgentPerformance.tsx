"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const agentData = [
  { name: "Codex Agent", conversations: 342, resolved: 298, satisfaction: 94 },
  { name: "Cursor Agent", conversations: 289, resolved: 256, satisfaction: 91 },
  { name: "Claude Agent", conversations: 267, resolved: 245, satisfaction: 96 },
  { name: "GPT-4 Agent", conversations: 198, resolved: 176, satisfaction: 88 },
  { name: "Gemini Agent", conversations: 156, resolved: 142, satisfaction: 85 },
];

export function AgentPerformance() {
  return (
    <Card className="border-border bg-card shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground">Agent Performance</CardTitle>
            <CardDescription className="text-muted-foreground">Conversations handled and satisfaction scores</CardDescription>
          </div>
          <div className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-foreground">
            Last 24h
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Chart */}
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={agentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis 
                dataKey="name" 
                stroke="var(--color-muted-foreground)"
                style={{ fontSize: "12px" }}
              />
              <YAxis 
                stroke="var(--color-muted-foreground)"
                style={{ fontSize: "12px" }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "var(--color-foreground)" }}
              />
              <Legend />
              <Bar dataKey="conversations" fill="var(--color-primary)" />
              <Bar dataKey="resolved" fill="var(--color-primary)" opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>

          {/* Agent Details Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Agent</th>
                  <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Conversations</th>
                  <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Resolved</th>
                  <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Satisfaction</th>
                </tr>
              </thead>
              <tbody>
                {agentData.map((agent) => (
                  <tr key={agent.name} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4 font-medium text-foreground">{agent.name}</td>
                    <td className="text-right py-3 px-4 text-foreground">{agent.conversations}</td>
                    <td className="text-right py-3 px-4 text-foreground">{agent.resolved}</td>
                    <td className="text-right py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${agent.satisfaction}%` }}
                          />
                        </div>
                        <span className="text-foreground font-medium">{agent.satisfaction}%</span>
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
