import React from 'react';
import { useBroadcastStore } from '../store/broadcast.store';

const PREVIEW_PROFILES: Record<string, Record<string, string>> = {
  Sakshay: { '1': 'Sakshay', '2': 'SKY-2045', '3': 'Friday, 7 PM' },
  John:    { '1': 'John',    '2': 'JHN-1901', '3': 'Saturday, 11 AM' },
  Priya:   { '1': 'Priya',  '2': 'PRY-0078', '3': 'Sunday, 5 PM' },
};

interface PreviewProps {
  templateName: string;
  templateJson?: any;
}

export function TemplateHoverPreview({ templateName, templateJson }: PreviewProps) {
  const previewRecipient = useBroadcastStore((s) => s.previewRecipient);
  const profileValues = PREVIEW_PROFILES[previewRecipient] || { '1': 'there' };

  // Parse template structure (default or Meta templateJson)
  const bodyTextRaw = templateJson?.body || 'Hello {{1}}, your table reservation is confirmed. We look forward to hosting you!';
  const headerTextRaw = templateJson?.header || '';
  const footerTextRaw = templateJson?.footer || 'Aries AI Outreach';
  const buttons = templateJson?.buttons || ['View Details', 'Decline'];

  // Personalization variable interpolation
  const resolveBody = (text: string, name: string) => {
    return text.replace(/{{1}}/g, name);
  };

  const resolvedBody = resolveBody(bodyTextRaw, profileValues['1']);

  return (
    <div className="w-[280px] bg-[#E5DDD5] dark:bg-[#0b141a] rounded-xl p-3 shadow-xl border border-border/80 relative text-left leading-normal overflow-hidden select-none">
      {/* Background WhatsApp style pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.06] dark:opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%239C92AC' fill-opacity='0.4'%3E%3Cpath d='M50 50c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10c0 5.523-4.477 10-10 10s-10-4.477-10-10 4.477-10 10-10zM10 10c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10c0 5.523-4.477 10-10 10S0 25.523 0 20s4.477-10 10-10zm10 8c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8zm40 40c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8z'/%3E%3C/g%3E%3C/svg%3E")`
        }}
      />

      <div className="relative space-y-2">
        {/* WhatsApp Chat Bubble */}
        <div className="bg-white dark:bg-[#1f2c34] rounded-lg rounded-tl-none p-2.5 shadow-sm max-w-[95%] relative border border-white/10">
          {/* Bubble tail */}
          <div className="absolute top-0 -left-1.5 w-0 h-0 border-t-[8px] border-t-white dark:border-t-[#1f2c34] border-l-[8px] border-l-transparent" />

          {/* Header */}
          {headerTextRaw && (
            <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wide mb-1 border-b border-secondary/50 pb-1 truncate">
              {headerTextRaw}
            </p>
          )}

          {/* Resolved Body */}
          <p className="text-[11.5px] text-foreground font-medium leading-relaxed break-words whitespace-pre-line">
            {resolvedBody}
          </p>

          {/* Footer */}
          {footerTextRaw && (
            <p className="text-[9.5px] text-muted-foreground/50 mt-1 font-medium select-none truncate">
              {footerTextRaw}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        {buttons.length > 0 && (
          <div className="space-y-1 pl-1">
            {buttons.map((btn: string, idx: number) => (
              <div 
                key={idx} 
                className="w-[90%] bg-white dark:bg-[#1f2c34] text-indigo-500 font-semibold text-[11px] py-1.5 rounded-lg text-center shadow-sm cursor-default border border-white/5 truncate transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                {btn}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
