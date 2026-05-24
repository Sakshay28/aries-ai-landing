"use client";

import React, { useEffect, useState } from "react";
import { MessageSquare, Workflow, Users, ArrowUpRight, Percent } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonMetric } from "@/components/ui/skeleton";

interface DashboardStats {
  totalLeads: number;
  activeConversations: number;
  messagesThisMonth: number;
  messageLimit: number;
  newLeadsToday: number;
  confirmedBookings: number;
  conversionRate: string;
}

interface Rule {
  id: string;
  name: string;
  status: string;
}

export function OperationsKPIs() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeRulesCount, setActiveRulesCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(false);
    try {
      const [statsRes, automationsRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/dashboard/automations")
      ]);

      if (!statsRes.ok || !automationsRes.ok) {
        throw new Error("Failed to fetch dashboard operation metrics.");
      }

      const statsJson = await statsRes.json();
      const automationsJson = await automationsRes.json();

      setStats(statsJson.data);
      
      const rules = automationsJson.rules as Rule[];
      const activeCount = rules.filter(r => r.status === "active").length;
      setActiveRulesCount(activeCount);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <SkeletonMetric key={i} />
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="border-border bg-card shadow-none">
            <CardContent className="p-6">
              <p className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase mb-3">—</p>
              <div className="text-xl font-semibold text-muted-foreground mb-2">Unavailable</div>
              {i === 0 && (
                <button onClick={loadData} className="text-xs text-primary hover:underline">
                  Retry Loading
                </button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const kpiData = [
    {
      title: "Active Chats",
      description: "Live conversation threads",
      value: stats.activeConversations,
      subtext: `${stats.messagesThisMonth} messages sent this month`,
      icon: MessageSquare,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      href: "/dashboard/chat"
    },
    {
      title: "Active Automations",
      description: "Smart rules running live",
      value: activeRulesCount ?? 0,
      subtext: "Auto-qualifying prospects",
      icon: Workflow,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      href: "/dashboard/flows"
    },
    {
      title: "Total Contacts",
      description: "Total CRM contacts acquired",
      value: stats.totalLeads,
      subtext: stats.newLeadsToday > 0 ? `+${stats.newLeadsToday} new contacts today` : "No new contacts today",
      icon: Users,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
      href: "/dashboard/contacts"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {kpiData.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <Card key={kpi.title} className="border-border bg-card hover:bg-[#F9F9F8] dark:hover:bg-muted/30 transition-all duration-300 shadow-none relative overflow-hidden group">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold text-foreground">{kpi.title}</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">{kpi.description}</CardDescription>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground/45 group-hover:text-primary transition-colors" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="text-3xl font-bold tracking-tight text-foreground">{kpi.value}</div>
                <p className="text-xs text-muted-foreground font-medium">{kpi.subtext}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
