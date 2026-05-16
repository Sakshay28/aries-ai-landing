"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card className="border-border bg-card shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground">Response Metrics</CardTitle>
            <CardDescription className="text-muted-foreground">Conversations and resolutions over time</CardDescription>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-muted-foreground">Responses</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary/50" />
              <span className="text-muted-foreground">Resolved</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis 
              dataKey="time" 
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
            <Line 
              type="monotone" 
              dataKey="responses" 
              stroke="var(--color-primary)" 
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line 
              type="monotone" 
              dataKey="resolved" 
              stroke="var(--color-primary)" 
              strokeWidth={2}
              strokeOpacity={0.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
