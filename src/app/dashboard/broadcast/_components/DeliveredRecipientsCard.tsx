"use client";

import React, { useCallback, useState } from 'react';
import { useVisiblePoll } from '@/hooks/useVisiblePoll';
import { CheckCircle2, Eye, Copy, Check, ArrowRight, Phone, Clock, AlertCircle } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/utils/phone';

interface Recipient {
  id: string;
  phone: string;
  name: string | null;
  status: 'read' | 'delivered' | 'sent' | 'failed' | 'cancelled' | 'pending';
  delivered_at: string | null;
  read_at: string | null;
  failure_reason: string | null;
  processed_at: string | null;
}

interface DeliveredRecipientsCardProps {
  campaignId: string;
  onViewAllRecipients: (filter: string) => void;
}

export function DeliveredRecipientsCard({ campaignId, onViewAllRecipients }: DeliveredRecipientsCardProps) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Full recipient list — was refetched every 5s even in background tabs.
  // 30s, visible-only, backs off while the DB is slow.
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/broadcast/campaign/${campaignId}/recipients`);
      const json = await res.json();
      if (res.ok && json.success) {
        setRecipients(json.data || []);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to load delivered recipients:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useVisiblePoll(load, 30_000, { immediate: true });

  const handleCopy = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // Reached contacts = read, delivered, sent
  const reachedContacts = recipients.filter(
    (r) => r.status === 'read' || r.status === 'delivered' || r.status === 'sent'
  );

  const deliveredCount = recipients.filter(
    (r) => r.status === 'delivered' || r.status === 'read'
  ).length;

  const readCount = recipients.filter((r) => r.status === 'read').length;

  return (
    <div className="border border-border/60 rounded-2xl bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-bold text-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Delivered Recipients & Reached Numbers
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
              {deliveredCount} Delivered
            </span>
            {readCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">
                {readCount} Read
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">
            Exact phone numbers and delivery receipts confirmed by Meta's WhatsApp servers.
          </p>
        </div>

        <button
          onClick={() => onViewAllRecipients('delivered')}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer self-start sm:self-auto"
        >
          View all in Target Recipients
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="p-0">
        {loading && reachedContacts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-[13px] flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
            Loading reached recipients...
          </div>
        ) : reachedContacts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-[13px]">
            <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="font-medium text-foreground">No delivered messages yet</p>
            <p className="text-[12px] text-muted-foreground mt-1 max-w-sm mx-auto">
              As messages are accepted and delivered by Meta's network, phone numbers and delivery timestamps will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {reachedContacts.slice(0, 10).map((r) => {
              const formattedPhone = formatPhoneDisplay(r.phone);
              const timestamp = r.read_at || r.delivered_at || r.processed_at;
              const formattedTime = timestamp
                ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : null;

              return (
                <div
                  key={r.id}
                  className="px-5 py-3.5 flex items-center justify-between hover:bg-secondary/20 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 text-foreground font-semibold text-[12px]">
                      {r.name ? r.name.charAt(0).toUpperCase() : <Phone className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[13px] text-foreground truncate">
                          {r.name || 'Unnamed Contact'}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[12px] text-muted-foreground">
                            {formattedPhone}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(r.phone, e)}
                            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                            title="Copy Phone Number"
                          >
                            {copiedPhone === r.phone ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                      {formattedTime && (
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Reached at {formattedTime}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {r.status === 'read' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <Eye className="w-3 h-3" />
                        Read
                      </span>
                    ) : r.status === 'delivered' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" />
                        Delivered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                        Sent
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {reachedContacts.length > 10 && (
              <div className="p-3 text-center bg-secondary/10">
                <button
                  onClick={() => onViewAllRecipients('delivered')}
                  className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  +{reachedContacts.length - 10} more reached contacts. View full directory →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
