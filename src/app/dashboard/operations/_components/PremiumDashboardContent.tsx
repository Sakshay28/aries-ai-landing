"use client";

import React from "react";
import { GreetingSection } from "../../_sections/GreetingSection";
import { OperationsKPIs } from "./OperationsKPIs";
import { AIEfficiencyPanel } from "./AIEfficiencyPanel";
import { AgentPerformanceStatus } from "./AgentPerformanceStatus";
import { QuickActionsGrid } from "./QuickActionsGrid";
import { LiveActivityFeed } from "./LiveActivityFeed";

export function PremiumDashboardContent() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Welcome / Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border pb-6 gap-4">
        <GreetingSection />
        <div className="flex items-center gap-3">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground">Operations Live</span>
        </div>
      </div>

      {/* KPI Cards Grid (3 columns on desktop, 1 on mobile) */}
      <OperationsKPIs />

      {/* Main Multi-Column Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Primary Content: Charts and Agent Metrics */}
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-4">
            <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">AI Efficiency & Funnel</h2>
            <AIEfficiencyPanel />
          </div>
          
          <div className="space-y-4">
            <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">Agent Status</h2>
            <AgentPerformanceStatus />
          </div>
        </div>

        {/* Right Secondary Content: Quick Tools and Log Stream */}
        <div className="lg:col-span-1 space-y-6">
          <div className="space-y-4">
            <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">Quick Tools</h2>
            <QuickActionsGrid />
          </div>

          <div className="space-y-4">
            <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">Live Activity Feed</h2>
            <LiveActivityFeed />
          </div>
        </div>
        
      </div>
    </div>
  );
}
