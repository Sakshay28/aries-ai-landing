"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Plus, X, GitMerge, BrainCircuit, Save, Activity, Settings2, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface AIAgent {
  id: string;
  name: string;
  role: string;
  model: string;
  routing_keywords: string[];
  system_prompt: string;
  status: 'active' | 'draft';
}

const DEFAULT_AGENTS: AIAgent[] = [
  {
    id: '1',
    name: 'Sales Qualifier',
    role: 'Lead Generation',
    model: 'gemini-1.5-flash',
    routing_keywords: ['buy', 'pricing', 'cost', 'sales', '1'],
    system_prompt: 'You are an aggressive but polite sales agent. Your goal is to collect the user email, phone number, and budget. Do not answer technical questions.',
    status: 'active',
  },
  {
    id: '2',
    name: 'Tech Support',
    role: 'Customer Service',
    model: 'gemini-1.5-pro',
    routing_keywords: ['help', 'broken', 'issue', 'support', '2'],
    system_prompt: 'You are an empathetic technical support agent. Use the knowledge base to troubleshoot issues. If you cannot solve it, ask the user if they want to speak to a human.',
    status: 'active',
  }
];

export function AgentsClient() {
  const [agents, setAgents] = useState<AIAgent[]>(DEFAULT_AGENTS);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  
  const [editingAgent, setEditingAgent] = useState<Partial<AIAgent>>({});

  const openCreator = () => {
    setEditingAgent({
      name: '',
      role: '',
      model: 'gemini-1.5-flash',
      routing_keywords: [],
      system_prompt: '',
      status: 'active'
    });
    setActiveModal('creator');
  };

  const openEditor = (agent: AIAgent) => {
    setEditingAgent({ ...agent });
    setActiveModal('creator');
  };

  const handleSave = () => {
    if (!editingAgent.name || !editingAgent.role) {
      toast.error('Name and Role are required');
      return;
    }
    
    if (editingAgent.id) {
      setAgents(agents.map(a => a.id === editingAgent.id ? editingAgent as AIAgent : a));
      toast.success('Agent updated successfully');
    } else {
      const newAgent: AIAgent = {
        ...editingAgent as AIAgent,
        id: Math.random().toString(36).substr(2, 9),
      };
      setAgents([...agents, newAgent]);
      toast.success('Agent created successfully');
    }
    setActiveModal(null);
  };

  const handleKeywordChange = (v: string) => {
    const keywords = v.split(',').map(k => k.trim()).filter(Boolean);
    setEditingAgent({ ...editingAgent, routing_keywords: keywords });
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1200px] mx-auto w-full space-y-8">
        
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AI Agents</h1>
            <p className="text-muted-foreground text-sm max-w-2xl mt-1">
              Create specialized AI agents to handle different parts of your business. The router will automatically forward WhatsApp messages to the right agent based on keywords.
            </p>
          </div>
          <button 
            onClick={openCreator}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors w-max shadow-sm"
          >
            <Plus className="w-4 h-4" /> Create Agent
          </button>
        </header>

        {/* Global Router Status */}
        <div className="p-6 rounded-2xl bg-card border border-border shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-start gap-5">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0 mt-0.5">
            <GitMerge className="w-6 h-6" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold">Global Message Router</h2>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <Activity className="w-3 h-3" /> Active
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              When a new user messages you, the router intercepts the message and scans for trigger keywords. If a match is found, the conversation is permanently locked to that specific agent until the user resets the chat. If no keywords match, the default fallback agent handles the conversation.
            </p>
          </div>
        </div>

        {/* Agents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => openEditor(agent)}
              className="p-6 rounded-2xl bg-card border border-border hover:border-indigo-500/30 hover:shadow-[0_4px_20px_rgba(99,102,241,0.05)] cursor-pointer transition-all flex flex-col h-full group"
            >
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground border border-border group-hover:scale-105 transition-transform">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{agent.name}</h3>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">{agent.role}</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4 flex-1">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Settings2 className="w-3.5 h-3.5" /> Model Engine
                  </p>
                  <p className="text-sm font-mono text-foreground/80 bg-secondary/50 px-2 py-1 rounded-md border border-border/50 inline-block">
                    {agent.model}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <GitMerge className="w-3.5 h-3.5" /> Routing Triggers
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.routing_keywords.map(kw => (
                      <span key={kw} className="px-2 py-0.5 text-xs bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded-md">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          
          {/* Add New Agent Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: agents.length * 0.05 }}
            onClick={openCreator}
            className="p-6 rounded-2xl border-2 border-dashed border-border/60 hover:border-indigo-500/50 hover:bg-indigo-500/5 cursor-pointer transition-colors flex flex-col items-center justify-center text-center min-h-[240px]"
          >
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-muted-foreground mb-4">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Add New Agent</h3>
            <p className="text-xs text-muted-foreground max-w-[200px]">Create a new specialized AI persona for your business</p>
          </motion.div>
        </div>

      </div>

      {/* Editor Drawer */}
      <AnimatePresence>
        {activeModal === 'creator' && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={() => setActiveModal(null)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-card border-l border-border shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-6 h-16 border-b border-border shrink-0 bg-secondary/30">
                <div className="flex items-center gap-3">
                  <Bot className="w-5 h-5 text-indigo-500" />
                  <div>
                    <h2 className="text-base font-semibold">{editingAgent.id ? 'Edit Agent' : 'Create Agent'}</h2>
                  </div>
                </div>
                <button onClick={() => setActiveModal(null)} className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6 space-y-8 custom-scrollbar">
                
                {/* Identity */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> Identity
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Agent Name</label>
                      <input 
                        value={editingAgent.name || ''}
                        onChange={e => setEditingAgent({...editingAgent, name: e.target.value})}
                        placeholder="e.g. Sales Qualifier"
                        className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Role</label>
                      <input 
                        value={editingAgent.role || ''}
                        onChange={e => setEditingAgent({...editingAgent, role: e.target.value})}
                        placeholder="e.g. Lead Generation"
                        className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Routing */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <GitMerge className="w-4 h-4" /> Routing logic
                  </h3>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Trigger Keywords (comma separated)</label>
                    <input 
                      value={editingAgent.routing_keywords?.join(', ') || ''}
                      onChange={e => handleKeywordChange(e.target.value)}
                      placeholder="buy, pricing, cost, 1"
                      className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors"
                    />
                    <p className="text-[11px] text-muted-foreground">If a user messages any of these words, this agent will take over the chat.</p>
                  </div>
                </div>

                {/* Engine Configuration */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4" /> Engine Configuration
                  </h3>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">LLM Model</label>
                    <select 
                      value={editingAgent.model || 'gemini-1.5-flash'}
                      onChange={e => setEditingAgent({...editingAgent, model: e.target.value})}
                      className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors appearance-none"
                    >
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fastest, best for simple tasks)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Best reasoning, complex support)</option>
                      <option value="claude-3-haiku">Claude 3 Haiku</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      System Instructions
                      <span className="flex items-center gap-1 text-indigo-500 font-medium bg-indigo-500/10 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider">
                        <Sparkles className="w-3 h-3" /> Auto-Prompt
                      </span>
                    </label>
                    <textarea 
                      value={editingAgent.system_prompt || ''}
                      onChange={e => setEditingAgent({...editingAgent, system_prompt: e.target.value})}
                      rows={8}
                      placeholder="You are an aggressive but polite sales agent..."
                      className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors resize-none font-mono"
                    />
                  </div>
                </div>

              </div>

              <div className="p-6 border-t border-border bg-secondary/30 shrink-0 flex items-center justify-end gap-3">
                <button 
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Save className="w-4 h-4" /> Save Agent
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
