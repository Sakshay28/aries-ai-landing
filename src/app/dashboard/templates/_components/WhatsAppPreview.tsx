'use client';

import React from 'react';
import type { TemplateFormState } from './types';
import { PREVIEW_VALUES, renderPreview } from './constants';

interface Props {
  state: TemplateFormState;
}

// Highlight variables inside React nodes for Vercel/Linear quality mockups
export function highlightPreviewText(
  text: string,
  variableMap: Record<string, number> = {},
  sampleValues: Record<string, string> = {}
): React.ReactNode[] {
  if (!text) return [];
  const inverted: Record<number, string> = {};
  for (const [name, idx] of Object.entries(variableMap)) {
    inverted[idx] = sampleValues[name] || PREVIEW_VALUES[name] || `[${name}]`;
  }

  const parts = text.split(/(\{\{\d+\}\})/g);
  return parts.map((part, i) => {
    const match = part.match(/^\{\{(\d+)\}\}$/);
    if (match) {
      const idx = parseInt(match[1]);
      const value = inverted[idx] || sampleValues[match[1]] || `[Value ${match[1]}]`;
      return (
        <span
          key={i}
          className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold border border-primary/20 text-[10.5px] select-all cursor-help mx-0.5 shadow-sm active:scale-[0.95] transition-all"
          title={`Variable Index: {{${match[1]}}}`}
        >
          {value}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const BUSINESS_NAME = 'Aries Concierge';

export default function WhatsAppPreview({ state }: Props) {
  const {
    headerType,
    headerText,
    headerMediaUrl,
    body,
    footer,
    buttons,
    variableMap,
    category,
    otpMode,
    securityRecommendation,
    validityPeriod,
    sampleValues = {}
  } = state;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const isEmpty = !headerText && !headerMediaUrl && !body && !footer && buttons.length === 0;

  // Render highlights
  const highlightedBody = body ? highlightPreviewText(body, variableMap, sampleValues) : null;
  const highlightedHeader = headerText ? highlightPreviewText(headerText, variableMap, sampleValues) : null;

  return (
    <div className="flex flex-col h-full space-y-4">

      {/* ── Premium Phone Shell Frame (Apple spacing) ── */}
      <div className="relative mx-auto w-full max-w-[280px] flex-1 flex flex-col bg-background/50 rounded-[32px] border border-border/80 p-2 shadow-inner">
        <div className="flex-1 flex flex-col rounded-[24px] border border-border/70 overflow-hidden bg-slate-50 dark:bg-zinc-900">
          {/* Status WhatsApp Bar */}
          <div className="bg-[#128C7E] px-4 py-2.5 flex items-center gap-2 shrink-0 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 border border-white/10 shadow-sm">
              <span className="text-white text-xs font-bold">{BUSINESS_NAME[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-bold truncate leading-tight">{BUSINESS_NAME}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white/80 text-[9px] font-medium">Business Account</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 rounded-full bg-white/60" />
              <div className="w-1 h-1 rounded-full bg-white/60" />
              <div className="w-1 h-1 rounded-full bg-white/60" />
            </div>
          </div>

          {/* Chat Bubble Area */}
          <div
            className="flex-1 min-h-0 px-3 py-4 flex flex-col justify-end gap-3 overflow-y-auto custom-scrollbar relative"
            style={{
              background: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\'%3E%3Ccircle cx=\'30\' cy=\'30\' r=\'1\' fill=\'%23b2dfdb\' opacity=\'0.25\'/%3E%3C/svg%3E") #e5ddd5',
            }}
          >
            {isEmpty ? (
              /* Premium Empty Mockup State */
              <div className="flex items-center justify-center h-full py-8">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-white/70 flex items-center justify-center mx-auto border border-border shadow-sm">
                    <span className="text-xl">💬</span>
                  </div>
                  <h4 className="text-[11px] font-bold text-slate-800">Preview your template</h4>
                  <p className="text-[10px] text-slate-500 max-w-[170px] mx-auto leading-relaxed">
                    Start building to see a live preview. Example variables will appear automatically.
                  </p>
                </div>
              </div>
            ) : (
              /* Mapped Message Bubble */
              <div className="flex flex-col gap-2">
                <div className="bg-white dark:bg-[#202c33] rounded-2xl rounded-tl-none border border-slate-100 dark:border-zinc-800 shadow-sm max-w-[95%] overflow-hidden transition-all duration-200">
                  
                  {/* Media attachment header */}
                  {headerType === 'IMAGE' && (
                    <div className="relative">
                      {headerMediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={headerMediaUrl} alt="Header" className="w-full h-28 object-cover border-b border-slate-50" />
                      ) : (
                        <div className="w-full h-28 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-zinc-800 dark:to-zinc-900 flex flex-col items-center justify-center gap-1 border-b border-slate-50">
                          <span className="text-xl">🖼️</span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Header Image</span>
                        </div>
                      )}
                    </div>
                  )}
                  {headerType === 'VIDEO' && (
                    <div className="w-full h-28 bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center relative border-b border-slate-50">
                      <div className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center shadow-md">
                        <span className="text-white text-sm ml-0.5">▶</span>
                      </div>
                      <span className="absolute bottom-2 right-2 text-white/50 text-[8px] font-bold uppercase tracking-widest">VIDEO MOCK</span>
                    </div>
                  )}
                  {headerType === 'DOCUMENT' && (
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/30">
                      <div className="w-8 h-8 rounded bg-red-500/10 flex items-center justify-center shrink-0">
                        <span className="text-red-500 text-sm">📄</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                          {headerMediaUrl ? 'Document.pdf' : 'Upload attachment...'}
                        </p>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wide font-bold">PDF Document</p>
                      </div>
                    </div>
                  )}

                  {/* Body Text */}
                  <div className="px-3 py-2.5 space-y-1.5">
                    {/* Text Header */}
                    {headerType === 'TEXT' && highlightedHeader && (
                      <p className="text-[13px] font-bold text-[#111b21] dark:text-zinc-100 leading-snug">
                        {highlightedHeader}
                      </p>
                    )}

                    {/* Authentication template specific layout */}
                    {category === 'AUTHENTICATION' ? (
                      <div className="space-y-2">
                        <p className="text-[12px] text-[#111b21] dark:text-zinc-200 leading-relaxed">
                          <span className="font-bold bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
                            {sampleValues.otp_code || '827182'}
                          </span>{' '}
                          is your verification code.
                          {securityRecommendation && (
                            <span className="text-[11px] text-[#667781] dark:text-zinc-400"> For your security, do not share this code.</span>
                          )}
                        </p>
                        {validityPeriod && (
                          <p className="text-[10px] text-[#667781] dark:text-zinc-400">
                            This code expires in {Math.round(validityPeriod / 60)} minutes.
                          </p>
                        )}
                      </div>
                    ) : (
                      highlightedBody && (
                        <p className="text-[12px] text-[#111b21] dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                          {highlightedBody}
                        </p>
                      )
                    )}

                    {/* Footer */}
                    {footer && (
                      <p className="text-[10px] text-[#667781] dark:text-zinc-400 pt-0.5 border-t border-slate-50 dark:border-zinc-800/20">{footer}</p>
                    )}

                    {/* Read receipt checkmark & Time */}
                    <div className="flex justify-end items-center gap-1 pt-0.5 select-none">
                      <span className="text-[8px] text-[#667781] dark:text-zinc-400 font-medium">{timeStr}</span>
                      <span className="text-[11px] text-[#53bdeb] font-bold">✓✓</span>
                    </div>
                  </div>

                  {/* Dynamic Button Render mapping */}
                  {category === 'AUTHENTICATION' && (
                    <div className="border-t border-slate-100 dark:border-zinc-800">
                      {(otpMode === 'COPY_CODE' || otpMode === 'ONE_TAP') && (
                        <button className="w-full py-2.5 text-[12px] text-[#00a5f4] font-semibold text-center hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                          {otpMode === 'COPY_CODE' ? '📋 Copy Code' : '✅ Autofill'}
                        </button>
                      )}
                      {otpMode === 'ZERO_TAP' && (
                        <div className="px-3 py-2 bg-[#f0fdf4] dark:bg-emerald-950/20">
                          <p className="text-[10px] text-[#16a34a] text-center font-bold">
                            ✓ Will autofill automatically
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {category !== 'AUTHENTICATION' && buttons.length > 0 && (
                    <div className="border-t border-slate-100 dark:border-zinc-800">
                      {buttons.map((btn, i) => (
                        <button
                          key={i}
                          className="w-full py-2.5 text-[12px] text-[#00a5f4] font-semibold text-center hover:bg-slate-50 dark:hover:bg-zinc-800 border-b border-slate-100 dark:border-zinc-800 last:border-b-0 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          {btn.type === 'URL' && <span>🔗</span>}
                          {btn.type === 'PHONE_NUMBER' && <span>📞</span>}
                          {btn.type === 'QUICK_REPLY' && <span>↩</span>}
                          {btn.type === 'COPY_CODE' && <span>📋</span>}
                          {btn.text || `Button ${i + 1}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom message input chrome (Apple round corners) */}
          <div className="rounded-b-[24px] bg-[#f0f2f5] dark:bg-zinc-800 px-3 py-2 flex items-center gap-2 shrink-0">
            <div className="flex-1 h-8 bg-white dark:bg-zinc-700 rounded-full flex items-center px-4 shadow-sm">
              <span className="text-[10px] text-[#667781] dark:text-zinc-400 select-none">Message</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#128C7E] flex items-center justify-center shadow-sm select-none">
              <span className="text-white text-xs">🎙</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
