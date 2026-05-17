"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, Activity, LayoutTemplate, Clock, ShieldCheck, Zap, 
  Settings2, ChevronRight, CheckCircle2, AlertCircle, Bot
} from 'lucide-react';
import { cn } from "@/lib/utils";

// --- MOCK DATA ---
type AutomationState = 'Active' | 'Paused' | 'Draft' | 'Learning';

interface Automation {
  id: string;
  name: string;
  triggerSource: string;
  aiSummary: string;
  status: AutomationState;
  executionsToday: number;
  successRate: number;
  lastTriggered: string;
}

const mockAutomations: Automation[] = [
  {
    id: 'a-1',
    name: 'Pricing Recovery Orchestration',
    triggerSource: 'Abandoned Pricing Intent',
    aiSummary: 'Autonomously re-engages users who abandon pricing conversations after 2 hours.',
    status: 'Active',
    executionsToday: 124,
    successRate: 92,
    lastTriggered: '2m ago',
  },
  {
    id: 'a-2',
    name: 'Lead Qualification Engine',
    triggerSource: 'First Contact',
    aiSummary: 'Qualifies inbound leads and hands off VIPs to sales instantly.',
    status: 'Learning',
    executionsToday: 845,
    successRate: 88,
    lastTriggered: 'Just now',
  },
  {
    id: 'a-3',
    name: 'Broadcast Follow-up',
    triggerSource: 'Link Clicked',
    aiSummary: 'Detects users who clicked a broadcast link but did not reply within 24h.',
    status: 'Active',
    executionsToday: 42,
    successRate: 76,
    lastTriggered: '1h ago',
  },
  {
    id: 'a-4',
    name: 'Support Escalation Protocol',
    triggerSource: 'Sentiment: Frustrated',
    aiSummary: 'Instantly escalates frustrated users to a human agent with conversation context.',
    status: 'Active',
    executionsToday: 18,
    successRate: 100,
    lastTriggered: '15m ago',
  }
];

export function AutomationsClient() {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      
      {/* TOP HEADER */}
      <header className="h-14 border-b border-border/40 flex items-center justify-between px-6 shrink-0 bg-background/95 backdrop-blur-sm z-20 sticky top-0">
        <div className="flex items-center gap-3">
          <h1 className="text-[14px] font-medium tracking-tight text-foreground flex items-center gap-2">
            Automations
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button className="h-8 px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors flex items-center">
            <Activity className="w-3.5 h-3.5 mr-2 opacity-70" />
            Activity
          </button>
          <button className="h-8 px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors flex items-center">
            <LayoutTemplate className="w-3.5 h-3.5 mr-2 opacity-70" />
            Templates
          </button>
          <div className="w-px h-4 bg-border mx-1"></div>
          <button className="h-8 px-4 bg-foreground text-background hover:bg-foreground/90 rounded-md text-[13px] font-medium transition-colors shadow-sm flex items-center">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create
          </button>
        </div>
      </header>

      {/* MAIN CONTENT CANVAS */}
      <div className="flex-1 overflow-auto p-6 md:p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-10">
          
          {/* HERO METRICS */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl bg-card border border-border/50 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                <Zap className="w-4 h-4" />
                <span className="text-[12px] font-medium">Conversations Automated</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight text-foreground">12,450</span>
                <span className="text-[12px] font-medium text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  Today
                </span>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-card border border-border/50 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-[12px] font-medium">Recovery Rate</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight text-foreground">84%</span>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-card border border-border/50 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span className="text-[12px] font-medium">Hours Saved</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight text-foreground">142h</span>
              </div>
            </div>
          </section>

          {/* AI INSIGHT */}
          <section className="rounded-xl bg-muted/30 border border-border/50 p-5 flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center shrink-0 shadow-sm">
                <Bot className="w-5 h-5 text-foreground opacity-80" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold tracking-tight text-foreground mb-1">
                  Pattern Detected: Enterprise Pricing
                </h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed max-w-2xl">
                  28% of broadcast responders ask about enterprise pricing. Generating a specific "Pricing Clarification" orchestration flow could recover an estimated 40 leads this week.
                </p>
              </div>
            </div>
            <button className="shrink-0 h-9 px-4 bg-background border border-border hover:bg-muted text-foreground text-[13px] font-medium rounded-md shadow-sm transition-colors flex items-center">
              Generate Flow
              <ChevronRight className="w-3.5 h-3.5 ml-1.5 opacity-60" />
            </button>
          </section>

          {/* ACTIVE ORCHESTRATIONS */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[13px] font-medium text-foreground tracking-tight">Active Orchestrations</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mockAutomations.map((automation, i) => (
                <div
                  key={automation.id}
                  onMouseEnter={() => setHoveredCard(automation.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="group relative bg-card border border-border/50 hover:border-border rounded-xl p-5 transition-all shadow-sm hover:shadow-md cursor-pointer flex flex-col h-full"
                >
                  {/* Header Row */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-[14px] font-semibold text-foreground tracking-tight pr-8">{automation.name}</h3>
                    
                    <div className={cn(
                      "shrink-0 flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
                      automation.status === 'Active' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-200 dark:border-emerald-500/20" :
                      automation.status === 'Learning' ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-200 dark:border-amber-500/20" :
                      "bg-muted text-muted-foreground border-border"
                    )}>
                      {automation.status}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground font-medium mb-3">
                    Trigger: <span className="text-foreground">{automation.triggerSource}</span>
                  </div>

                  {/* Summary */}
                  <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">
                    {automation.aiSummary}
                  </p>

                  {/* Metrics Row */}
                  <div className="mt-auto pt-4 border-t border-border/40 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[11px] text-muted-foreground font-medium mb-1">Executions Today</div>
                      <div className="text-[13px] font-semibold text-foreground">{automation.executionsToday.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground font-medium mb-1">Success Rate</div>
                      <div className="text-[13px] font-semibold text-foreground flex items-center gap-1">
                        {automation.successRate}%
                        {automation.successRate > 90 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      </div>
                    </div>
                  </div>

                  {/* Hover Actions */}
                  <div className={cn(
                    "absolute right-4 top-4 flex items-center gap-1 transition-opacity bg-background border border-border shadow-sm rounded-md p-1",
                    hoveredCard === automation.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  )}>
                    <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors" title="Settings">
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-3 bg-border mx-1"></div>
                    <button className="px-2 py-1 text-foreground hover:bg-muted text-[11px] font-medium rounded-md transition-colors">
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          
          {/* Bottom spacing for scrolling */}
          <div className="h-8"></div>
        </div>
      </div>
    </div>
  );
}
