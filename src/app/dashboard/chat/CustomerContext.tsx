"use client";

import { ChevronDown, MapPin, Mail, Phone, Bot, Power, Hand } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function CustomerContext() {
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversationId");
  const supabaseRef = useRef(createBrowserSupabaseClient());

  const fetchContext = async () => {
    if (!conversationId) return;
    setLoading(true);
    const supabase = supabaseRef.current;
    
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, bot_paused, sender_name, context, leads(name, phone, email, lead_status, created_at)")
      .eq("id", conversationId)
      .single();
      
    if (conv) {
      setData(conv);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchContext();
  }, [conversationId]);

  const toggleBot = async () => {
    if (!data) return;
    const supabase = supabaseRef.current;
    const newPausedState = !data.bot_paused;
    
    // Optimistic update
    setData({ ...data, bot_paused: newPausedState });
    toast.success(newPausedState ? "AI paused. You are now in control." : "AI resumed. Bot will handle replies.");
    
    await supabase
      .from("conversations")
      .update({ bot_paused: newPausedState })
      .eq("id", data.id);
  };

  if (!conversationId) {
    return (
      <div className="w-[340px] flex-shrink-0 border-l border-border/60 flex flex-col bg-background/50 hidden xl:flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Select a conversation</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="w-[340px] flex-shrink-0 border-l border-border/60 flex flex-col bg-background/50 hidden xl:flex p-8 space-y-6">
        <div className="flex flex-col items-center">
          <Skeleton className="w-20 h-20 rounded-full mb-4" />
          <Skeleton className="w-32 h-5 mb-2" />
          <Skeleton className="w-24 h-4" />
        </div>
        <Skeleton className="w-full h-24 rounded-xl" />
        <Skeleton className="w-full h-24 rounded-xl" />
      </div>
    );
  }

  const name = data.leads?.name || data.sender_name || data.leads?.phone || "Unknown";
  const initial = name.charAt(0).toUpperCase();
  const isPriya = initial === "P"; // Random mock logic for colors
  const bgClass = isPriya ? "bg-blue-500 shadow-blue-500/10" : "bg-emerald-500 shadow-emerald-500/10";
  const colorClass = isPriya ? "text-blue-600 dark:text-blue-500" : "text-emerald-600 dark:text-emerald-500";
  const bgLightClass = isPriya ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-500" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-500";
  
  const aiSummary = data.context?.summary || data.context?.intent || "No context extracted yet. The AI is still gathering information.";
  const leadStatus = data.leads?.lead_status || "new";

  return (
    <div className="w-[340px] flex-shrink-0 border-l border-border/60 flex flex-col bg-background/50 hidden xl:flex overflow-y-auto pb-6">
      {/* Profile Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 border-b border-border/40 text-center flex flex-col items-center bg-background"
      >
        <div className={`w-20 h-20 rounded-full ${bgClass} text-white shadow-md flex items-center justify-center font-medium text-3xl mb-4 relative`}>
          {initial}
          <div className={`absolute bottom-1 right-1 w-3.5 h-3.5 ${bgClass.split(' ')[0].replace('500', '400')} border-[2.5px] border-background rounded-full`} />
        </div>
        <h2 className="text-[18px] font-semibold text-foreground tracking-tight">{name}</h2>
        <p className="text-[13px] text-muted-foreground mt-1 tracking-tight">
          {data.leads?.created_at ? `Lead since ${new Date(data.leads.created_at).toLocaleDateString()}` : "New Contact"}
        </p>
        
        <div className="flex items-center gap-1.5 mt-4">
          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-widest uppercase ${bgLightClass}`}>
            {leadStatus}
          </span>
        </div>
      </motion.div>

      <div className="p-5 space-y-6">
        {/* Takeover Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="p-4 rounded-xl border border-border/40 bg-background flex flex-col items-center text-center gap-3">
            {data.bot_paused ? (
              <>
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600">
                  <Hand className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold">Human Takeover Active</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">AI is paused and will not reply.</p>
                </div>
                <button onClick={toggleBot} className="mt-1 w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[12px] font-semibold transition-colors">
                  Resume AI Bot
                </button>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center text-cyan-600">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold">AI is Active</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Aries AI is handling this conversation.</p>
                </div>
                <button onClick={toggleBot} className="mt-1 w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[12px] font-semibold transition-colors">
                  Pause AI (Takeover)
                </button>
              </>
            )}
          </div>
        </motion.div>

        {/* Contact Info */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-3"
        >
          <h3 className="text-[10px] font-bold tracking-widest text-muted-foreground/70 uppercase pl-1">Contact Details</h3>
          <div className="space-y-1">
            {data.leads?.email && (
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-[13px] text-foreground font-medium group cursor-pointer">
                <Mail className="w-[15px] h-[15px] text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="group-hover:text-primary transition-colors tracking-tight">{data.leads.email}</span>
              </div>
            )}
            {(data.leads?.phone || data.sender_name) && (
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-[13px] text-foreground font-medium group cursor-pointer">
                <Phone className="w-[15px] h-[15px] text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="group-hover:text-primary transition-colors tracking-tight">{data.leads?.phone || data.sender_name}</span>
              </div>
            )}
            {!data.leads?.email && !data.leads?.phone && (
              <p className="text-xs text-muted-foreground px-2">No contact details extracted yet.</p>
            )}
          </div>
        </motion.div>

        {/* AI Context/Summary */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-2.5"
        >
          <div className="flex items-center justify-between pl-1">
            <h3 className={`text-[10px] font-bold tracking-widest ${colorClass} uppercase flex items-center gap-1.5`}>
              <Bot className="w-3 h-3" /> Extracted Context
            </h3>
          </div>
          <div className={`p-3.5 ${bgLightClass.split(' text-')[0]}/50 border border-border/40 rounded-xl`}>
            <p className="text-[13px] leading-relaxed text-foreground/90 tracking-tight">
              {aiSummary}
            </p>
            {data.context && Object.keys(data.context).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {Object.entries(data.context).map(([k, v]) => {
                  if (k === 'summary' || k === 'intent' || !v) return null;
                  return (
                    <span key={k} className={`px-2 py-0.5 rounded text-[10px] font-semibold bg-background border border-border/50 text-foreground`}>
                      {k}: {String(v)}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
