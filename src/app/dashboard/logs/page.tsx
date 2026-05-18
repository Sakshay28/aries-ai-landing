"use client";

import React, { useState, useEffect } from 'react';
import { Activity, Search, RefreshCw, Loader2, ArrowDownRight, ArrowUpRight, Zap, CreditCard, Brain } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface EventLog {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  message: string;
  sender: string;
  ai_generated: boolean;
  status: string;
  flow_fired: string | null;
  intent: string | null;
  payment_requested: boolean;
  payment_amount: string | null;
}

export default function WebhookLogsPage() {
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/logs');
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => 
    log.message.toLowerCase().includes(search.toLowerCase()) || 
    log.sender.includes(search) ||
    (log.intent && log.intent.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 font-sans">
      <div className="max-w-[1200px] mx-auto w-full space-y-8">
        
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              Event Logs <Activity className="w-5 h-5 text-blue-500" />
            </h1>
            <p className="text-[14px] text-muted-foreground max-w-xl leading-relaxed">
              Real-time feed of inbound messages, matched intents, fired flows, and AI executions.
            </p>
          </div>
          <button 
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 h-10 px-4 rounded-xl text-[14px] font-medium border border-border bg-background hover:bg-muted transition-all shadow-sm shrink-0"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Refresh
          </button>
        </header>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone, message, or intent..."
              className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-[14px] focus:ring-2 focus:ring-foreground/10 outline-none transition-all"
            />
          </div>
        </div>

        {/* Log List */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          {loading && logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mb-3" />
              <p className="text-[14px]">Loading event stream...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Activity className="w-8 h-8 mb-3 opacity-20" />
              <p className="text-[14px]">No logs found.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredLogs.map(log => (
                <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center">
                  
                  {/* Icon & Time */}
                  <div className="flex items-center gap-3 md:w-48 shrink-0">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      log.direction === 'inbound' ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"
                    )}>
                      {log.direction === 'inbound' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-foreground tracking-wider uppercase">
                        {log.direction}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(new Date(log.timestamp), 'MMM d, HH:mm:ss')}
                      </div>
                    </div>
                  </div>

                  {/* Message Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-muted-foreground mb-1">
                      {log.sender}
                    </div>
                    <div className="text-[14px] text-foreground truncate">
                      {log.message}
                    </div>
                  </div>

                  {/* Badges / Metadata */}
                  <div className="flex flex-wrap items-center gap-2 md:w-auto shrink-0 justify-end">
                    {log.flow_fired && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-500/10 border border-purple-500/20 text-[11px] font-medium text-purple-600 dark:text-purple-400">
                        <Zap className="w-3 h-3" /> Flow: {log.flow_fired}
                      </span>
                    )}
                    {log.intent && log.direction === 'inbound' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <Brain className="w-3 h-3" /> Intent: {log.intent}
                      </span>
                    )}
                    {log.payment_requested && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CreditCard className="w-3 h-3" /> Link: ₹{log.payment_amount}
                      </span>
                    )}
                    {log.status === 'failed' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-[11px] font-medium text-red-600 dark:text-red-400">
                        Failed
                      </span>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
