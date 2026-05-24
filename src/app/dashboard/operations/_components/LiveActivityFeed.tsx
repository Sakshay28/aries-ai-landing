"use client";

import React, { useEffect, useState } from "react";
import { Bot, User, ArrowLeftRight, CheckCheck, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonRow } from "@/components/ui/skeleton";
import Link from "next/link";

interface LogItem {
  id: string;
  timestamp: string;
  direction: "inbound" | "outbound";
  message: string;
  sender: string;
  ai_generated: boolean;
  status: string;
  flow_fired: string | null;
  intent: string | null;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatSender(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    const num = digits.slice(2);
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (!raw || raw.toLowerCase() === "unknown") return "Visitor";
  return raw;
}

export function LiveActivityFeed() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function loadLogs() {
    try {
      const res = await fetch("/api/dashboard/logs");
      if (!res.ok) throw new Error("Failed to load operations log");
      const json = await res.json();
      if (json.success) {
        // Show last 5 logs for a clean layout fits card space
        setLogs(json.data.slice(0, 5));
      } else {
        setError(true);
      }
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
    
    // Auto refresh feed every 30 seconds for live updates
    const interval = setInterval(() => {
      loadLogs();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card className="border-border bg-card shadow-none">
        <CardHeader className="space-y-2">
          <SkeletonRow className="h-4 w-1/4" />
          <SkeletonRow className="h-3 w-1/2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || logs.length === 0) {
    return (
      <Card className="border-border bg-card shadow-none">
        <CardContent className="h-[280px] flex items-center justify-center text-center">
          <p className="text-sm text-muted-foreground">
            No recent operational activity recorded.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground text-sm">System Logs</CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground">
              Live updates from active chat queues & automated flows
            </CardDescription>
          </div>
          <button onClick={loadLogs} className="text-[10px] text-primary hover:underline font-semibold">
            Refresh Feed
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {logs.map((log) => {
            const isAI = log.direction === "outbound" && log.ai_generated;
            const isInbound = log.direction === "inbound";
            
            let label = "";
            let Icon = User;
            let iconBg = "";
            let iconColor = "";

            if (isInbound) {
              label = `Received from ${formatSender(log.sender)}`;
              Icon = ArrowLeftRight;
              iconBg = "bg-blue-500/10";
              iconColor = "text-blue-500";
            } else if (isAI) {
              label = `AI Agent auto-replied`;
              Icon = Bot;
              iconBg = "bg-emerald-500/10";
              iconColor = "text-emerald-500";
            } else {
              label = `Operator replied`;
              Icon = User;
              iconBg = "bg-purple-500/10";
              iconColor = "text-purple-500";
            }

            return (
              <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-foreground truncate">
                      {label}
                    </span>
                    <span className="text-[9px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{timeAgo(log.timestamp)}</span>
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 break-words line-clamp-2">
                    {log.message || "Template or media content"}
                  </p>
                  {log.intent && (
                    <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded bg-muted text-[8px] font-semibold text-muted-foreground">
                      Intent: {log.intent}
                    </span>
                  )}
                  {log.flow_fired && (
                    <span className="inline-flex items-center mt-1 ml-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-[8px] font-semibold text-emerald-500">
                      Flow: {log.flow_fired}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
