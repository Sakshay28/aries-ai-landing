"use client";

import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit, Trash2, Tag, X, Bot, Sparkles, MessageSquare, Loader2, AlertCircle, Save, CheckCircle2, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FeaturePageGate } from '../_layout/FeaturePageGate';


interface AgentConfig {
  id: string;
  agent_name: string;
  agent_description: string;
  routing_keywords: string[];
  bot_name: string;
  bot_personality: string;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
}

// ────────────────────────────────────────────────────────────
// Tag Input Component
// ────────────────────────────────────────────────────────────
function TagInput({
  tags,
  onChange,
  placeholder = 'Type a keyword and press Enter',
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => onChange(tags.filter(t => t !== tag));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div
      className="flex flex-wrap gap-2 w-full rounded-xl border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-foreground/10 focus-within:border-foreground/30 transition-all cursor-text min-h-[44px]"
      onClick={() => inputRef.current?.focus()}
    >
      <AnimatePresence initial={false}>
        {tags.map(tag => (
          <motion.span
            key={tag}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          >
            {tag}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeTag(tag); }}
              className="text-emerald-600/70 hover:text-emerald-600 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => input && addTag(input)}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/50 py-1"
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Partial<AgentConfig> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/dashboard/agents');
      const json = await res.json();
      if (json.success) {
        setAgents(json.data);
      } else {
        setError(json.error || 'Failed to load agents');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setEditingAgent({
      agent_name: '',
      agent_description: '',
      routing_keywords: [],
      bot_name: 'Aries AI',
      bot_personality: 'Friendly and helpful',
      system_prompt: '',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleEdit = (agent: AgentConfig) => {
    setEditingAgent(agent);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;
    try {
      const res = await fetch(`/api/dashboard/agents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAgents(agents.filter(a => a.id !== id));
        toast.success('Agent deleted');
      } else {
        toast.error('Failed to delete agent');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const toggleActive = async (agent: AgentConfig) => {
    const updated = { ...agent, is_active: !agent.is_active };
    setAgents(agents.map(a => a.id === agent.id ? updated : a));
    try {
      await fetch(`/api/dashboard/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: updated.is_active }),
      });
      toast.success(`Agent ${updated.is_active ? 'activated' : 'paused'}`);
    } catch {
      setAgents(agents.map(a => a.id === agent.id ? agent : a)); // revert
      toast.error('Failed to update status');
    }
  };

  const saveAgent = async () => {
    if (!editingAgent?.agent_name) {
      toast.error('Agent Name is required');
      return;
    }
    setSaving(true);
    try {
      const isUpdate = !!editingAgent.id;
      const url = isUpdate ? `/api/dashboard/agents/${editingAgent.id}` : '/api/dashboard/agents';
      const method = isUpdate ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingAgent),
      });
      const json = await res.json();

      if (json.success) {
        toast.success(`Agent ${isUpdate ? 'updated' : 'created'}`);
        setIsModalOpen(false);
        loadAgents();
      } else {
        toast.error(json.error || 'Failed to save');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <FeaturePageGate feature="AI Agents" allowedPlans={["growth", "pro", "enterprise"]}>
      <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 font-sans">
        <div className="max-w-[1080px] mx-auto w-full space-y-8">

          {/* Header */}
          <header className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">Multi-Agent Routing</h1>
              <p className="text-[14px] text-muted-foreground max-w-xl leading-relaxed">
                Create specialized AI agents that automatically take over conversations when specific keywords are mentioned. 
              </p>
            </div>
            <button
              onClick={handleOpenNew}
              className="flex items-center gap-2 h-10 px-4 rounded-xl text-[14px] font-semibold bg-foreground text-background hover:opacity-90 transition-all shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2]" />
              New Agent
            </button>
          </header>

          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Empty State */}
          {agents.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-24 px-6 border border-dashed border-border rounded-2xl bg-card/50 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6">
                <Bot className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No agents configured</h3>
              <p className="text-muted-foreground max-w-md text-[14px] mb-6 leading-relaxed">
                Set up your first agent to automatically handle specific types of inquiries, like "Support", "Sales", or "Billing".
              </p>
              <button
                onClick={handleOpenNew}
                className="flex items-center gap-2 h-10 px-5 rounded-xl text-[14px] font-semibold bg-foreground text-background hover:opacity-90 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" /> Create First Agent
              </button>
            </div>
          )}

          {/* Grid */}
          {agents.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {agents.map((agent) => (
                <div key={agent.id} className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        agent.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                      )}>
                        <Bot className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-[16px] font-semibold tracking-tight text-foreground flex items-center gap-2">
                          {agent.agent_name}
                        </h3>
                        <p className="text-[13px] text-muted-foreground">{agent.agent_description || 'No description'}</p>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(agent)} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(agent.id)} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-background rounded-xl p-3 border border-border/60 mb-4 flex-1">
                    <div className="flex flex-col gap-2">
                      <div className="flex text-[13px]">
                        <span className="text-muted-foreground w-28 font-medium">Bot Name:</span>
                        <span className="text-foreground font-semibold">{agent.bot_name}</span>
                      </div>
                      <div className="flex text-[13px]">
                        <span className="text-muted-foreground w-28 font-medium">Personality:</span>
                        <span className="text-foreground truncate">{agent.bot_personality}</span>
                      </div>
                      <div className="flex text-[13px] mt-1">
                        <span className="text-muted-foreground w-28 font-medium mt-0.5">Triggers on:</span>
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {agent.routing_keywords.length > 0 ? agent.routing_keywords.map((kw, i) => (
                            <span key={i} className="px-2 py-0.5 bg-muted/50 border border-border rounded-md text-[11px] font-medium text-foreground">
                              {kw}
                            </span>
                          )) : <span className="text-muted-foreground italic text-[12px]">No keywords</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer Toggle */}
                  <div className="flex items-center justify-between pt-2">
                    <span className={cn("text-[13px] font-medium", agent.is_active ? "text-emerald-500" : "text-muted-foreground")}>
                      {agent.is_active ? '● Active' : '○ Paused'}
                    </span>
                    
                    <button
                      onClick={() => toggleActive(agent)}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-background",
                        agent.is_active ? "bg-emerald-500" : "bg-muted-foreground/30"
                      )}
                    >
                      <span className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        agent.is_active ? "translate-x-6" : "translate-x-1"
                      )} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Slide-over Modal */}
        <AnimatePresence>
          {isModalOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsModalOpen(false)}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
              />
              <motion.div
                initial={{ x: '100%', opacity: 0.5 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0.5 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 h-full w-full max-w-md bg-background border-l border-border z-50 flex flex-col shadow-2xl"
              >
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">{editingAgent?.id ? 'Edit Agent' : 'Create Agent'}</h2>
                    <p className="text-[13px] text-muted-foreground mt-1">Configure specialized routing and persona.</p>
                  </div>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  
                  <div className="space-y-4">
                    <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">General</h3>
                    
                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-foreground">Agent Name (Internal)</label>
                      <input
                        value={editingAgent?.agent_name}
                        onChange={e => setEditingAgent({ ...editingAgent, agent_name: e.target.value })}
                        placeholder="e.g. Support Escalation"
                        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-[14px] focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30 transition-all outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-foreground">Description</label>
                      <input
                        value={editingAgent?.agent_description}
                        onChange={e => setEditingAgent({ ...editingAgent, agent_description: e.target.value })}
                        placeholder="What does this agent handle?"
                        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-[14px] focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">Routing</h3>
                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-muted-foreground" /> Keywords
                      </label>
                      <p className="text-[12px] text-muted-foreground mb-2">If a customer message contains any of these words, this agent takes over.</p>
                      <TagInput
                        tags={editingAgent?.routing_keywords || []}
                        onChange={tags => setEditingAgent({ ...editingAgent, routing_keywords: tags })}
                        placeholder="e.g. support, help, issue, refund"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">Persona</h3>
                    
                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-foreground">Bot Name</label>
                      <input
                        value={editingAgent?.bot_name}
                        onChange={e => setEditingAgent({ ...editingAgent, bot_name: e.target.value })}
                        placeholder="e.g. Support Bot"
                        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-[14px] focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30 transition-all outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-foreground">Personality Override</label>
                      <input
                        value={editingAgent?.bot_personality}
                        onChange={e => setEditingAgent({ ...editingAgent, bot_personality: e.target.value })}
                        placeholder="e.g. Extremely apologetic and helpful"
                        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-[14px] focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30 transition-all outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-500" /> System Prompt Instructions
                      </label>
                      <p className="text-[12px] text-muted-foreground mb-2">Specific instructions given to the AI when this agent is active.</p>
                      <textarea
                        value={editingAgent?.system_prompt}
                        onChange={e => setEditingAgent({ ...editingAgent, system_prompt: e.target.value })}
                        placeholder="You are the support agent. Always apologize for inconvenience and ask for their order number..."
                        rows={4}
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30 transition-all outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-border bg-muted/20 flex justify-end gap-3">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-[14px] font-medium text-foreground bg-background border border-border hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveAgent}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-semibold bg-foreground text-background hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
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
    </FeaturePageGate>
  );

}
