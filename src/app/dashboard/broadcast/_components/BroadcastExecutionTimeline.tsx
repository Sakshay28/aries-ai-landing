import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { 
  Play, CheckCircle, AlertTriangle, AlertOctagon, 
  Settings, Clock, Sparkles, MessageSquare, ShieldAlert
} from 'lucide-react';

export interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  created_at: string;
}

interface TimelineProps {
  campaignId: string;
}

export function BroadcastExecutionTimeline({ campaignId }: TimelineProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 1. Fetch initial chronological timeline events
  useEffect(() => {
    async function fetchInitial() {
      try {
        setLoading(true);
        const res = await fetch(`/api/broadcasts/timeline?campaignId=${campaignId}`);
        const data = await res.json();
        if (data.success) {
          setEvents(data.events || []);
        }
      } catch (err) {
        console.error('Failed to load initial execution events:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchInitial();
  }, [campaignId]);

  // 2. Open realtime channel to receive inserts live
  useEffect(() => {
    const channel = supabase
      .channel(`timeline_ui:${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'broadcast_execution_events',
          filter: `campaign_id=eq.${campaignId}`
        },
        (payload: any) => {
          const newEvent = payload.new as TimelineEvent;
          setEvents((prev) => {
            // Guard against duplicate renders
            if (prev.some((e) => e.id === newEvent.id)) return prev;
            return [...prev, newEvent];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId, supabase]);

  // 3. Scroll to bottom on new event stream tick
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'success':
        return { dot: 'bg-emerald-500 ring-emerald-500/20 text-emerald-600', icon: CheckCircle };
      case 'warning':
        return { dot: 'bg-amber-500 ring-amber-500/20 text-amber-600', icon: AlertTriangle };
      case 'error':
        return { dot: 'bg-red-500 ring-red-500/20 text-red-600', icon: AlertOctagon };
      default:
        return { dot: 'bg-indigo-500 ring-indigo-500/20 text-indigo-500', icon: Settings };
    }
  };

  const getEventIcon = (type: string, DefaultIcon: any) => {
    switch (type) {
      case 'campaign_created':
      case 'draft_saved':
        return Clock;
      case 'variables_validated':
      case 'template_selected':
        return Sparkles;
      case 'launch_requested':
      case 'sending_started':
        return Play;
      case 'reply_received':
        return MessageSquare;
      case 'stop_received':
        return ShieldAlert;
      default:
        return DefaultIcon;
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/60 gap-2">
        <Clock className="w-5 h-5 animate-spin" />
        <span className="text-[11px] font-medium">Resolving timeline streams...</span>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 border border-dashed border-border/60 rounded-xl bg-background/40">
        <Clock className="w-6 h-6 text-muted-foreground/45 mb-2.5" />
        <p className="text-[12px] font-semibold text-foreground/80">No execution logs yet</p>
        <p className="text-[10px] text-muted-foreground text-center mt-0.5">Timeline events stream live here upon launching the campaign.</p>
      </div>
    );
  }

  return (
    <div className="relative text-left flex-1 flex flex-col justify-between overflow-hidden">
      <div className="overflow-y-auto max-h-[380px] custom-scrollbar pr-1 relative">
        {/* Thin connecting vertical line */}
        <div className="absolute left-[13px] top-3 bottom-3 w-[1.5px] bg-border/45" />

        <div className="space-y-6">
          {events.map((event) => {
            const { dot, icon: DefIcon } = getSeverityStyles(event.severity);
            const Icon = getEventIcon(event.event_type, DefIcon);

            return (
              <div key={event.id} className="relative flex gap-4 pl-8 group">
                {/* Status Dot */}
                <div className={`absolute left-0 top-1 w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-background border border-background/10 shrink-0 transition-transform duration-300 group-hover:scale-110 ${dot}`}>
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>

                {/* Event Description Card */}
                <div className="flex-1 flex flex-col min-w-0 pt-0.5">
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="text-[12.5px] font-semibold text-foreground tracking-tight leading-snug">
                      {event.title}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground/60 whitespace-nowrap font-medium">
                      {formatTime(event.created_at)}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground/80 leading-normal mt-0.5">
                    {event.description}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
