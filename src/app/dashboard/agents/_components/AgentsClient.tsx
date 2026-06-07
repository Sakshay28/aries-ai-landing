"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Plus, X, GitMerge, BrainCircuit, Save, Activity, Settings2, ShieldCheck, Sparkles, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AIAgent {
  id: string;
  agent_name: string;
  agent_description: string;
  routing_keywords: string[];
  bot_name: string;
  bot_personality: string;
  system_prompt: string;
  is_active: boolean;
}

type EditingAgent = Partial<AIAgent>;

export function AgentsClient() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<EditingAgent>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/agents');
      const json = await res.json();
      if (json.success) setAgents(json.data || []);
    } catch {
      toast.error('Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreator = () => {
    setEditingAgent({
      agent_name: '',
      agent_description: '',
      routing_keywords: [],
      bot_name: '',
      bot_personality: '',
      system_prompt: '',
      is_active: true,
    });
    setActiveModal('creator');
  };

  const openEditor = (agent: AIAgent) => {
    setEditingAgent({ ...agent });
    setActiveModal('creator');
  };

  const handleSave = async () => {
    if (!editingAgent.agent_name?.trim()) {
      toast.error('Agent name is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        agent_name: editingAgent.agent_name,
        agent_description: editingAgent.agent_description || '',
        routing_keywords: editingAgent.routing_keywords || [],
        bot_name: editingAgent.bot_name || '',
        bot_personality: editingAgent.bot_personality || '',
        system_prompt: editingAgent.system_prompt || '',
        is_active: editingAgent.is_active ?? true,
      };

      let res: Response;
      if (editingAgent.id) {
        res = await fetch(`/api/dashboard/agents/${editingAgent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/dashboard/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');

      toast.success(editingAgent.id ? 'Agent updated' : 'Agent created');
      setActiveModal(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message || 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/dashboard/agents/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Agent deleted');
      setAgents(prev => prev.filter(a => a.id !== id));
    } catch {
      toast.error('Failed to delete agent');
    } finally {
      setDeleting(null);
    }
  };

  const handleKeywordChange = (v: string) => {
    const keywords = v.split(',').map(k => k.trim()).filter(Boolean);
    setEditingAgent(prev => ({ ...prev, routing_keywords: keywords }));
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1200px] mx-auto w-full space-y-8">

        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AI Assistant</h1>
            <p className="text-muted-foreground text-sm max-w-2xl mt-1">
              Create specialized AI agents to handle different parts of your business. The router automatically forwards WhatsApp messages to the right agent based on keywords.
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
              When a user messages, the router scans for trigger keywords. If matched, the conversation is locked to that agent. If no keywords match, the default bot (configured in Settings) handles it.
            </p>
          </div>
        </div>

        {/* Agents Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading agents...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent, i) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => openEditor(agent)}
                className="p-6 rounded-2xl bg-card border border-border hover:border-indigo-500/30 hover:shadow-[0_4px_20px_rgba(99,102,241,0.05)] cursor-pointer transition-all flex flex-col h-full group relative"
              >
                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(agent.id, e)}
                  disabled={deleting === agent.id}
                  className="absolute top-4 right-4 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 text-muted-foreground transition-all"
                >
                  {deleting === agent.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </button>

                <div className="flex items-start gap-3 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground border border-border group-hover:scale-105 transition-transform shrink-0">
                    <Bot className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{agent.agent_name}</h3>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5 truncate">{agent.agent_description || 'No description'}</p>
                  </div>
                </div>

                <div className="space-y-4 flex-1">
                  {agent.bot_name && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Settings2 className="w-3.5 h-3.5" /> Bot Name
                      </p>
                      <p className="text-sm text-foreground/80 bg-secondary/50 px-2 py-1 rounded-md border border-border/50 inline-block">
                        {agent.bot_name}
                      </p>
                    </div>
                  )}

                  {agent.routing_keywords.length > 0 && (
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
                  )}

                  {agent.system_prompt && (
                    <p className="text-xs text-muted-foreground line-clamp-2 italic">
                      "{agent.system_prompt.slice(0, 100)}{agent.system_prompt.length > 100 ? '...' : ''}"
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-border/40 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${agent.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                  <span className="text-xs text-muted-foreground">{agent.is_active ? 'Active' : 'Draft'}</span>
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
              <p className="text-xs text-muted-foreground max-w-[200px]">Create a specialized AI persona for your business</p>
            </motion.div>
          </div>
        )}
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
                  <h2 className="text-base font-semibold">{editingAgent.id ? 'Edit Agent' : 'Create Agent'}</h2>
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
                      <label className="text-xs font-semibold text-foreground">Agent Name *</label>
                      <input
                        value={editingAgent.agent_name || ''}
                        onChange={e => setEditingAgent(prev => ({ ...prev, agent_name: e.target.value }))}
                        placeholder="e.g. Sales Assistant"
                        className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Role / Description</label>
                      <input
                        value={editingAgent.agent_description || ''}
                        onChange={e => setEditingAgent(prev => ({ ...prev, agent_description: e.target.value }))}
                        placeholder="e.g. Lead Generation"
                        className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Bot Name (shown to customers)</label>
                      <input
                        value={editingAgent.bot_name || ''}
                        onChange={e => setEditingAgent(prev => ({ ...prev, bot_name: e.target.value }))}
                        placeholder="e.g. Priya"
                        className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Personality</label>
                      <input
                        value={editingAgent.bot_personality || ''}
                        onChange={e => setEditingAgent(prev => ({ ...prev, bot_personality: e.target.value }))}
                        placeholder="e.g. Friendly, professional"
                        className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Routing */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <GitMerge className="w-4 h-4" /> Routing Logic
                  </h3>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Trigger Keywords (comma separated)</label>
                    <input
                      value={editingAgent.routing_keywords?.join(', ') || ''}
                      onChange={e => handleKeywordChange(e.target.value)}
                      placeholder="book, reserve, table, appointment"
                      className="w-full h-10 px-3 bg-background border border-border rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors"
                    />
                    <p className="text-[11px] text-muted-foreground">Leave empty to make this the default agent for all messages.</p>
                  </div>
                </div>

                {/* Instructions */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4" /> AI Instructions
                  </h3>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      System Instructions
                      <span className="flex items-center gap-1 text-indigo-500 font-medium bg-indigo-500/10 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider">
                        <Sparkles className="w-3 h-3" /> Injected into every reply
                      </span>
                    </label>
                    <textarea
                      value={editingAgent.system_prompt || ''}
                      onChange={e => setEditingAgent(prev => ({ ...prev, system_prompt: e.target.value }))}
                      rows={10}
                      placeholder="Describe how this agent should behave, what it should collect, what it should not answer, etc."
                      className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:border-indigo-500 outline-none transition-colors resize-none"
                    />
                  </div>
                </div>

                {/* Status */}
                <div className="pt-4 border-t border-border/50 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Active</p>
                    <p className="text-xs text-muted-foreground">Inactive agents are ignored by the router</p>
                  </div>
                  <button
                    onClick={() => setEditingAgent(prev => ({ ...prev, is_active: !prev.is_active }))}
                    className={`relative w-11 h-6 rounded-full transition-colors ${editingAgent.is_active ? 'bg-indigo-600' : 'bg-border'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${editingAgent.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
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
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Saving...' : 'Save Agent'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
