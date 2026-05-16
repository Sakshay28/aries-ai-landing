"use client";

import { ChevronDown, MapPin, Mail, Phone, Bot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

export default function CustomerContext() {
  const [ordersOpen, setOrdersOpen] = useState(true);
  const searchParams = useSearchParams();
  const chatId = searchParams.get("chatId");
  const isPriya = chatId === "2";

  const data = {
    name: isPriya ? "Priya Mehta" : "Rahul Kumar",
    initial: isPriya ? "P" : "R",
    bgClass: isPriya ? "bg-blue-500 shadow-blue-500/10" : "bg-emerald-500 shadow-emerald-500/10",
    colorClass: isPriya ? "text-blue-600 dark:text-blue-500" : "text-emerald-600 dark:text-emerald-500",
    bgLightClass: isPriya ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-500" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-500",
    email: isPriya ? "priya.m@example.com" : "rahul.kumar@example.com",
    phone: isPriya ? "+91 98765 12345" : "+91 98765 43210",
    location: isPriya ? "Delhi, India" : "Mumbai, India",
    summary: isPriya ? "Customer inquiring about Order #4820 refund status. Historical preference for fast communication." : "High-value customer inquiring about Order #4829. Historically prefers fast shipping. Tracking link was successfully generated and sent.",
    recentOrder: isPriya ? "Order #4820" : "Order #4829",
    recentOrderStatus: isPriya ? "Refunded" : "Transit"
  };

  return (
    <div className="w-[340px] flex-shrink-0 border-l border-border/60 flex flex-col bg-background/50 hidden xl:flex overflow-y-auto">
      {/* Profile Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 border-b border-border/40 text-center flex flex-col items-center bg-background"
      >
        <div className={`w-20 h-20 rounded-full ${data.bgClass} text-white shadow-md flex items-center justify-center font-medium text-3xl mb-4 relative`}>
          {data.initial}
          <div className={`absolute bottom-1 right-1 w-3.5 h-3.5 ${data.bgClass.split(' ')[0].replace('500', '400')} border-[2.5px] border-background rounded-full`} />
        </div>
        <h2 className="text-[18px] font-semibold text-foreground tracking-tight">{data.name}</h2>
        <p className="text-[13px] text-muted-foreground mt-1 tracking-tight">Customer since Jan 2024</p>
        
        <div className="flex items-center gap-1.5 mt-4">
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-widest uppercase bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-500">
            Premium
          </span>
          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-widest uppercase ${data.bgLightClass}`}>
            Converted
          </span>
        </div>
      </motion.div>

      <div className="p-5 space-y-6">
        {/* Contact Info */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-3"
        >
          <h3 className="text-[10px] font-bold tracking-widest text-muted-foreground/70 uppercase pl-1">Contact</h3>
          <div className="space-y-1">
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-[13px] text-foreground font-medium group cursor-pointer">
              <Mail className="w-[15px] h-[15px] text-muted-foreground group-hover:text-foreground transition-colors" />
              <span className="group-hover:text-primary transition-colors tracking-tight">{data.email}</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-[13px] text-foreground font-medium group cursor-pointer">
              <Phone className="w-[15px] h-[15px] text-muted-foreground group-hover:text-foreground transition-colors" />
              <span className="group-hover:text-primary transition-colors tracking-tight">{data.phone}</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-[13px] text-foreground font-medium group cursor-pointer">
              <MapPin className="w-[15px] h-[15px] text-muted-foreground group-hover:text-foreground transition-colors" />
              <span className="group-hover:text-primary transition-colors tracking-tight">{data.location}</span>
            </div>
          </div>
        </motion.div>

        {/* AI Summary */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-2.5"
        >
          <div className="flex items-center justify-between pl-1">
            <h3 className={`text-[10px] font-bold tracking-widest ${data.colorClass} uppercase flex items-center gap-1.5`}>
              <Bot className="w-3 h-3" /> Auto Summary
            </h3>
          </div>
          <div className={`p-3.5 ${data.bgLightClass.split(' text-')[0]}/50 border border-border/40 rounded-xl`}>
            <p className="text-[13px] leading-relaxed text-foreground/90 tracking-tight">
              {data.summary}
            </p>
          </div>
        </motion.div>

        {/* Recent Orders */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2.5"
        >
          <button 
            onClick={() => setOrdersOpen(!ordersOpen)}
            className="w-full flex items-center justify-between text-[10px] font-bold tracking-widest text-muted-foreground/70 uppercase pl-1 group"
          >
            Recent Orders
            <motion.div animate={{ rotate: ordersOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
            </motion.div>
          </button>
          <AnimatePresence>
            {ordersOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-2 overflow-hidden"
              >
                <div className="p-3 border border-border/40 bg-background rounded-xl hover:bg-muted/40 hover:border-border/60 transition-all duration-200 cursor-pointer group">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[13px] font-semibold text-foreground tracking-tight">{data.recentOrder}</span>
                    <span className={`text-[10px] font-bold tracking-widest ${data.colorClass} uppercase`}>{data.recentOrderStatus}</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground tracking-tight">₹4,299 • 2 days ago</p>
                </div>
                <div className="p-3 border border-border/40 bg-background rounded-xl hover:bg-muted/40 hover:border-border/60 transition-all duration-200 cursor-pointer group">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[13px] font-semibold text-foreground tracking-tight">Order #3911</span>
                    <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Delivered</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground tracking-tight">₹1,850 • Last month</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
