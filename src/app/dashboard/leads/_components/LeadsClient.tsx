"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, MoreHorizontal, User, Phone, Mail, Clock, ShieldCheck, Flame, ThermometerSun, Snowflake } from 'lucide-react';
import type { Lead } from '@/lib/types';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

const STATUS_COLUMNS = [
  { id: 'new', label: 'New', color: 'bg-blue-500', icon: Clock },
  { id: 'hot', label: 'Hot', color: 'bg-red-500', icon: Flame },
  { id: 'warm', label: 'Warm', color: 'bg-amber-500', icon: ThermometerSun },
  { id: 'cold', label: 'Cold', color: 'bg-slate-500', icon: Snowflake },
  { id: 'converted', label: 'Converted', color: 'bg-emerald-500', icon: ShieldCheck },
];

export function LeadsClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const supabase = createBrowserSupabaseClient();

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/dashboard/leads');
      const data = await res.json();
      if (data.success) {
        setLeads(data.leads);
      }
    } catch (error) {
      console.error('Failed to fetch leads', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, lead_status: newStatus as any } : l));
    
    const { error } = await supabase
      .from('leads')
      .update({ lead_status: newStatus })
      .eq('id', leadId);

    if (error) {
      toast.error('Failed to update lead status');
      fetchLeads(); // Revert
    } else {
      toast.success('Lead updated');
    }
  };

  const filteredLeads = leads.filter(l => 
    !searchQuery || 
    l.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    l.phone?.includes(searchQuery)
  );

  const getLeadsByStatus = (status: string) => filteredLeads.filter(l => l.lead_status === status);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Loading Pipeline...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      <header className="h-[72px] border-b border-border/60 flex items-center justify-between px-6 lg:px-8 shrink-0 relative z-20 backdrop-blur-md bg-background/80">
        <div className="flex items-center gap-6 flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground/90">Sales Pipeline</h1>
          <div className="hidden md:flex max-w-sm relative group w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground/60 group-focus-within:text-indigo-500/70" />
            </div>
            <input 
              type="text" 
              placeholder="Search by name or phone..." 
              className="w-full h-9 pl-10 pr-4 bg-card/60 border border-border/80 hover:border-border focus:border-indigo-500/30 rounded-lg text-sm transition-all outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="h-9 px-4 text-[13px] font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors flex items-center border border-border">
            <Filter className="w-3.5 h-3.5 mr-1.5" /> Filter
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 lg:p-8 custom-scrollbar">
        <div className="flex gap-6 h-full min-w-max pb-4">
          {STATUS_COLUMNS.map((column) => {
            const columnLeads = getLeadsByStatus(column.id);
            const Icon = column.icon;
            
            return (
              <div key={column.id} className="w-[320px] flex flex-col h-full bg-secondary/20 rounded-2xl border border-border/50">
                {/* Column Header */}
                <div className="p-4 flex items-center justify-between border-b border-border/50 bg-background/50 rounded-t-2xl">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${column.color} bg-opacity-10 text-current`}>
                      <Icon className={`w-4 h-4 ${column.color.replace('bg-', 'text-')}`} />
                    </div>
                    <h3 className="font-semibold text-sm">{column.label}</h3>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    {columnLeads.length}
                  </span>
                </div>

                {/* Column Content (Kanban Cards) */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                  <AnimatePresence>
                    {columnLeads.map((lead) => (
                      <motion.div
                        key={lead.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-card p-4 rounded-xl border border-border shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-indigo-500/30 transition-all cursor-pointer group"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="font-medium text-sm text-foreground truncate pr-4">
                            {lead.name || 'Unknown Contact'}
                          </div>
                          <div className="relative">
                            <button className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Phone className="w-3.5 h-3.5" /> {lead.phone || 'No phone'}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" /> Last active: {new Date(lead.last_message_at).toLocaleDateString()}
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                            Score: {lead.lead_score}
                          </div>
                          
                          <select 
                            className="text-xs bg-background border border-border rounded-md px-2 py-1 outline-none focus:border-indigo-500 cursor-pointer"
                            value={lead.lead_status}
                            onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {STATUS_COLUMNS.map(col => (
                              <option key={col.id} value={col.id}>{col.label}</option>
                            ))}
                          </select>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  {columnLeads.length === 0 && (
                    <div className="h-32 flex items-center justify-center border-2 border-dashed border-border/40 rounded-xl text-muted-foreground text-xs font-medium">
                      No leads here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
