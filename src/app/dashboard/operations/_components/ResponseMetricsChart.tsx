"use client";

import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartDataPoint {
  date: string;
  inbound: number;
  outbound: number;
  ai: number;
}

export function ResponseMetricsChart() {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/dashboard/analytics");
        if (!res.ok) throw new Error("Failed to load analytics");
        const json = await res.json();
        if (json.success && json.data.volumeData) {
          setData(json.data.volumeData);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <Card className="border-border bg-card shadow-none">
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <Skeleton className="h-full w-full rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (error || data.length === 0) {
    return (
      <Card className="border-border bg-card shadow-none">
        <CardContent className="h-[380px] flex flex-col items-center justify-center space-y-3">
          <p className="text-sm text-muted-foreground">Analytics data is currently unavailable.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card shadow-none">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-foreground text-lg">Message Volume</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Daily incoming vs outgoing and AI automation metrics (Last 7 days)
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">Inbound</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
              <span className="text-muted-foreground">Outbound</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">AI Assisted</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="var(--muted-foreground)"
                style={{ fontSize: "11px", fontWeight: 500 }}
                dy={10}
              />
              <YAxis 
                stroke="var(--muted-foreground)"
                style={{ fontSize: "11px", fontWeight: 500 }}
                dx={-5}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                }}
                labelClassName="text-xs font-semibold text-foreground"
                itemStyle={{ fontSize: "12px", padding: "2px 0" }}
              />
              <Line 
                type="monotone" 
                dataKey="inbound" 
                stroke="#3B82F6" // Blue
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 1.5, fill: "var(--card)" }}
                activeDot={{ r: 5 }}
                name="Inbound Messages"
              />
              <Line 
                type="monotone" 
                dataKey="outbound" 
                stroke="#818CF8" // Indigo
                strokeWidth={2}
                dot={{ r: 2, strokeWidth: 1, fill: "var(--card)" }}
                activeDot={{ r: 4 }}
                name="Outbound Messages"
              />
              <Line 
                type="monotone" 
                dataKey="ai" 
                stroke="#10B981" // Emerald Green for AI
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 2, strokeWidth: 1, fill: "var(--card)" }}
                activeDot={{ r: 4 }}
                name="AI Automated Replies"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
