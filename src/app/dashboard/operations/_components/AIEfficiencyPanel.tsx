"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Target, Zap, Flame, Compass, Snowflake } from "lucide-react";

interface AnalyticsSummary {
  totalMessages: number;
  totalLeads: number;
  aiHandled: number;
}

interface PipelineItem {
  name: string;
  value: number;
  color: string;
}

interface AnalyticsData {
  pipelineData: PipelineItem[];
  summary: AnalyticsSummary;
}

export function AIEfficiencyPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadAnalytics() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/dashboard/analytics");
        if (!res.ok) throw new Error("Failed to load analytics");
        const json = await res.json();
        if (json.success && json.data) {
          setData({
            pipelineData: json.data.pipelineData,
            summary: json.data.summary
          });
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
    loadAnalytics();
  }, []);

  if (loading) {
    return (
      <Card className="border-border bg-card shadow-none">
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-3 w-1/2" />
        </CardHeader>
        <CardContent className="h-[280px] flex items-center justify-center">
          <Skeleton className="h-full w-full rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-border bg-card shadow-none">
        <CardContent className="h-[280px] flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Operational analytics are currently unavailable.</p>
        </CardContent>
      </Card>
    );
  }

  const { summary, pipelineData } = data;
  const totalLeads = summary.totalLeads || 0;
  
  // Calculate relative percentages for lead categories
  const hotItem = pipelineData.find(p => p.name === "Hot");
  const warmItem = pipelineData.find(p => p.name === "Warm");
  const coldItem = pipelineData.find(p => p.name === "Cold");

  const hotCount = hotItem ? hotItem.value : 0;
  const warmCount = warmItem ? warmItem.value : 0;
  const coldCount = coldItem ? coldItem.value : 0;

  const hotPct = totalLeads > 0 ? (hotCount / totalLeads) * 100 : 0;
  const warmPct = totalLeads > 0 ? (warmCount / totalLeads) * 100 : 0;
  const coldPct = totalLeads > 0 ? (coldCount / totalLeads) * 100 : 0;

  // Circular gauge config
  const radius = 50;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (summary.aiHandled / 100) * circumference;

  return (
    <Card className="border-border bg-card shadow-none overflow-hidden relative">
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground text-base">Autopilot & Pipeline Efficiency</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Key performance index indicating automated messaging and lead qualification status
            </CardDescription>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
            <Sparkles className="w-3 h-3" />
            <span>AI Operations</span>
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          
          {/* Radial Circular Gauge for AI efficiency */}
          <div className="md:col-span-5 flex flex-col items-center justify-center text-center p-4 border-r border-border/40 last:border-0 md:border-r-1 md:border-b-0 border-b pb-6 md:pb-4">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                {/* Background track circle */}
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  className="stroke-muted"
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />
                {/* Active progress circle */}
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  className="stroke-primary transition-all duration-1000 ease-out"
                  strokeWidth={strokeWidth}
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              {/* Central text displaying the efficiency percentage */}
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold text-foreground tracking-tight">
                  {summary.aiHandled}%
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                  Autopilot
                </span>
              </div>
            </div>
            
            <div className="mt-4 space-y-1">
              <h4 className="text-sm font-semibold text-foreground">AI Autonomous Resolution</h4>
              <p className="text-xs text-muted-foreground max-w-[200px]">
                {summary.aiHandled}% of outbound client replies were handled autonomously by active AI Agents.
              </p>
            </div>
          </div>

          {/* Lead pipeline segment chart and distribution details */}
          <div className="md:col-span-7 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground">Lead Qualification Funnel</span>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {totalLeads} total leads synced
                </span>
              </div>
              
              {/* Stacked Segment Bar chart representing lead health */}
              <div className="w-full h-3.5 rounded-full bg-muted overflow-hidden flex">
                {hotCount > 0 && (
                  <div 
                    className="h-full bg-rose-500 transition-all duration-500" 
                    style={{ width: `${hotPct}%` }}
                    title={`Hot Leads: ${hotCount}`}
                  />
                )}
                {warmCount > 0 && (
                  <div 
                    className="h-full bg-amber-500 transition-all duration-500" 
                    style={{ width: `${warmPct}%` }}
                    title={`Warm Leads: ${warmCount}`}
                  />
                )}
                {coldCount > 0 && (
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500" 
                    style={{ width: `${coldPct}%` }}
                    title={`Cold Leads: ${coldCount}`}
                  />
                )}
                {totalLeads === 0 && (
                  <div className="h-full w-full bg-muted" />
                )}
              </div>
            </div>

            {/* List breakdown of leads with icons and detailed text */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg border border-border bg-[#F9F9F8] dark:bg-muted/10 space-y-1">
                <div className="flex items-center gap-1.5 text-rose-500">
                  <Flame className="w-3.5 h-3.5 fill-current" />
                  <span className="text-xs font-semibold">Hot Leads</span>
                </div>
                <div className="text-lg font-bold text-foreground">{hotCount}</div>
                <p className="text-[10px] text-muted-foreground">Ready to book / purchase</p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-[#F9F9F8] dark:bg-muted/10 space-y-1">
                <div className="flex items-center gap-1.5 text-amber-500">
                  <Compass className="w-3.5 h-3.5 fill-current" />
                  <span className="text-xs font-semibold">Warm Leads</span>
                </div>
                <div className="text-lg font-bold text-foreground">{warmCount}</div>
                <p className="text-[10px] text-muted-foreground">Active interactions</p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-[#F9F9F8] dark:bg-muted/10 space-y-1">
                <div className="flex items-center gap-1.5 text-blue-500">
                  <Snowflake className="w-3.5 h-3.5 fill-current" />
                  <span className="text-xs font-semibold">Cold Leads</span>
                </div>
                <div className="text-lg font-bold text-foreground">{coldCount}</div>
                <p className="text-[10px] text-muted-foreground">New / idle contacts</p>
              </div>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
