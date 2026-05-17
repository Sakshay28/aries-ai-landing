"use client";

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, CheckCircle2, AlertCircle, Zap, Shield, FileText, ArrowRight, Download } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export function BillingClient() {
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    const fetchTenant = async () => {
      const { data } = await supabase.from('tenants').select('*').limit(1).single();
      setTenant(data);
      setLoading(false);
    };
    fetchTenant();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Loading Billing Info...</p>
        </div>
      </div>
    );
  }

  const isPro = tenant?.plan === 'pro';

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1000px] mx-auto w-full space-y-8">
        
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Billing & Plans</h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Manage your subscription, view invoices, and track your AI usage.
          </p>
        </header>

        {/* Current Plan Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                Current Plan
              </div>
              <h2 className="text-3xl font-bold tracking-tight mb-2 capitalize">{tenant?.plan || 'Starter'} Plan</h2>
              <div className="flex items-center gap-2 text-sm">
                <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] ${
                  tenant?.plan_status === 'active' || tenant?.plan_status === 'trialing' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                }`}>
                  {tenant?.plan_status || 'Active'}
                </span>
              </div>
            </div>
            
            <div className="mt-8 space-y-4 border-t border-border/50 pt-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">AI Conversations Used</span>
                <span className="font-semibold">{tenant?.ai_conversations_this_month || 0} / {tenant?.ai_conversation_limit || 100}</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-indigo-500 h-2.5 rounded-full" 
                  style={{ width: `${Math.min(100, ((tenant?.ai_conversations_this_month || 0) / (tenant?.ai_conversation_limit || 100)) * 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-indigo-600 text-white shadow-lg flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-2xl rounded-full" />
            <div className="relative z-10">
              <Shield className="w-8 h-8 mb-4 opacity-80" />
              <h3 className="text-lg font-semibold mb-2">Need more capacity?</h3>
              <p className="text-indigo-100 text-sm leading-relaxed mb-6">
                Upgrade to Pro to unlock unlimited AI conversations, priority support, and advanced integrations.
              </p>
            </div>
            <button className="relative z-10 w-full py-2.5 bg-white text-indigo-600 text-sm font-semibold rounded-lg hover:bg-indigo-50 transition-colors shadow-sm">
              Upgrade Plan
            </button>
          </div>
        </div>

        {/* Payment Methods & Invoices */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-muted-foreground" /> Payment Method
            </h3>
            <div className="flex items-center justify-between p-4 border border-dashed border-border rounded-xl bg-secondary/20">
              <p className="text-sm text-muted-foreground">No payment method on file.</p>
              <button className="text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors">Add card</button>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5 text-muted-foreground" /> Billing History
            </h3>
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">No invoices yet. They will appear here once your subscription is active.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
