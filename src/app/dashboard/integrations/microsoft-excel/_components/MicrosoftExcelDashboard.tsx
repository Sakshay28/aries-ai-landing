"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft, 
  Settings, Activity, Layers, ChevronRight, AlertTriangle, Clock
} from 'lucide-react';
import { toast } from 'sonner';

interface SyncStats {
  connectionStatus: string;
  connectedEmail: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  lastSync: string;
  lastSuccess: string;
  lastFailed: string;
  createdToday: number;
  updatedToday: number;
  failedToday: number;
  retryQueueCount: number;
  syncHealth: number;
  averageLatency: number;
  authError?: string;
}

interface AuditLog {
  id: string;
  phone: string;
  event_type: string;
  status: 'success' | 'failed';
  error_message: string | null;
  latency_ms: number;
  created_at: string;
  details: Record<string, any>;
  lead?: { name: string } | null;
}

const CRM_FIELDS = [
  { key: 'name', label: 'Customer Name', category: 'Contact Info' },
  { key: 'phone', label: 'WhatsApp Number', category: 'Contact Info' },
  { key: 'source', label: 'Lead Source', category: 'Contact Info' },
  { key: 'status', label: 'Lead Status', category: 'Contact Info' },
  { key: 'assigned_to_name', label: 'Assigned To', category: 'Team Assignment' },
  { key: 'assigned_at', label: 'Assigned At', category: 'Team Assignment' },
  { key: 'first_contact_time', label: 'First Contact', category: 'Timestamps' },
  { key: 'last_activity', label: 'Last Activity', category: 'Timestamps' },
  { key: 'latest_message', label: 'Latest Message', category: 'Conversation' },
  { key: 'tags', label: 'Tags', category: 'Tags' },
];

export function MicrosoftExcelDashboard() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [worksheets, setWorksheets] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
  const [selectedWorksheet, setSelectedWorksheet] = useState('');

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/dashboard/microsoft-excel/stats');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setStats(data.stats);
      setAuditLogs(data.auditLogs);
      
      if (data.connected && data.stats) {
        setSelectedWorksheet(data.stats.sheetName);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to fetch dashboard metrics');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/microsoft-excel/settings');
      const data = await res.json();
      if (res.ok) {
        setWorksheets(data.worksheets || []);
      }
    } catch (e) {
      console.warn('⚠️ Failed to load Excel sheets list:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadSettings();
  }, [loadData, loadSettings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/microsoft-excel/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetName: selectedWorksheet,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success('Microsoft Excel configuration updated successfully');
      loadData(true);
      setActiveTab('overview');
    } catch (e: any) {
      toast.error(e.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const res = await fetch('/api/dashboard/microsoft-excel/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success('Sync job rescheduled for immediate execution');
      loadData(true);
    } catch (e: any) {
      toast.error(e.message || 'Retry request failed');
    } finally {
      setRetryingJobId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-foreground space-y-4">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm text-muted-foreground animate-pulse">Retrieving Microsoft Excel integration state...</p>
      </div>
    );
  }

  const isConnected = stats?.connectionStatus === 'Connected' || stats?.connectionStatus === 'Authentication Required';

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1200px] mx-auto w-full space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <a href="/dashboard/integrations" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors mr-1">
                <ArrowLeft className="w-4 h-4" />
              </a>
              <h1 className="text-2xl font-bold tracking-tight">Microsoft Excel Live CRM Mirror</h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-2xl ml-8">
              Real-time mirror syncing customer contacts, assignments, and lifecycle metrics directly to Excel workbook.
            </p>
          </div>
        </div>

        {!isConnected ? (
          <div className="p-12 rounded-3xl border border-dashed border-border text-center space-y-4 max-w-lg mx-auto mt-12 bg-card">
            <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500 w-fit mx-auto">
              <FileSpreadsheet className="w-10 h-10" />
            </div>
            <h2 className="text-lg font-semibold">Connect Microsoft Excel</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Microsoft Excel integration is currently disconnected. Connect your Microsoft account on the Integrations panel to activate live updates.
            </p>
            <a
              href="/dashboard/integrations"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-all inline-block shadow-sm"
            >
              Go to Integrations
            </a>
          </div>
        ) : (
          <>
            {/* Warning Banner if Auth Required */}
            {stats?.connectionStatus === 'Authentication Required' && (
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs flex flex-col md:flex-row justify-between md:items-center gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-sm">Action Required: Microsoft Excel Re-Authentication Needed</div>
                    <p className="opacity-90">{stats.authError || 'OAuth credentials expired or revoked. Synchronization is currently suspended.'}</p>
                  </div>
                </div>
                <a
                  href="/dashboard/integrations"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all whitespace-nowrap self-start md:self-auto text-center"
                >
                  Re-Connect Microsoft
                </a>
              </div>
            )}

            {/* Connection Bar */}
            <div className="p-4 rounded-2xl bg-card border border-emerald-500/20 shadow-[0_0_0_1px_rgba(16,185,129,0.05)] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm leading-none">{stats?.spreadsheetName || 'Connected Workbook'}</h3>
                    {stats?.connectionStatus === 'Authentication Required' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 font-bold">SUSPENDED</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-bold">ACTIVE</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Workbook ID: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">{stats?.spreadsheetId}</code>
                  </p>
                </div>
              </div>

              <div className="text-xs text-muted-foreground flex flex-col md:items-end gap-1">
                <div>Connected Account: <span className="font-medium text-foreground">{stats?.connectedEmail || 'Unknown'}</span></div>
                <div>Worksheet Tab: <span className="font-medium text-foreground">"{stats?.sheetName}"</span></div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border gap-6">
              <button
                onClick={() => setActiveTab('overview')}
                className={`pb-3 text-sm font-semibold border-b-2 transition-all ${activeTab === 'overview' ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <div className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4" /> Overview & Live Logs
                </div>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`pb-3 text-sm font-semibold border-b-2 transition-all ${activeTab === 'settings' ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <div className="flex items-center gap-1.5">
                  <Settings className="w-4 h-4" /> Worksheet Settings
                </div>
              </button>
            </div>

            {/* Content Tab Overview */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Health card */}
                  <div className="p-5 rounded-2xl bg-card border shadow-sm flex flex-col">
                    <span className="text-xs text-muted-foreground font-semibold">Sync Health</span>
                    <span className="text-2xl font-bold mt-2 text-emerald-500">{stats?.syncHealth}%</span>
                    <p className="text-[10px] text-muted-foreground mt-1">Percentage of successful updates over last 24h</p>
                  </div>

                  {/* Avg Latency */}
                  <div className="p-5 rounded-2xl bg-card border shadow-sm flex flex-col">
                    <span className="text-xs text-muted-foreground font-semibold">Avg Sync Speed</span>
                    <span className="text-2xl font-bold mt-2 text-indigo-500">{(stats?.averageLatency || 0).toFixed(2)}s</span>
                    <p className="text-[10px] text-muted-foreground mt-1">Average round-trip response time from Microsoft</p>
                  </div>

                  {/* Operations Today */}
                  <div className="p-5 rounded-2xl bg-card border shadow-sm flex flex-col">
                    <span className="text-xs text-muted-foreground font-semibold">Operations Today</span>
                    <span className="text-2xl font-bold mt-2 flex items-baseline gap-1.5">
                      <span className="text-emerald-500 font-bold" title="Created">{stats?.createdToday}c</span>
                      <span className="text-indigo-500 font-bold" title="Updated">+{stats?.updatedToday}u</span>
                      {stats?.failedToday ? <span className="text-rose-500 font-bold" title="Failed">/{stats.failedToday}f</span> : null}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-1">Total writes pushed to Excel today</p>
                  </div>

                  {/* Retry queue length */}
                  <div className="p-5 rounded-2xl bg-card border shadow-sm flex flex-col">
                    <span className="text-xs text-muted-foreground font-semibold">Retry Queue</span>
                    <span className="text-2xl font-bold mt-2 flex items-baseline gap-1">
                      {stats?.retryQueueCount}
                      {stats?.retryQueueCount && stats.retryQueueCount > 0 ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" /> Retry-Pending
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                          Clear
                        </span>
                      )}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-1">Failed operations awaiting retry</p>
                  </div>
                </div>

                {/* Audit Logs Table */}
                <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <div className="space-y-0.5">
                      <h3 className="font-semibold text-sm">Real-Time Sync Logs</h3>
                      <p className="text-xs text-muted-foreground">Historical records of last 50 spreadsheet write operations</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-5">Time</th>
                          <th className="py-3 px-5">Customer (Phone)</th>
                          <th className="py-3 px-5">Event Trigger</th>
                          <th className="py-3 px-5">Latency</th>
                          <th className="py-3 px-5">Status</th>
                          <th className="py-3 px-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-muted-foreground">
                              No spreadsheet sync logs recorded yet. Incoming chat updates will appear here live.
                            </td>
                          </tr>
                        ) : (
                          auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                              <td className="py-3.5 px-5 text-muted-foreground whitespace-nowrap">
                                {new Date(log.created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' })}
                              </td>
                              <td className="py-3.5 px-5 font-medium whitespace-nowrap">
                                <div className="flex flex-col">
                                  <span>{log.lead?.name || 'Unknown'}</span>
                                  <span className="text-[10px] text-muted-foreground">{log.phone}</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground">
                                  {log.event_type}
                                </span>
                              </td>
                              <td className="py-3.5 px-5 whitespace-nowrap text-muted-foreground">
                                {log.status === 'success' ? `${(log.latency_ms / 1000).toFixed(2)}s` : '—'}
                              </td>
                              <td className="py-3.5 px-5 whitespace-nowrap">
                                {log.status === 'success' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">SUCCESS</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20" title={log.error_message || ''}>FAILED</span>
                                )}
                              </td>
                              <td className="py-3.5 px-5 whitespace-nowrap text-right">
                                {log.status === 'failed' && (
                                  <button
                                    onClick={() => handleRetryJob(log.id)}
                                    disabled={retryingJobId === log.id}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:text-indigo-400 transition-all inline-flex items-center gap-1 disabled:opacity-50"
                                  >
                                    <RefreshCw className={`w-3 h-3 ${retryingJobId === log.id ? 'animate-spin' : ''}`} />
                                    Retry
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Content Tab Settings */}
            {activeTab === 'settings' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-6">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">Excel Worksheet Configuration</h3>
                      <p className="text-xs text-muted-foreground mt-1">Choose the specific worksheet tab in your Excel workbook to mirror contacts.</p>
                    </div>

                    <form onSubmit={handleSaveSettings} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Select Worksheet Tab</label>
                        <select
                          value={selectedWorksheet}
                          onChange={(e) => setSelectedWorksheet(e.target.value)}
                          className="w-full text-sm p-2 rounded-xl bg-background border border-border outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                        >
                          <option value="">-- Choose Tab --</option>
                          {worksheets.map(w => (
                            <option key={w} value={w}>{w}</option>
                          ))}
                        </select>
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={saving || !selectedWorksheet}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                        >
                          {saving ? 'Saving...' : 'Save Configuration'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
                    <h3 className="font-semibold text-sm">Default Column Mapping</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Aries AI automatically mirrors contacts to a structured schema. The following headers will be created and kept in sync:
                    </p>
                    <div className="space-y-2.5">
                      {CRM_FIELDS.map(f => (
                        <div key={f.key} className="flex justify-between items-center text-xs py-1 border-b border-border/40">
                          <span className="font-medium">{f.label}</span>
                          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">{f.key}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
