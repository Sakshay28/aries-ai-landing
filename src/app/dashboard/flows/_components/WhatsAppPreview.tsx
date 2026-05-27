"use client";

// ═══════════════════════════════════════════════════════════
// 📱 WhatsApp Preview Panel
// ═══════════════════════════════════════════════════════════
// Live WhatsApp-style bubble preview for any selected node.
// Shows realistic mobile UI with reply buttons, list menus,
// media placeholders, and form fields.
// ═══════════════════════════════════════════════════════════

import type { ReactNode } from "react";
import { ImageIcon, Mic, FileText, MapPin, CheckCheck } from "lucide-react";

interface ButtonDef { id: string; label: string; value?: string; }

interface PreviewProps {
  nodeType: string;
  nodeData: Record<string, unknown>;
  businessName?: string;
}

function WaBubble({ children, isBot = true }: { children: React.ReactNode; isBot?: boolean }) {
  return (
    <div className={`flex ${isBot ? 'justify-start' : 'justify-end'} mb-2`}>
      <div
        className="max-w-[86%] px-3 py-2 text-[13px] leading-relaxed"
        style={{
          background: isBot ? '#202C33' : '#005C4B',
          color: '#E9EDEF',
          borderRadius: isBot ? '0 12px 12px 12px' : '12px 0 12px 12px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
        }}
      >
        {children}
        <div className="flex justify-end items-center gap-1 mt-1">
          <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Now</span>
          <CheckCheck className="w-3 h-3" style={{ color: '#53bdeb' }} />
        </div>
      </div>
    </div>
  );
}

function WaButton({ label }: { label: string }) {
  return (
    <div
      className="text-center text-[13px] font-medium py-2 px-3 mt-1 rounded"
      style={{ background: 'rgba(0,92,75,0.15)', color: '#00a884', border: '1px solid rgba(0,168,132,0.2)', cursor: 'default' }}
    >
      {label}
    </div>
  );
}

export default function WhatsAppPreview({ nodeType, nodeData, businessName = 'Business' }: PreviewProps) {
  const message = String(nodeData?.message ?? nodeData?.content ?? '');
  const buttons = (nodeData?.buttons as ButtonDef[]) ?? [];
  const fields = (nodeData?.fields as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="flex flex-col h-full" style={{ background: '#0B1418' }}>
      {/* Chat header */}
      <div className="px-3 py-2.5 flex items-center gap-2.5 flex-shrink-0" style={{ background: '#202C33', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
          {businessName.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-[13px] font-semibold text-white leading-tight">{businessName}</p>
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>online</p>
        </div>
      </div>

      {/* Background wallpaper */}
      <div className="flex-1 overflow-y-auto p-3" style={{
        background: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h60v60H0z' fill='%230d1418'/%3E%3C/svg%3E\")",
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.015) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}>

        {/* Render based on node type */}
        {(nodeType === 'standard' || nodeType === 'trigger') && message && (
          <WaBubble>
            <span style={{ whiteSpace: 'pre-wrap' }}>{highlightVars(message)}</span>
          </WaBubble>
        )}

        {nodeType === 'send_buttons' && (
          <>
            {message && (
              <WaBubble>
                <span style={{ whiteSpace: 'pre-wrap' }}>{highlightVars(message)}</span>
                <div className="mt-2 space-y-1">
                  {(buttons.length > 0 ? buttons : [{ id: 'b1', label: 'Option 1' }, { id: 'b2', label: 'Option 2' }]).map(btn => (
                    <WaButton key={btn.id} label={btn.label} />
                  ))}
                </div>
              </WaBubble>
            )}
            {!message && (
              <div className="text-center py-4 text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Configure message text in the inspector
              </div>
            )}
          </>
        )}

        {nodeType === 'intake_form' && (
          <WaBubble>
            <p className="text-[11px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {String(nodeData?.label ?? 'Intake Form')}
            </p>
            <div className="space-y-1.5">
              {(fields.length > 0 ? fields : [{ name: 'Name', type: 'text' }, { name: 'Phone', type: 'phone' }]).map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] w-16 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>{String(f.name ?? f)}</span>
                  <div className="flex-1 h-5 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
                </div>
              ))}
            </div>
          </WaBubble>
        )}

        {nodeType === 'handoff' && (
          <WaBubble>
            <p className="text-[12px]">🤝 Connecting you to a team member...</p>
            <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Team: {String(nodeData?.team ?? 'Support Team')}
            </p>
          </WaBubble>
        )}

        {nodeType === 'delay' && (
          <div className="flex justify-center my-3">
            <div className="px-3 py-1.5 rounded-full text-[11px]" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
              ⏱ Waiting {String(nodeData?.duration ?? '2')}s
            </div>
          </div>
        )}

        {nodeType === 'end' && (
          <div className="flex justify-center my-3">
            <div className="px-3 py-1.5 rounded-full text-[11px]" style={{ background: 'rgba(100,116,139,0.1)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.2)' }}>
              🏁 Flow ended
            </div>
          </div>
        )}

        {/* Media node */}
        {nodeType === 'standard' && !!nodeData?.mediaType && (
          <WaBubble>
            <MediaPlaceholder mediaType={String(nodeData.mediaType)} caption={String(nodeData?.caption ?? '')} />
          </WaBubble>
        )}

        {nodeType === 'condition' && (
          <div className="space-y-1">
            <div className="px-3 py-2 rounded-lg text-[11px]" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', color: '#34d399' }}>
              ✓ TRUE branch → {String(nodeData?.trueLabel ?? 'Continue')}
            </div>
            <div className="px-3 py-2 rounded-lg text-[11px]" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#f87171' }}>
              ✗ FALSE branch → {String(nodeData?.falseLabel ?? 'Fallback')}
            </div>
          </div>
        )}

        {/* Default / empty node */}
        {!message && !['send_buttons','intake_form','handoff','delay','end','condition'].includes(nodeType) && (
          <div className="text-center py-8 text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Preview updates as you configure this node
          </div>
        )}
      </div>

      {/* Input bar (static) */}
      <div className="flex-shrink-0 px-3 py-2 flex items-center gap-2" style={{ background: '#202C33', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex-1 h-8 rounded-full px-4 flex items-center text-[12px]" style={{ background: '#2A3942', color: 'rgba(255,255,255,0.3)' }}>
          Type a message…
        </div>
      </div>
    </div>
  );
}

function MediaPlaceholder({ mediaType, caption }: { mediaType: string; caption: string }) {
  const icons: Record<string, ReactNode> = {
    image:    <ImageIcon className="w-6 h-6" />,
    audio:    <Mic className="w-6 h-6" />,
    document: <FileText className="w-6 h-6" />,
    location: <MapPin className="w-6 h-6" />,
  };
  const icon = (icons[mediaType] ?? <ImageIcon className="w-6 h-6" />) as ReactNode;
  return (
    <div>
      <div className="w-full h-24 rounded-lg flex items-center justify-center mb-1" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
        {icon}
        <span className="ml-2 text-[11px] capitalize">{mediaType}</span>
      </div>
      {caption && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{caption}</p>}
    </div>
  );
}

function highlightVars(text: string): ReactNode {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return parts.map((p, i) =>
    /^\{\{\w+\}\}$/.test(p)
      ? <span key={i} style={{ color: '#4ade80', fontWeight: 600 }}>{p}</span>
      : p
  );
}
