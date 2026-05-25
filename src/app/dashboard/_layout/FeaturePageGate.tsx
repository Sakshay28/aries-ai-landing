"use client";

import React, { useEffect, useState } from "react";
import { Lock, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";

interface FeaturePageGateProps {
  feature: string;
  allowedPlans: string[];
  children: React.ReactNode;
}

export function FeaturePageGate({ feature, allowedPlans, children }: FeaturePageGateProps) {
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const { createBrowserSupabaseClient } = await import("@/lib/supabase/client");
        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase.from("tenants").select("plan").limit(1).single();
        if (data?.plan) {
          setPlan(data.plan);
        } else {
          setPlan("starter"); // Default fallback
        }
      } catch (err) {
        console.error("Failed to fetch plan:", err);
        setPlan("starter");
      } finally {
        setLoading(false);
      }
    };
    fetchPlan();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] lg:h-screen items-center justify-center bg-[#0A0A0A] text-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <p className="text-sm font-medium opacity-60">Checking plan credentials...</p>
        </div>
      </div>
    );
  }

  // If the user's plan is in the allowed plans, render the content
  if (plan && allowedPlans.includes(plan)) {
    return <>{children}</>;
  }

  // Otherwise, render a gorgeous premium paywall/lock page
  return (
    <div className="h-[calc(100vh-64px)] lg:h-screen flex flex-col items-center justify-center bg-[#0A0A0A] text-white p-8 selection:bg-emerald-500/30">
      <div className="max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in duration-300">
        
        {/* Lock Icon */}
        <div className="relative mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-2xl shadow-emerald-500/5">
          <Lock className="w-6 h-6 text-emerald-500 animate-pulse" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0A0A0A]" />
        </div>

        {/* Header */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold tracking-widest text-emerald-400 uppercase">
            {feature} Feature
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-white leading-tight">
            Unlock higher-tier trial capabilities
          </h2>
          <p className="text-xs text-white/50 leading-relaxed max-w-sm mx-auto">
            This module is restricted. Your current free trial tier is <span className="text-emerald-400 font-semibold uppercase">{plan}</span>. Upgrade to unlock this tool.
          </p>
        </div>

        {/* Pricing comparison box */}
        <div className="bg-[#111111] border border-white/[0.04] rounded-2xl p-5 text-left space-y-3.5 shadow-xl">
          <div className="flex justify-between items-center pb-2.5 border-b border-white/[0.04]">
            <span className="text-xs font-semibold text-white/80">Premium Features Included:</span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/20">Pro Tier</span>
          </div>
          
          <ul className="space-y-2.5 text-[12px] text-white/60">
            <li className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">✓</span> Unlimited AI Agents (up to 25)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">✓</span> Full Custom Automation & Flows
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">✓</span> Native CRM & Detailed Analytics
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">✓</span> Up to 10k messages & 1,000 AI chats
            </li>
          </ul>
        </div>

        {/* Action Button */}
        <div className="flex flex-col gap-2.5 pt-4">
          <Link href="/dashboard/billing">
            <button className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-semibold text-sm rounded-xl transition-all duration-300 shadow-lg shadow-emerald-500/10 active:scale-[0.98] flex items-center justify-center gap-2">
              <span>Upgrade Plan & Unlock</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
          
          <Link href="/dashboard">
            <button className="w-full py-3 bg-transparent border border-white/10 hover:bg-white/5 text-white/70 hover:text-white font-medium text-xs rounded-xl transition-all duration-300">
              Return to Dashboard
            </button>
          </Link>
        </div>

      </div>
    </div>
  );
}
