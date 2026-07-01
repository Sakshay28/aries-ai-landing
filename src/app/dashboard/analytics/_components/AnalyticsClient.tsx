"use client";

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart as BarChartIcon, 
  MessageSquare, 
  Users, 
  Bot,
  TrendingUp,
  Activity
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

export function AnalyticsClient() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/dashboard/analytics');
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch (err) {
        console.error('Failed to load analytics', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Loading Analytics...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Failed to load analytics data.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1200px] mx-auto w-full space-y-8">
        
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics Overview</h1>
          <p className="text-muted-foreground text-sm">Monitor your AI performance and conversation metrics.</p>
        </header>

        {/* Top Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="p-6 rounded-2xl bg-card border border-border shadow-sm"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-3xl font-bold">{data.summary.totalLeads.toLocaleString()}</h3>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Total Leads</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="p-6 rounded-2xl bg-card border border-border shadow-sm"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-3xl font-bold">{data.summary.avgLeadScore}/100</h3>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Avg Lead Score</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="p-6 rounded-2xl bg-card border border-border shadow-sm"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Bot className="w-5 h-5" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-3xl font-bold">{data.summary.avgConfidence}%</h3>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">AI Match Confidence</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="p-6 rounded-2xl bg-card border border-border shadow-sm"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
                <Activity className="w-5 h-5" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-3xl font-bold">{data.summary.avgBookingProb}%</h3>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Booking Probability</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="p-6 rounded-2xl bg-card border border-border shadow-sm"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl">
                <MessageSquare className="w-5 h-5" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-3xl font-bold">{data.summary.totalMessages.toLocaleString()}</h3>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Total Messages</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            className="p-6 rounded-2xl bg-card border border-border shadow-sm"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-xl">
                <Bot className="w-5 h-5" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-3xl font-bold">{data.summary.aiHandled}%</h3>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">AI Resolution Rate</p>
            </div>
          </motion.div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Area Chart: Message Volume */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="lg:col-span-2 p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col"
          >
            <div className="flex items-center gap-2 mb-6">
              <Activity className="w-5 h-5 text-indigo-500" />
              <h2 className="text-lg font-semibold tracking-tight">Message Volume (Last 7 Days)</h2>
            </div>
            <div className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.volumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorInbound" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818CF8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#818CF8" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorOutbound" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34D399" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#34D399" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '12px', fontSize: '13px' }}
                    itemStyle={{ color: 'var(--foreground)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                  <Area type="monotone" name="Inbound Messages" dataKey="inbound" stroke="#818CF8" strokeWidth={3} fillOpacity={1} fill="url(#colorInbound)" />
                  <Area type="monotone" name="Outbound (AI + Human)" dataKey="outbound" stroke="#34D399" strokeWidth={3} fillOpacity={1} fill="url(#colorOutbound)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Pie Chart: Lead Pipeline */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col"
          >
            <div className="flex items-center gap-2 mb-6">
              <BarChartIcon className="w-5 h-5 text-emerald-500" />
              <h2 className="text-lg font-semibold tracking-tight">Pipeline Health</h2>
            </div>
            <div className="flex-1 min-h-[300px] flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.pipelineData}
                    cx="50%"
                    cy="45%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {data.pipelineData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '12px', fontSize: '13px' }}
                    itemStyle={{ color: 'var(--foreground)' }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    formatter={(value, entry: any) => <span style={{ color: 'var(--foreground)', fontSize: '13px', fontWeight: 500 }}>{value} ({entry.payload.value})</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mb-10">
                <span className="text-3xl font-bold text-foreground">{data.summary.totalLeads}</span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Leads</span>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
