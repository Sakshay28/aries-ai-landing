"use client";

import React, { useState } from 'react';
import { toast } from 'sonner';
import { 
  Plus, Activity, ArrowRight, Play, Pause, BarChart2, Edit2, PlayCircle, ShieldAlert, X, Save, Trash2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";

// --- MOCK DATA ---
interface Rule {
  id: string;
  name: string;
  triggerSource: string;
  aiSummary: string;
  status: 'Active' | 'Learning' | 'Paused';
  customersReached: number;
  actionsTaken: number;
}

const mockRules: Rule[] = [
  {
    id: 'a-1',
    name: 'Recover Lost Leads',
    triggerSource: 'When someone asks about pricing but leaves',
    aiSummary: 'Automatically texts them a gentle reminder after 2 hours to see if they need help.',
    status: 'Active',
    customersReached: 124,
    actionsTaken: 245,
  },
  {
    id: 'a-2',
    name: 'Identify Serious Buyers',
    triggerSource: 'When a new person messages you',
    aiSummary: 'Asks a few polite questions to see what they want, and alerts you if they are ready to buy.',
    status: 'Learning',
    customersReached: 845,
    actionsTaken: 1890,
  },
  {
    id: 'a-3',
    name: 'Follow Up Interested Customers',
    triggerSource: 'When they click a link you sent',
    aiSummary: 'Checks in the next day to ask if they liked what they saw.',
    status: 'Active',
    customersReached: 42,
    actionsTaken: 84,
  },
  {
    id: 'a-4',
    name: 'Alert Human Support',
    triggerSource: 'When a customer seems frustrated',
    aiSummary: 'Immediately pauses the AI and pings your phone so you can jump in and help.',
    status: 'Active',
    customersReached: 18,
    actionsTaken: 18,
  }
];

export function AutomationsClient() {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>(mockRules);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    setIsDrawerOpen(true);
  };

  const handleNewRule = () => {
    setEditingRule({
      id: `a-${Date.now()}`,
      name: '',
      triggerSource: '',
      aiSummary: '',
      status: 'Learning',
      customersReached: 0,
      actionsTaken: 0,
    });
    setIsDrawerOpen(true);
  };

  const handleSave = () => {
    if (!editingRule) return;
    
    setRules(prev => {
      const exists = prev.find(r => r.id === editingRule.id);
      if (exists) {
        return prev.map(r => r.id === editingRule.id ? editingRule : r);
      }
      return [editingRule, ...prev];
    });
    
    toast.success("Rule saved successfully");
    setIsDrawerOpen(false);
  };

  const handleDelete = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
    toast.success("Rule deleted permanently");
    setIsDrawerOpen(false);
  };

  const handleTogglePause = (id: string, currentStatus: string) => {
    setRules(prev => prev.map(r => {
      if (r.id === id) {
        const newStatus = currentStatus === 'Paused' ? 'Active' : 'Paused';
        toast.success(`Rule ${newStatus.toLowerCase()}`);
        return { ...r, status: newStatus as 'Active' | 'Paused' };
      }
      return r;
    }));
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden relative">
      
      {/* TOP HEADER */}
      <header className="h-14 flex items-center justify-between px-6 shrink-0 bg-background z-20 sticky top-0">
        <h1 className="text-[16px] font-semibold tracking-tight text-foreground">
          Smart Rules
        </h1>

        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/dashboard/logs')} className="h-9 px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors flex items-center">
            <Activity className="w-4 h-4 mr-2 opacity-70" />
            History
          </button>
          <button onClick={handleNewRule} className="h-9 px-4 bg-foreground text-background hover:bg-foreground/90 rounded-lg text-[13px] font-medium transition-transform active:scale-95 flex items-center shadow-sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Rule
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
                  Turn on "Smart Review Collection"
                </h3>
                <p className="text-[14px] text-muted-foreground leading-relaxed max-w-xl">
                  Automatically ask for a Google review 2 days after a chat—but <strong>only</strong> if the AI detects the customer was happy. Protect your rating while growing reviews on autopilot.
                </p>
              </div>
              <button 
                onClick={() => {
                  setEditingRule({
                    id: `a-${Date.now()}`,
                    name: 'Smart Review Collection',
                    triggerSource: 'When customer sentiment is deeply positive after a resolved chat',
                    aiSummary: 'Wait 48 hours, then send a polite request with a link to our Google My Business page.',
                    status: 'Learning',
                    customersReached: 0,
                    actionsTaken: 0,
                  });
                  setIsDrawerOpen(true);
                }} 
                className="shrink-0 h-10 px-5 bg-white dark:bg-black border border-border/50 group-hover:border-border text-foreground text-[14px] font-medium rounded-lg shadow-sm hover:shadow transition-all flex items-center"
              >
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
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="group relative bg-background border border-border/40 hover:border-border/80 rounded-2xl p-6 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:hover:shadow-[0_8px_30px_rgb(255,255,255,0.02)]"
                >
                  <div className="flex flex-col sm:flex-row gap-6 justify-between items-start">
                    
                    {/* Left: Info */}
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="text-[16px] font-medium text-foreground tracking-tight">{rule.name}</h4>
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[11px] font-medium",
                          rule.status === 'Active' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500" :
                          rule.status === 'Paused' ? "bg-muted text-muted-foreground" :
                          "bg-amber-500/10 text-amber-600 dark:text-amber-500"
                        )}>
                          {rule.status}
                        </span>
                      </div>
                      
                      <div className="text-[13px] font-medium text-muted-foreground flex items-center gap-2">
                        <span className="uppercase text-[11px] tracking-wider text-muted-foreground/60">When:</span>
                        {rule.triggerSource}
                      </div>

                      <p className="text-[14px] text-muted-foreground/80 leading-relaxed max-w-xl">
                        {rule.aiSummary}
                      </p>
                    </div>

                    {/* Right: Outcomes & Hover Actions */}
                    <div className="flex flex-col items-end gap-4 shrink-0 sm:min-w-[140px]">
                      
                      {/* Stats (Visible by default, fades out on hover) */}
                      <div className="flex flex-col items-end gap-3 group-hover:opacity-0 group-hover:pointer-events-none transition-opacity duration-200 absolute sm:relative right-6 top-6 sm:right-auto sm:top-auto">
                        <div className="text-right">
                          <div className="text-[20px] font-semibold tracking-tight text-foreground">{rule.customersReached}</div>
                          <div className="text-[12px] text-muted-foreground">Customers Reached</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[20px] font-semibold tracking-tight text-foreground">{rule.actionsTaken}</div>
                          <div className="text-[12px] text-muted-foreground">Actions Taken</div>
                        </div>
                      </div>

                      {/* Actions (Hidden by default, fades in on hover) */}
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-4 transition-all duration-300 flex items-center gap-2">
                        <button onClick={() => handleEdit(rule)} className="flex items-center gap-2 h-9 px-3 bg-muted hover:bg-muted/80 text-foreground text-[13px] font-medium rounded-lg transition-colors" title="Edit">
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button onClick={() => router.push('/dashboard/analytics')} className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors" title="View Analytics">
                          <BarChart2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleTogglePause(rule.id, rule.status)} className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors" title={rule.status === 'Paused' ? 'Resume' : 'Pause'}>
                          {rule.status === 'Paused' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                        </button>
                        <div className="w-px h-4 bg-border mx-1"></div>
                        <button onClick={() => handleDelete(rule.id)} className="h-9 w-9 flex items-center justify-center bg-muted hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-lg transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* RIGHT SIDE DRAWER FOR EDITING */}
      {isDrawerOpen && (
        <>
          <div 
            className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-40 transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[480px] bg-background border-l border-border shadow-2xl z-50 flex flex-col transform transition-transform duration-300 translate-x-0">
            
            {/* Drawer Header */}
            <div className="h-16 border-b border-border flex items-center justify-between px-6 shrink-0">
              <h2 className="text-[16px] font-semibold tracking-tight text-foreground">
                {editingRule?.name ? 'Edit Rule' : 'New Rule'}
              </h2>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground">Rule Name</label>
                <input 
                  type="text" 
                  value={editingRule?.name || ''}
                  onChange={(e) => setEditingRule(prev => prev ? {...prev, name: e.target.value} : null)}
                  placeholder="e.g. Follow Up Interested Customers"
                  className="w-full h-10 px-3 bg-background border border-border/80 rounded-lg text-[14px] focus:outline-none focus:border-foreground/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground">When does this trigger?</label>
                <input 
                  type="text" 
                  value={editingRule?.triggerSource || ''}
                  onChange={(e) => setEditingRule(prev => prev ? {...prev, triggerSource: e.target.value} : null)}
                  placeholder="e.g. When someone asks about pricing but leaves"
                  className="w-full h-10 px-3 bg-background border border-border/80 rounded-lg text-[14px] focus:outline-none focus:border-foreground/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground">What should the AI do?</label>
                <textarea 
                  value={editingRule?.aiSummary || ''}
                  onChange={(e) => setEditingRule(prev => prev ? {...prev, aiSummary: e.target.value} : null)}
                  placeholder="e.g. Wait 2 hours, then send a polite message asking if they have any questions about the pricing."
                  className="w-full h-32 p-3 bg-background border border-border/80 rounded-lg text-[14px] focus:outline-none focus:border-foreground/50 transition-colors resize-none"
                />
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-6 border-t border-border flex items-center justify-between bg-muted/20 shrink-0">
              {editingRule?.id && rules.some(r => r.id === editingRule.id) ? (
                <button 
                  onClick={() => handleDelete(editingRule.id)}
                  className="h-10 px-4 text-[13px] font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-colors flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </button>
              ) : (
                <div></div>
              )}
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsDrawerOpen(false)}
                  className="h-10 px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="h-10 px-5 bg-foreground text-background hover:bg-foreground/90 rounded-lg text-[13px] font-medium transition-transform active:scale-95 flex items-center shadow-sm"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Rule
                </button>
              </div>
            </div>

          </div>
        </>
      )}

    </div>
  );
}
