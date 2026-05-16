"use client";

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Activity, AlertCircle, CheckCircle2, Clock, Search, Filter } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface LogEvent {
  id: string;
  created_at: string;
  status: string;
  direction?: string;
  content?: string;
  error_message?: string;
}

export function LogsClient() {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    const fetchLogs = async () => {
      // Fetch recent messages as logs
      const { data } = await supabase
        .from('messages')
        .select('id, created_at, status, direction, content, error_message')
        .order('created_at', { ascending: false })
        .limit(100);
        
      setLogs(data || []);
      setLoading(false);
    };
    
    fetchLogs();
  }, [supabase]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      <header className="h-[72px] border-b border-border/60 flex items-center justify-between px-6 lg:px-8 shrink-0 relative z-20 backdrop-blur-md bg-background/80">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg border border-border/50">
            <Terminal className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground/90">System Logs</h1>
            <p className="text-[12px] text-muted-foreground">Real-time webhook and delivery event stream</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="hidden md:flex relative group w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <input 
              type="text" 
              placeholder="Search logs..." 
              className="w-full h-9 pl-9 pr-4 bg-card/60 border border-border/80 rounded-lg text-sm outline-none focus:border-indigo-500/50"
            />
          </div>
          <button className="h-9 px-4 text-[13px] font-medium bg-secondary hover:bg-secondary/80 rounded-lg border border-border flex items-center">
            <Filter className="w-3.5 h-3.5 mr-1.5" /> Filter
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 lg:p-8 custom-scrollbar">
        <div className="max-w-[1200px] mx-auto bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          
          <div className="flex bg-secondary/50 border-b border-border/60 px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            <div className="w-[180px]">Timestamp</div>
            <div className="w-[120px]">Status</div>
            <div className="w-[120px]">Event Type</div>
            <div className="flex-1">Payload / Details</div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-full p-8 text-muted-foreground">Loading system logs...</div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-12 text-muted-foreground">
                <Activity className="w-8 h-8 mb-4 opacity-50" />
                <p>No recent activity logs found.</p>
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-center border-b border-border/40 px-6 py-4 hover:bg-secondary/20 transition-colors text-[13px]">
                  <div className="w-[180px] text-muted-foreground font-mono text-[12px]">
                    {new Date(log.created_at).toLocaleString()}
                  </div>
                  <div className="w-[120px]">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border flex items-center w-max gap-1 ${
                      log.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                      log.status === 'delivered' || log.status === 'read' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      log.status === 'sent' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      'bg-secondary text-muted-foreground border-border/60'
                    }`}>
                      {log.status === 'failed' ? <AlertCircle className="w-3 h-3" /> : 
                       (log.status === 'delivered' || log.status === 'read') ? <CheckCircle2 className="w-3 h-3" /> : 
                       <Clock className="w-3 h-3" />}
                      {log.status}
                    </span>
                  </div>
                  <div className="w-[120px] font-medium text-foreground/80">
                    {log.direction === 'inbound' ? 'WEBHOOK_IN' : 'API_OUT'}
                  </div>
                  <div className="flex-1 font-mono text-[12px] truncate text-muted-foreground">
                    {log.status === 'failed' ? (
                      <span className="text-red-500">{log.error_message || 'Unknown delivery failure'}</span>
                    ) : (
                      log.content || 'Media/Interactive Payload'
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
