"use client";

import React, { useEffect, useState } from "react";
import { MessageSquare, Megaphone, Upload, Workflow, FileText, Puzzle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

interface QuickStats {
  activeConversations: number;
  totalLeads: number;
}

export function QuickActionsGrid() {
  const [stats, setStats] = useState<QuickStats | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then(r => r.json())
      .then(j => { 
        if (j.success) {
          setStats({ 
            activeConversations: j.data.activeConversations, 
            totalLeads: j.data.totalLeads 
          }); 
        } 
      })
      .catch(() => {});
  }, []);

  const actions = [
    {
      icon: MessageSquare,
      title: "Live Chat",
      subtitle: stats ? `${stats.activeConversations} active chat room${stats.activeConversations !== 1 ? 's' : ''}` : "Loading...",
      iconBg: "bg-cyan-500/10 text-cyan-500",
      href: "/dashboard/chat",
    },
    {
      icon: Megaphone,
      title: "Broadcast",
      subtitle: "Send bulk messages",
      iconBg: "bg-indigo-500/10 text-indigo-500",
      href: "/dashboard/broadcast",
    },
    {
      icon: Upload,
      title: "Contacts CRM",
      subtitle: stats ? `${stats.totalLeads} total contacts` : "Sync directory",
      iconBg: "bg-blue-500/10 text-blue-500",
      href: "/dashboard/contacts",
    },
    {
      icon: Workflow,
      title: "Automations",
      subtitle: "Configure automations",
      iconBg: "bg-emerald-500/10 text-emerald-500",
      href: "/dashboard/flows",
    },
    {
      icon: FileText,
      title: "Templates",
      subtitle: "Manage messaging layouts",
      iconBg: "bg-purple-500/10 text-purple-500",
      href: "/dashboard/templates",
    },
    {
      icon: Puzzle,
      title: "Integrations",
      subtitle: "Webhooks & third-party",
      iconBg: "bg-orange-500/10 text-orange-500",
      href: "/dashboard/integrations",
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {actions.map((act) => {
        const Icon = act.icon;
        return (
          <Link href={act.href} key={act.title} className="block group outline-none">
            <Card className="border-border bg-card shadow-none hover:bg-[#F9F9F8] dark:hover:bg-muted/30 transition-all duration-300 cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col h-full space-y-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${act.iconBg} transition-transform duration-300 group-hover:scale-105`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-foreground tracking-tight group-hover:text-primary transition-colors">
                    {act.title}
                  </h3>
                  <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                    {act.subtitle}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
