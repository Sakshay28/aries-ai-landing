"use client";

import { MessageSquare, Megaphone, Upload, Workflow, FileText, Puzzle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

const actions = [
  {
    icon: MessageSquare,
    title: "Live Chat",
    subtitle: "138 open • 7 unassigned",
    iconBg: "bg-[#06B6D4]/10 text-[#06B6D4] dark:bg-[#06B6D4]/10 dark:text-[#06B6D4]",
    href: "/dashboard/chat",
  },
  {
    icon: Megaphone,
    title: "Broadcast",
    subtitle: "Send bulk to segments",
    iconBg: "bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400",
    href: "/dashboard/broadcast",
  },
  {
    icon: Upload,
    title: "Import Contacts",
    subtitle: "CSV • Excel • API sync",
    iconBg: "bg-blue-500/10 text-blue-500 dark:bg-blue-500/10 dark:text-blue-400",
    href: "/dashboard/contacts",
  },
  {
    icon: Workflow,
    title: "Automations",
    subtitle: "12 flows active",
    iconBg: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    href: "/dashboard/flows",
  },
  {
    icon: FileText,
    title: "Templates",
    subtitle: "Create • approve • send",
    iconBg: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
    href: "/dashboard/templates",
  },
  {
    icon: Puzzle,
    title: "Integrations",
    subtitle: "CRM • Shopify • Zapier",
    iconBg: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
    href: "/dashboard/integrations",
  }
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Link href={a.href} key={a.title} className="block outline-none group">
            <Card className="relative overflow-hidden border border-black/[0.04] dark:border-white/[0.04] bg-white/70 dark:bg-[#0A0A0A]/60 backdrop-blur-md shadow-[0_1px_3px_rgba(0,0,0,0.02)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-all duration-400 ease-out hover:border-black/[0.08] dark:hover:border-white/[0.08] hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,1)] hover:-translate-y-1 h-full cursor-pointer">
              {/* Subtle hover gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-black/[0.01] to-transparent dark:from-white/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              
              <CardContent className="p-6 relative z-10 flex flex-col h-full">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110 shadow-sm ${a.iconBg}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-1.5 transition-colors group-hover:text-black dark:group-hover:text-white">{a.title}</h3>
                <p className="text-[13px] text-muted-foreground font-medium mt-auto">{a.subtitle}</p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
