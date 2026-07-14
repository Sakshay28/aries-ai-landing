"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { contactDisplayName } from '@/lib/utils/contact-name';
import { 
  FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft, 
  Settings, Activity, Layers, Database, ChevronRight, Play, Check, 
  HelpCircle, Clock, ShieldCheck, Heart, AlertTriangle
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

// Core list of CRM Fields available for spreadsheet mapping
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

export function GoogleSheetsDashboard() {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [worksheets, setWorksheets] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
  
  const [selectedWorksheet, setSelectedWorksheet] = useState('');

  // 1. Fetch dashboard metrics & recent audits
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/dashboard/google-sheets/stats');
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

  // 2. Fetch worksheet options & configuration settings
  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/google-sheets/settings');
      const data = await res.json();
      if (res.ok) {
        setWorksheets(data.worksheets || []);
      }
    } catch (e) {
      console.warn('⚠️ Failed to load sheet list:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadSettings();
  }, [loadData, loadSettings]);

  // Handle saving configurations
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/google-sheets/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetName: selectedWorksheet,
          columnMappings: mappings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success('Google Sheets configuration updated successfully');
      loadData(true);
      setActiveTab('overview');
    } catch (e: any) {
      toast.error(e.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  // Handle manual queue job retry
  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const res = await fetch('/api/dashboard/google-sheets/retry', {
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

  // Trigger full CRM table sync
  const handleFullSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/dashboard/google-sheets/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(`Bulk sync complete. Synced ${data.synced} customer records.`);
      loadData(true);
    } catch (e: any) {
      toast.error(e.message || 'Full sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-foreground space-y-4">
        <LoaderComponent size="lg" />
        <p className="text-sm text-muted-foreground animate-pulse">Retrieving Google integration state...</p>
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
              <h1 className="text-2xl font-bold tracking-tight">Google Sheets Live CRM Mirror</h1>
            </div>
            <p className="text-muted-foreground text-sm max-w-2xl ml-8">
              Real-time mirror syncing customer contacts, assignments, conversation logs, and lifecycle metrics.
            </p>
          </div>
          
          <div className="flex items-center gap-2 self-start md:self-auto ml-8 md:ml-0">
            <button
              onClick={() => loadData(true)}
              className="p-2 rounded-lg border hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-1.5 text-xs font-medium"
              title="Refresh Stats"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            
            {isConnected && (
              <button
                onClick={handleFullSync}
                disabled={syncing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5"
              >
                {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                Full Sync All Contacts
              </button>
            )}
          </div>
        </div>

        {/* Not Connected State */}
        {!isConnected ? (
          <div className="p-12 rounded-3xl border border-dashed border-border text-center space-y-4 max-w-lg mx-auto mt-12 bg-card">
            <div className="p-4 rounded-full bg-[#0F9D58]/10 text-[#0F9D58] w-fit mx-auto">
              <FileSpreadsheet className="w-10 h-10" />
            </div>
            <h2 className="text-lg font-semibold">Connect Google Account</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Google Sheets integration is currently disconnected for this restaurant. Connect your Google account on the Integrations panel to set up live updates.
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
                    <div className="font-bold text-sm">Action Required: Google Sheets Re-Authentication Needed</div>
                    <p className="opacity-90">{stats.authError || 'OAuth credentials expired or revoked. Synchronization is currently suspended.'}</p>
                  </div>
                </div>
                <a
                  href="/dashboard/integrations"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all whitespace-nowrap self-start md:self-auto text-center"
                >
                  Re-Connect Google
                </a>
              </div>
            )}

            {/* Connection Bar */}
            <div className="p-4 rounded-2xl bg-card border border-emerald-500/20 shadow-[0_0_0_1px_rgba(16,185,129,0.05)] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm leading-none">{stats?.spreadsheetName || 'Connected Spreadsheet'}</h3>
                    {stats?.connectionStatus === 'Authentication Required' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 font-bold">SUSPENDED</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-bold">ACTIVE</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Spreadsheet ID: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">{stats?.spreadsheetId}</code>
                  </p>
                </div>
              </div>

              <div className="text-xs text-muted-foreground flex flex-col md:items-end gap-1">
                <div>Connected Account: <span className="font-medium text-foreground">{stats?.connectedEmail || 'Unknown'}</span></div>
                <div>Worksheet Tab: <span className="font-medium text-foreground">"{stats?.sheetName}"</span></div>
              </div>
            </div>

            {/* Navigation Tabs */}
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
                  <Settings className="w-4 h-4" /> Column Mapping & Config
                </div>
              </button>
            </div>

            {/* Tab Contents */}
            <AnimatePresence mode="wait">
              {activeTab === 'overview' ? (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Health */}
                    <div className="p-5 rounded-2xl bg-card border shadow-sm flex flex-col">
                      <span className="text-xs text-muted-foreground font-semibold">Sync Health (24h)</span>
                      <span className="text-2xl font-bold mt-2 flex items-baseline gap-1">
                        {stats?.syncHealth}%
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stats?.syncHealth === 100 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                          {stats?.syncHealth === 100 ? 'Healthy' : 'Warning'}
                        </span>
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-1">Success rate of write operations</p>
                    </div>

                    {/* Latency */}
                    <div className="p-5 rounded-2xl bg-card border shadow-sm flex flex-col">
                      <span className="text-xs text-muted-foreground font-semibold">Average Latency</span>
                      <span className="text-2xl font-bold mt-2 flex items-baseline gap-1">
                        {stats?.averageLatency ? `${stats.averageLatency.toFixed(2)}s` : 'N/A'}
                        <span className="text-[10px] text-muted-foreground font-normal">avg</span>
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-1">Time between CRM update and sheet write</p>
                    </div>

                    {/* Volume Today */}
                    <div className="p-5 rounded-2xl bg-card border shadow-sm flex flex-col">
                      <span className="text-xs text-muted-foreground font-semibold">Operations Today</span>
                      <span className="text-2xl font-bold mt-2 flex flex-wrap items-baseline gap-1.5">
                        <span className="text-emerald-500 font-bold" title="Created">{stats?.createdToday}c</span>
                        <span className="text-indigo-500 font-bold" title="Updated">+{stats?.updatedToday}u</span>
                        {stats?.failedToday ? <span className="text-rose-500 font-bold" title="Failed">/{stats.failedToday}f</span> : null}
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-1">Total writes pushed to sheet today</p>
                    </div>

                    {/* Queue length */}
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
                            <th className="py-3 px-5">Type</th>
                            <th className="py-3 px-5">Latency</th>
                            <th className="py-3 px-5">Status</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {auditLogs.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-muted-foreground">
                                No spreadsheet sync logs recorded yet. Incoming chat updates will appear here live.
                              </td>
                            </tr>
                          ) : (
                            auditLogs.map((log) => {
                              const detailsAction = log.details?.action || '';
                              return (
                                <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                                  <td className="py-3.5 px-5 text-muted-foreground whitespace-nowrap">
                                    {new Date(log.created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' })}
                                  </td>
                                  <td className="py-3.5 px-5 font-medium whitespace-nowrap">
                                    <div className="flex flex-col">
                                      <span>{contactDisplayName(log.lead?.name, log.phone)}</span>
                                      <span className="text-[10px] text-muted-foreground">{log.phone}</span>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-5 font-mono text-[10px] text-muted-foreground capitalize">
                                    {log.event_type.replace(/_/g, ' ')}
                                  </td>
                                  <td className="py-3.5 px-5 whitespace-nowrap">
                                    {detailsAction ? (
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${detailsAction === 'create' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'}`}>
                                        {detailsAction.toUpperCase()}
                                      </span>
                                    ) : '-'}
                                  </td>
                                  <td className="py-3.5 px-5 text-muted-foreground whitespace-nowrap">
                                    {log.latency_ms ? `${(log.latency_ms / 1000).toFixed(2)}s` : '0.00s'}
                                  </td>
                                  <td className="py-3.5 px-5 whitespace-nowrap">
                                    {log.status === 'success' ? (
                                      <span className="text-emerald-500 font-bold flex items-center gap-1">
                                        <Check className="w-3.5 h-3.5 stroke-[3px]" /> Success
                                      </span>
                                    ) : (
                                      <div className="flex flex-col gap-0.5">
                                        <span className="text-rose-500 font-bold flex items-center gap-1" title={log.error_message || ''}>
                                          <AlertCircle className="w-3.5 h-3.5" /> Failed
                                        </span>
                                        {log.error_message && (
                                          <span className="text-[9px] text-rose-400 max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
                                            {log.error_message}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-5 text-right whitespace-nowrap">
                                    {log.status === 'failed' ? (
                                      <button
                                        onClick={() => handleRetryJob(log.id)}
                                        disabled={retryingJobId !== null}
                                        className="p-1 px-2.5 bg-muted text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 border rounded text-[10px] font-semibold transition-all inline-flex items-center gap-1 disabled:opacity-50"
                                      >
                                        {retryingJobId === log.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                        Retry Job
                                      </button>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid grid-cols-1 lg:grid-cols-3 gap-6"
                >
                  {/* Left Column: Worksheet & Global Setup */}
                  <div className="space-y-6 lg:col-span-1">
                    <div className="p-5 rounded-2xl bg-card border shadow-sm space-y-4">
                      <div className="flex items-center gap-2 border-b border-border pb-3">
                        <Database className="w-4 h-4 text-indigo-500" />
                        <h3 className="font-semibold text-sm">Worksheet Settings</h3>
                      </div>
                      
                      <form onSubmit={handleSaveSettings} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-muted-foreground">Active Worksheet (Tab)</label>
                          <select
                            value={selectedWorksheet}
                            onChange={(e) => setSelectedWorksheet(e.target.value)}
                            className="w-full rounded-lg border bg-background border-border p-2 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            required
                          >
                            <option value="">-- Choose tab --</option>
                            {worksheets.map(w => (
                              <option key={w} value={w}>{w}</option>
                            ))}
                            {/* Fallback to text option if list is empty or API offline */}
                            {worksheets.indexOf(stats?.sheetName || 'Leads') === -1 && (
                              <option value={stats?.sheetName || 'Leads'}>{stats?.sheetName || 'Leads'}</option>
                            )}
                          </select>
                          <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                            Choose the sheet tab inside your Google spreadsheet where customer rows will be written. If the tab doesn't exist, we will auto-create it.
                          </p>
                        </div>

                        <button
                          type="submit"
                          disabled={saving}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold shadow transition-all flex items-center justify-center gap-1.5"
                        >
                          {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                          Save Configuration
                        </button>
                      </form>
                    </div>

                    <div className="p-5 rounded-2xl bg-muted/40 border border-border/80 shadow-sm space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" /> Tenant Isolation & Security
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-normal">
                        Spreadsheet synchronization uses strict Row-Level Security (RLS) policies at the database level. Google OAuth access tokens are stored in encrypted form, and webhook events execute inside isolated queues per tenant lane.
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Custom Column Mappings */}
                  <div className="lg:col-span-2 p-5 rounded-2xl bg-card border shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        <h3 className="font-semibold text-sm">CRM Column Mapping</h3>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground leading-normal">
                      Aries AI CRM fields are mapped to Google Sheets column headers. If you leave these mappings empty, they default to standard names (e.g. <code>Customer Name</code> for Name, <code>Phone Number</code> for Phone). Map custom fields to custom column names in your spreadsheet as needed.
                    </p>

                    <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                      {/* Group CRM fields by category */}
                      {['Contact Info', 'Team Assignment', 'Timestamps', 'Conversation', 'Tags'].map(cat => {
                        const catFields = CRM_FIELDS.filter(f => f.category === cat);
                        return (
                          <div key={cat} className="space-y-2">
                            <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded w-fit">
                              {cat}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-1">
                              {catFields.map(field => (
                                <div key={field.key} className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-foreground">{field.label}</label>
                                    <code className="text-[9px] text-muted-foreground font-mono">({field.key})</code>
                                  </div>
                                  <input
                                    type="text"
                                    placeholder={`Default: ${field.label}`}
                                    value={mappings[field.label] || ''}
                                    onChange={(e) => {
                                      const next = { ...mappings };
                                      if (e.target.value.trim() === '') {
                                        delete next[field.label];
                                      } else {
                                        // Key represents sheet header, value represents CRM field key
                                        next[field.label] = field.key;
                                      }
                                      setMappings(next);
                                    }}
                                    className="w-full rounded-lg border bg-background border-border p-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

      </div>
    </div>
  );
}

// ── Shared Loader Spinner Component ──
function LoaderComponent({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7';
  return (
    <div className={`${sizeClass} relative flex items-center justify-center`}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, ease: 'linear', duration: 1 }}
        className="w-full h-full border-2 border-muted border-t-indigo-500 rounded-full"
      />
    </div>
  );
}
