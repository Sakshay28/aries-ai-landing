"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, Plus, LayoutTemplate, Activity, Play, Pause, AlertCircle, 
  Settings2, ChevronRight, Zap, Network, Clock, ShieldCheck, Cpu, BrainCircuit,
  MessageSquare, UserCircle2, ArrowRight, CheckCircle2, ChevronDown
} from 'lucide-react';

// --- MOCK DATA ---

type AutomationState = 'Active' | 'Learning' | 'Paused' | 'Draft' | 'Human Review' | 'Error' | 'AI Optimizing';

interface Automation {
  id: string;
  name: string;
  triggerSource: string;
  aiSummary: string;
  status: AutomationState;
  executionsToday: number;
  successRate: number;
  lastTriggered: string;
  channelsActive: string[];
  aiConfidence: number;
  linkedFlows: string[];
  span: number; // For layout rhythm
}

const mockAutomations: Automation[] = [
  {
    id: 'a-1',
    name: 'Pricing Recovery Orchestration',
    triggerSource: 'AI Intent Trigger: "Abandoned Pricing"',
    aiSummary: 'Autonomously re-engages users who abandon pricing conversations after 2 hours with customized context.',
    status: 'Active',
    executionsToday: 124,
    successRate: 92,
    lastTriggered: '2m ago',
    channelsActive: ['WhatsApp'],
    aiConfidence: 98,
    linkedFlows: ['Objection Handling'],
    span: 8, // spans 2/3 of grid
  },
  {
    id: 'a-2',
    name: 'Lead Qualification Engine',
    triggerSource: 'Inbound Message: First Contact',
    aiSummary: 'Qualifies inbound leads and hands off VIPs to sales.',
    status: 'AI Optimizing',
    executionsToday: 845,
    successRate: 88,
    lastTriggered: 'Just now',
    channelsActive: ['WhatsApp', 'Instagram'],
    aiConfidence: 95,
    linkedFlows: ['B2B Routing'],
    span: 4, // spans 1/3
  },
  {
    id: 'a-3',
    name: 'Broadcast Follow-up Recovery',
    triggerSource: 'Broadcast Interaction: "Link Clicked"',
    aiSummary: 'Detects users who clicked a broadcast link but did not reply or convert within 24h.',
    status: 'Active',
    executionsToday: 42,
    successRate: 76,
    lastTriggered: '1h ago',
    channelsActive: ['WhatsApp'],
    aiConfidence: 85,
    linkedFlows: ['Sales Nudge'],
    span: 4,
  },
  {
    id: 'a-4',
    name: 'Support Escalation Protocol',
    triggerSource: 'AI Sentiment: "Frustrated"',
    aiSummary: 'Instantly escalates frustrated users to a human agent with full conversation history and generated summary.',
    status: 'Active',
    executionsToday: 18,
    successRate: 100,
    lastTriggered: '15m ago',
    channelsActive: ['WhatsApp'],
    aiConfidence: 99,
    linkedFlows: ['None'],
    span: 8,
  }
];

export function AutomationsClient() {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-[#050505] text-white overflow-hidden relative selection:bg-indigo-500/30">
      
      {/* LAYER 1 & 2: Base Dark Background & Ambient Cinematic Gradients */}
      <div className="absolute top-0 right-1/4 w-[800px] h-[800px] bg-indigo-500/[0.04] rounded-full blur-[120px] pointer-events-none mix-blend-screen"></div>
      <div className="absolute bottom-1/4 left-1/4 w-[600px] h-[600px] bg-emerald-500/[0.03] rounded-full blur-[150px] pointer-events-none mix-blend-screen"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-blue-500/[0.02] rounded-full blur-[200px] pointer-events-none mix-blend-screen"></div>

      {/* LAYER 3: Orchestration Dot Field */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40 mix-blend-screen" 
           style={{ 
             backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)', 
             backgroundSize: '32px 32px',
             backgroundPosition: 'center',
             maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
             WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)'
           }}>
      </div>

      {/* TOP HEADER */}
      <header className="h-16 border-b border-white/[0.04] flex items-center justify-between px-6 shrink-0 relative z-20 backdrop-blur-md bg-[#050505]/60 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4">
          <h1 className="text-[15px] font-medium tracking-tight text-white/95 flex items-center gap-3">
            Automations
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/50 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button className="h-8 px-4 text-[13px] font-medium bg-transparent text-white/50 hover:bg-white/[0.03] hover:text-white/90 rounded-md border border-transparent transition-colors flex items-center">
            <Activity className="w-3.5 h-3.5 mr-2" />
            Activity Log
          </button>
          <button className="h-8 px-4 text-[13px] font-medium bg-transparent text-white/50 hover:bg-white/[0.03] hover:text-white/90 rounded-md border border-transparent transition-colors flex items-center">
            <LayoutTemplate className="w-3.5 h-3.5 mr-2" />
            Templates
          </button>
          
          {/* PREMIUM BUTTON: Cinematic glow and elevation */}
          <button className="relative group h-8 px-5 rounded-md overflow-hidden flex items-center shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset,0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2)_inset,0_0_20px_rgba(255,255,255,0.2)] transition-all duration-300 transform hover:-translate-y-[1px]">
            <div className="absolute inset-0 bg-white/10 group-hover:bg-white/20 transition-colors"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-50"></div>
            <Plus className="w-3.5 h-3.5 mr-1.5 text-white relative z-10" />
            <span className="text-[13px] font-semibold text-white relative z-10 tracking-wide">Create</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTENT CANVAS */}
      <div className="flex-1 overflow-auto p-6 md:p-10 custom-scrollbar z-10 relative">
        <div className="max-w-[1400px] mx-auto space-y-12">
          
          {/* HERO METRICS - Asymmetrical Rhythm */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {/* Primary Metric - Spans 2 cols */}
            <div className="md:col-span-2 p-6 rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_-8px_rgba(0,0,0,0.8)] flex flex-col relative overflow-hidden group hover:-translate-y-1 transition-transform duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-[40px] pointer-events-none group-hover:bg-indigo-500/20 transition-colors duration-700"></div>
              
              <div className="flex items-center gap-2 mb-6 relative z-10">
                <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">Conversations Automated</span>
              </div>
              <div className="flex items-baseline gap-3 relative z-10">
                <span className="text-5xl font-semibold tracking-tighter text-white/95">12,450</span>
                <div className="flex items-center text-[11px] text-emerald-400/90 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
                  Today
                </div>
              </div>
            </div>

            <div className="md:col-span-1 p-6 rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_-8px_rgba(0,0,0,0.8)] flex flex-col relative overflow-hidden group hover:-translate-y-1 transition-transform duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              
              <div className="flex items-center gap-2 mb-6 relative z-10">
                <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">Recovery Rate</span>
              </div>
              <div className="flex items-baseline gap-2 relative z-10">
                <span className="text-4xl font-semibold tracking-tighter text-white/95">84<span className="text-3xl text-white/50">%</span></span>
              </div>
              <div className="mt-2 text-[11px] text-white/30 font-medium">Avg. Success Metric</div>
            </div>

            <div className="md:col-span-1 p-6 rounded-2xl bg-[#0A0A0A]/80 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_-8px_rgba(0,0,0,0.8)] flex flex-col relative overflow-hidden group hover:-translate-y-1 transition-transform duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              
              <div className="flex items-center gap-2 mb-6 relative z-10">
                <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/40">Hours Saved</span>
              </div>
              <div className="flex items-baseline gap-2 relative z-10">
                <span className="text-4xl font-semibold tracking-tighter text-white/95">142<span className="text-3xl text-white/50">h</span></span>
              </div>
              <div className="mt-2 text-[11px] text-white/30 font-medium">This Week</div>
            </div>
          </section>

          {/* AI PROACTIVE SUGGESTION - The Visual Centerpiece */}
          <section className="relative group">
            {/* Deep Cinematic Glow Behind */}
            <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent blur-2xl opacity-50 group-hover:opacity-100 transition-opacity duration-1000 z-0"></div>
            
            <div className="relative z-10 rounded-2xl bg-[#0F0F13]/90 backdrop-blur-2xl border border-indigo-500/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_12px_40px_-12px_rgba(0,0,0,1)] p-1 overflow-hidden">
              {/* Internal subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent pointer-events-none"></div>
              <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-black/20 to-transparent pointer-events-none"></div>

              <div className="relative px-8 py-7 flex flex-col lg:flex-row items-center justify-between gap-8">
                <div className="flex gap-6 items-center lg:items-start w-full lg:w-auto">
                  {/* AI Orb */}
                  <div className="relative shrink-0 flex items-center justify-center">
                    <div className="absolute inset-0 bg-indigo-500/30 rounded-full blur-md animate-pulse"></div>
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600 p-[1px] shadow-[0_0_30px_rgba(99,102,241,0.4)]">
                      <div className="w-full h-full rounded-full bg-[#0A0A0A] flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-indigo-300" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300/80">Proactive Intelligence</span>
                      <span className="w-1 h-1 rounded-full bg-indigo-500/50"></span>
                      <span className="text-[10px] font-medium text-white/30">Just now</span>
                    </div>
                    <h3 className="text-xl font-semibold text-white/95 tracking-tight drop-shadow-md">
                      Users frequently ask pricing questions after broadcasts.
                    </h3>
                    <p className="text-sm text-white/50 max-w-2xl leading-relaxed">
                      AI detected a pattern: 28% of broadcast responders ask about enterprise pricing. Generating an automated "Pricing Clarification" orchestration flow could recover an estimated 40 leads this week.
                    </p>
                  </div>
                </div>
                
                {/* Magnetic Button */}
                <button className="shrink-0 relative group/btn h-12 px-8 rounded-xl overflow-hidden flex items-center shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset,0_0_30px_rgba(99,102,241,0.2)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2)_inset,0_0_40px_rgba(99,102,241,0.4)] transition-all duration-300 transform hover:-translate-y-1">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 transition-colors"></div>
                  <div className="absolute inset-0 bg-white/0 group-hover/btn:bg-white/10 transition-colors"></div>
                  <span className="text-sm font-semibold text-white relative z-10 tracking-wide flex items-center">
                    Generate Orchestration
                    <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* ACTIVE ORCHESTRATIONS */}
          <section className="space-y-6">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[11px] font-bold tracking-[0.2em] text-white/40 uppercase">Active Orchestrations</h2>
              <button className="text-[11px] font-semibold uppercase tracking-wider text-white/30 hover:text-white/70 flex items-center transition-colors group">
                View All Directory <ChevronRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              {mockAutomations.map((automation, i) => (
                <motion.div
                  key={automation.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.1, ease: [0.23, 1, 0.32, 1] }}
                  onMouseEnter={() => setHoveredCard(automation.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  className={`group relative bg-[#0A0A0A]/60 backdrop-blur-md border border-white/[0.04] hover:border-white/[0.08] hover:bg-[#0F0F0F]/80 rounded-2xl p-6 transition-all duration-500 hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,1)] hover:-translate-y-1 cursor-pointer flex flex-col h-full xl:col-span-${automation.span}`}
                >
                  {/* Subtle top lighting */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent"></div>

                  {/* Shimmer trace on hover */}
                  <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                    <div className="absolute -left-[100%] top-0 bottom-0 w-[50%] bg-gradient-to-r from-transparent via-white/[0.02] to-transparent group-hover:animate-[shimmer_2s_infinite]"></div>
                  </div>

                  {/* Header Row */}
                  <div className="relative z-10 flex items-start justify-between mb-5">
                    <div className="space-y-1.5 pr-8">
                      <h3 className="text-[15px] font-medium text-white/90 tracking-tight group-hover:text-white transition-colors">{automation.name}</h3>
                      <div className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-[0.1em] font-medium">
                        <Cpu className="w-3 h-3 text-white/20" />
                        Trigger: <span className="text-white/50 capitalize tracking-normal">{automation.triggerSource}</span>
                      </div>
                    </div>
                    
                    <div className={`shrink-0 flex items-center px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-[0.15em] border ${
                      automation.status === 'Active' ? 'bg-emerald-500/[0.05] text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' :
                      automation.status === 'AI Optimizing' ? 'bg-indigo-500/[0.05] text-indigo-300 border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]' :
                      'bg-white/[0.03] text-white/40 border-white/[0.05]'
                    }`}>
                      {automation.status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>}
                      {automation.status === 'AI Optimizing' && <Sparkles className="w-2.5 h-2.5 mr-1 text-indigo-400" />}
                      {automation.status}
                    </div>
                  </div>

                  {/* Summary */}
                  <p className="text-[13px] text-white/50 leading-relaxed mb-8 relative z-10 font-light group-hover:text-white/70 transition-colors">
                    {automation.aiSummary}
                  </p>

                  {/* Metrics Row */}
                  <div className="mt-auto pt-5 border-t border-white/[0.03] relative z-10 grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.15em] text-white/30 font-bold mb-1.5">Executions Today</div>
                      <div className="text-[13px] font-medium text-white/80">{automation.executionsToday.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.15em] text-white/30 font-bold mb-1.5">Success Rate</div>
                      <div className="text-[13px] font-medium text-white/80 flex items-center gap-1.5">
                        {automation.successRate}%
                        {automation.successRate > 90 && <CheckCircle2 className="w-3 h-3 text-emerald-400/80" />}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.15em] text-white/30 font-bold mb-1.5">Linked Flow</div>
                      <div className="text-[13px] font-medium text-white/50 flex items-center gap-1.5 truncate group-hover:text-white/80 transition-colors">
                        <Network className="w-3.5 h-3.5 shrink-0 opacity-50" />
                        <span className="truncate">{automation.linkedFlows[0]}</span>
                      </div>
                    </div>
                  </div>

                  {/* Premium Hover Action Palette */}
                  <div className={`absolute right-5 top-5 flex items-center gap-1 transition-all duration-400 z-20 ${
                    hoveredCard === automation.id ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
                  }`}>
                    <div className="flex items-center bg-[#1A1A1A]/90 backdrop-blur-xl rounded-lg border border-white/[0.08] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.8)] p-1">
                      <button className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Pause">
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-md transition-colors" title="Settings">
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-px h-3 bg-white/10 mx-1"></div>
                      <button className="px-2.5 py-1 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 text-[11px] font-medium rounded-md transition-colors tracking-wide">
                        Edit Flow
                      </button>
                    </div>
                  </div>

                </motion.div>
              ))}
            </div>
          </section>
          
          {/* Bottom spacing for scrolling */}
          <div className="h-12"></div>
        </div>
      </div>
    </div>
  );
}
