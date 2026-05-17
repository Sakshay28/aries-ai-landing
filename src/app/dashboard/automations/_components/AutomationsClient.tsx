"use client";

import React from 'react';
import { toast } from 'sonner';
import { 
  Plus, Activity, ArrowRight, Play, Pause, BarChart2, Edit2, PlayCircle, ShieldAlert
} from 'lucide-react';
import { cn } from "@/lib/utils";

// --- MOCK DATA ---
interface Automation {
  id: string;
  name: string;
  triggerSource: string;
  aiSummary: string;
  status: 'Active' | 'Learning' | 'Paused';
  customersReached: number;
  successRate: number;
}

const mockAutomations: Automation[] = [
  {
    id: 'a-1',
    name: 'Recover Lost Leads',
    triggerSource: 'When someone asks about pricing but leaves',
    aiSummary: 'Automatically texts them a gentle reminder after 2 hours to see if they need help.',
    status: 'Active',
    customersReached: 124,
    successRate: 92,
  },
  {
    id: 'a-2',
    name: 'Identify Serious Buyers',
    triggerSource: 'When a new person messages you',
    aiSummary: 'Asks a few polite questions to see what they want, and alerts you if they are ready to buy.',
    status: 'Learning',
    customersReached: 845,
    successRate: 88,
  },
  {
    id: 'a-3',
    name: 'Follow Up Interested Customers',
    triggerSource: 'When they click a link you sent',
    aiSummary: 'Checks in the next day to ask if they liked what they saw.',
    status: 'Active',
    customersReached: 42,
    successRate: 76,
  },
  {
    id: 'a-4',
    name: 'Alert Human Support',
    triggerSource: 'When a customer seems frustrated',
    aiSummary: 'Immediately pauses the AI and pings your phone so you can jump in and help.',
    status: 'Active',
    customersReached: 18,
    successRate: 100,
  }
];

export function AutomationsClient() {
  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      
      {/* TOP HEADER */}
      <header className="h-14 flex items-center justify-between px-6 shrink-0 bg-background z-20 sticky top-0">
        <h1 className="text-[16px] font-semibold tracking-tight text-foreground">
          Automations
        </h1>

        <div className="flex items-center gap-2">
          <button onClick={() => toast("History coming soon")} className="h-9 px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors flex items-center">
            <Activity className="w-4 h-4 mr-2 opacity-70" />
            History
          </button>
          <button onClick={() => toast("Automation Builder coming soon")} className="h-9 px-4 bg-foreground text-background hover:bg-foreground/90 rounded-lg text-[13px] font-medium transition-transform active:scale-95 flex items-center shadow-sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Automation
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-auto p-6 md:p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-12">
          
          {/* HEADER COPY */}
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
              Let AI do the follow-ups.
            </h2>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Your AI assistant is currently managing conversations and making sure no customer is left behind.
            </p>
          </div>

          {/* AI SUGGESTION - Soft Card */}
          <section className="group relative rounded-2xl bg-muted/40 p-6 sm:p-8 hover:bg-muted/60 transition-colors cursor-pointer">
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                  <span className="text-[12px] font-semibold tracking-wide text-blue-600 dark:text-blue-400 uppercase">Suggestion</span>
                </div>
                <h3 className="text-[18px] font-medium tracking-tight text-foreground">
                  Create an "After-Hours Auto Reply"
                </h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed max-w-xl">
                  Customers often message you outside of business hours. An automated reply letting them know when you'll be back sets expectations and keeps them engaged.
                </p>
              </div>
              <button onClick={() => toast.success("Drafting automation...")} className="shrink-0 h-10 px-5 bg-white dark:bg-black border border-border/50 group-hover:border-border text-foreground text-[14px] font-medium rounded-lg shadow-sm hover:shadow transition-all flex items-center">
                Turn this on
                <ArrowRight className="w-4 h-4 ml-2 opacity-60 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </section>

          {/* ACTIVE AUTOMATIONS */}
          <section>
            <div className="mb-6">
              <h3 className="text-[14px] font-medium text-foreground tracking-tight">Your Active Rules</h3>
            </div>

            <div className="space-y-4">
              {mockAutomations.map((automation) => (
                <div
                  key={automation.id}
                  className="group relative bg-background border border-border/40 hover:border-border/80 rounded-2xl p-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:hover:shadow-[0_8px_30px_rgb(255,255,255,0.02)]"
                >
                  <div className="flex flex-col sm:flex-row gap-6 justify-between items-start">
                    
                    {/* Left: Info */}
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="text-[16px] font-medium text-foreground tracking-tight">{automation.name}</h4>
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[11px] font-medium",
                          automation.status === 'Active' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500" :
                          "bg-amber-500/10 text-amber-600 dark:text-amber-500"
                        )}>
                          {automation.status}
                        </span>
                      </div>
                      
                      <div className="text-[13px] font-medium text-muted-foreground flex items-center gap-2">
                        <span className="uppercase text-[11px] tracking-wider text-muted-foreground/60">When:</span>
                        {automation.triggerSource}
                      </div>

                      <p className="text-[14px] text-muted-foreground/80 leading-relaxed max-w-xl">
                        {automation.aiSummary}
                      </p>
                    </div>

                    {/* Right: Outcomes & Hover Actions */}
                    <div className="flex flex-col items-end gap-4 shrink-0 sm:min-w-[140px]">
                      
                      {/* Stats (Visible by default, fades out on hover) */}
                      <div className="flex flex-col items-end gap-3 group-hover:opacity-0 group-hover:pointer-events-none transition-opacity duration-200 absolute sm:relative right-6 top-6 sm:right-auto sm:top-auto">
                        <div className="text-right">
                          <div className="text-[20px] font-semibold tracking-tight text-foreground">{automation.customersReached}</div>
                          <div className="text-[12px] text-muted-foreground">Customers Reached</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[20px] font-semibold tracking-tight text-foreground">{automation.successRate}%</div>
                          <div className="text-[12px] text-muted-foreground">Recovered</div>
                        </div>
                      </div>

                      {/* Actions (Hidden by default, fades in on hover) */}
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-4 transition-all duration-300 flex items-center gap-2">
                        <button onClick={() => toast("Editing coming soon")} className="flex items-center gap-2 h-9 px-3 bg-muted hover:bg-muted/80 text-foreground text-[13px] font-medium rounded-lg transition-colors" title="Edit">
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button onClick={() => toast("Analytics coming soon")} className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors" title="View Analytics">
                          <BarChart2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => toast.success("Automation paused")} className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors" title="Pause">
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      </div>

                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          
          <div className="h-12"></div>
        </div>
      </div>
    </div>
  );
}
