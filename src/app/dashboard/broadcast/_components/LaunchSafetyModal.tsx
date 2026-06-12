"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, AlertTriangle, Send, X, Clock, HelpCircle, Users } from 'lucide-react';
import { RecipientRecord } from '@/lib/broadcast/services/broadcast-recipient.service';

interface LaunchSafetyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  templateName: string;
  recipients: RecipientRecord[];
  deliveryMode: 'now' | 'scheduled' | 'recurring';
  scheduledAt: string | null;
  estimatedDuration: number;
  isLaunching: boolean;
}

export function LaunchSafetyModal({
  isOpen,
  onClose,
  onConfirm,
  templateName,
  recipients,
  deliveryMode,
  scheduledAt,
  estimatedDuration,
  isLaunching
}: LaunchSafetyModalProps) {
  // Extract first 3 names for safety list preview
  const eligibleNames = recipients
    .filter(r => r.status === 'eligible')
    .slice(0, 3)
    .map(r => r.name || r.phone_number);

  const displayRecipientsCount = recipients.filter(r => r.status === 'eligible').length;
  const noConsentCount = recipients.filter(r => r.status === 'no_consent').length;

  const formatScheduledTime = (iso: string | null): string => {
    if (!iso) return 'Immediate';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formattedDuration = (): string => {
    if (estimatedDuration <= 0) return 'Immediate';
    if (estimatedDuration < 60) return `${estimatedDuration} second${estimatedDuration !== 1 ? 's' : ''}`;
    const min = Math.floor(estimatedDuration / 60);
    const sec = estimatedDuration % 60;
    return `${min} min${sec > 0 ? ` ${sec} sec` : ''}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-50 backdrop-blur-xs"
          />

          {/* Modal Card */}
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 15 }}
              transition={{ type: 'spring', damping: 24, stiffness: 240 }}
              className="w-full max-w-md bg-background border border-border/80 shadow-2xl rounded-2xl p-6 pointer-events-auto overflow-hidden text-left"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-border/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-600 shrink-0">
                    <ShieldCheck className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="text-[15.5px] font-bold text-foreground tracking-tight leading-snug">
                      Ready to launch broadcast?
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Confirm pre-flight details before sending.
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg hover:bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Specs parameters */}
              <div className="py-4 space-y-3.5">
                {/* Template name */}
                <div className="flex items-start justify-between text-[12.5px] gap-2">
                  <span className="text-muted-foreground/80 font-medium">Template</span>
                  <span className="font-semibold text-foreground truncate max-w-[200px]">
                    {templateName}
                  </span>
                </div>

                {/* Recipients */}
                <div className="flex items-start justify-between text-[12.5px] gap-2">
                  <span className="text-muted-foreground/80 font-medium">Recipients</span>
                  <div className="text-right">
                    <span className="font-semibold text-foreground block">
                      {displayRecipientsCount.toLocaleString()} contact{displayRecipientsCount !== 1 ? 's' : ''}
                    </span>
                    {eligibleNames.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/60 block mt-0.5">
                        Preview: {eligibleNames.join(', ')}
                        {displayRecipientsCount > 3 ? '...' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Delivery schedule */}
                <div className="flex items-start justify-between text-[12.5px] gap-2">
                  <span className="text-muted-foreground/80 font-medium">Delivery</span>
                  <span className="font-semibold text-foreground">
                    {deliveryMode === 'scheduled' ? formatScheduledTime(scheduledAt) : 'Immediate dispatch'}
                  </span>
                </div>

                {/* Est. duration */}
                <div className="flex items-start justify-between text-[12.5px] gap-2">
                  <span className="text-muted-foreground/80 font-medium">Est. Duration</span>
                  <span className="font-semibold text-foreground">
                    {formattedDuration()}
                  </span>
                </div>
              </div>

              {/* Consent info */}
              {noConsentCount > 0 && (
                <div className="p-3 bg-emerald-500/[0.04] border border-emerald-500/15 rounded-xl flex items-start gap-2.5 mt-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-emerald-700/90 leading-relaxed font-medium">
                    {noConsentCount.toLocaleString()} contact{noConsentCount !== 1 ? 's' : ''} without consent excluded. Only opted-in recipients who have messaged your business will receive this broadcast.
                  </p>
                </div>
              )}

              {/* Warning Alert */}
              <div className="p-3 bg-amber-500/[0.04] border border-amber-500/15 rounded-xl flex items-start gap-2.5 mt-1 mb-5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700/90 leading-relaxed font-medium">
                  Important: Broadcast campaigns cannot be stopped or recalled once sending begins. All messaging billing charges will apply.
                </p>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLaunching}
                  className="flex-1 h-9 px-4 text-[12px] font-semibold border border-border/60 hover:bg-secondary/35 text-muted-foreground hover:text-foreground rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isLaunching}
                  className="flex-1 h-9 px-4 text-[12px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-500/10 active:scale-[0.985] rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                  {isLaunching ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {deliveryMode === 'scheduled' ? 'Schedule Broadcast' : 'Launch Broadcast'}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
