"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, BarChart3, Clock, FileText, Send, Users, CheckCircle2, Eye, AlertCircle } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { BroadcastExecutionTimeline } from '../../_components/BroadcastExecutionTimeline';
import { BroadcastAuditLog } from '../../_components/BroadcastAuditLog';
import toast from 'react-hot-toast';

interface CampaignStats {
  campaignId: string;
  status: string;
  totalRecipients: number;
  pending: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
}

export default function CampaignStatsPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'metrics' | 'timeline' | 'audit'>('metrics');

  const fetchStats = useCallback(async (showIndicator = false) => {
    if (showIndicator) setRefreshing(true);
    try {
      const res = await fetch(`/api/broadcast/campaign/${campaignId}/stats`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch statistics');
      }
      setStats(data);
    } catch (err: any) {
      console.error('[stats page] Error:', err);
      toast.error(err.message || 'Failed to load campaign statistics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchStats();
    // Poll stats every 5 seconds for real-time tracking while campaign is active
    const interval = setInterval(() => {
      if (stats?.status === 'sending' || stats?.status === 'running') {
        fetchStats(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [campaignId, stats?.status, fetchStats]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background min-h-[500px]">
        <div className="w-8 h-8 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-[13px] text-muted-foreground mt-4">Loading campaign analytics...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background min-h-[500px] p-6 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h2 className="text-[16px] font-semibold text-foreground">Campaign Not Found</h2>
        <p className="text-[13px] text-muted-foreground max-w-sm mt-2">
          We could not retrieve details for this campaign ID. Please check the URL or return to the main dashboard.
        </p>
        <button
          onClick={() => router.push('/dashboard/broadcast')}
          className="mt-6 h-9 px-4 text-[13px] font-semibold bg-foreground text-background hover:bg-foreground/90 rounded-xl transition-all"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-h-screen text-foreground overflow-y-auto">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border/60 flex items-center justify-between bg-card/10 backdrop-blur-sm sticky top-0 z-30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/broadcast')}
            className="w-8 h-8 flex items-center justify-center border border-border bg-background hover:bg-secondary/40 rounded-xl transition-all"
          >
            <ArrowLeft className="w-4 h-4 text-foreground/75" />
          </button>
          <div>
            <h1 className="text-[15px] font-bold tracking-tight text-foreground flex items-center gap-2">
              Campaign Delivery Analytics
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-wider border ${
                stats.status === 'sending' || stats.status === 'running'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse'
                  : stats.status === 'scheduled'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-secondary text-muted-foreground border-border/50'
              }`}>
                {stats.status}
              </span>
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Campaign ID: {stats.campaignId}</p>
          </div>
        </div>

        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="h-8 px-3 text-[12px] font-medium border border-border hover:bg-secondary/40 rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {/* Tabs */}
      <div className="px-6 border-b border-border/40 bg-card/5 flex items-center gap-4 shrink-0">
        {[
          { id: 'metrics', label: 'Overview Metrics', icon: BarChart3 },
          { id: 'timeline', label: 'Execution Logs', icon: Clock },
          { id: 'audit', label: 'Security & Audit', icon: FileText },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`h-11 px-1.5 text-[13px] font-semibold border-b-2 flex items-center gap-1.5 transition-all relative ${
              activeTab === t.id
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Audience size', value: stats.totalRecipients, icon: Users, desc: 'Target recipients' },
                { label: 'Delivered', value: stats.delivered, icon: CheckCircle2, desc: `${stats.deliveryRate}% delivery rate` },
                { label: 'Read', value: stats.read, icon: Eye, desc: `${stats.readRate}% read rate` },
                { label: 'Failed', value: stats.failed, icon: AlertCircle, desc: 'Undelivered messages' },
              ].map(kpi => (
                <div key={kpi.label} className="p-5 border border-border/60 rounded-2xl bg-card shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3 text-muted-foreground/60">
                    <span className="text-[11px] font-bold uppercase tracking-wider">{kpi.label}</span>
                    <kpi.icon className="w-4 h-4 text-muted-foreground/40" />
                  </div>
                  <p className="text-[28px] font-semibold text-foreground leading-none tabular-nums">
                    {kpi.value.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-2">{kpi.desc}</p>
                </div>
              ))}
            </div>

            {/* Progress Visualization */}
            <div className="p-6 border border-border/60 rounded-2xl bg-card space-y-5">
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground/70">Real-Time Delivery Pacing</h3>
              
              {/* Delivery progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-foreground/80">Message Delivery Success</span>
                  <span className="font-bold text-foreground tabular-nums">{stats.deliveryRate}%</span>
                </div>
                <div className="h-2 bg-secondary/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                    style={{ width: `${stats.deliveryRate}%` }}
                  />
                </div>
              </div>

              {/* Read progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-foreground/80">Read Receipt Confirmation</span>
                  <span className="font-bold text-foreground tabular-nums">{stats.readRate}%</span>
                </div>
                <div className="h-2 bg-secondary/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-700"
                    style={{ width: `${stats.readRate}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Retarget prompt for completed campaigns */}
            {stats.status === 'completed' && (
              <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start gap-4">
                <BarChart3 className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[14px] font-bold text-foreground">Re-engage Pending Leads</p>
                  <p className="text-[12.5px] text-muted-foreground mt-1">
                    There are {Math.max(0, stats.totalRecipients - stats.read)} contacts who haven't read this message yet.
                    You can easily schedule a retarget campaign in the main list.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="border border-border/60 rounded-2xl bg-card p-6">
            <BroadcastExecutionTimeline campaignId={campaignId} />
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="border border-border/60 rounded-2xl bg-card p-6">
            <BroadcastAuditLog campaignId={campaignId} />
          </div>
        )}
      </div>
    </div>
  );
}
