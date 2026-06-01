"use client";

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BatteryFull,
  Wifi,
  Phone,
  MoreVertical,
  CheckCheck,
  MessageSquare,
  ImageIcon,
  Play,
  FileText,
  ExternalLink,
  BadgeCheck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TemplateComponent {
  type: string; // 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?: string; // 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  text?: string;
  buttons?: MetaButton[];
  example?: { header_handle?: string[] };
}

interface MetaButton {
  type: string; // 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'
  text: string;
  url?: string;
  phone_number?: string;
}

interface ParsedButton {
  type: string;
  text: string;
  url?: string;
  phoneNumber?: string;
}

interface Template {
  name: string;
  category: string;
  language: string;
  status: string;
  body: string;
  headerType?: string; // 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'NONE'
  headerText?: string;
  headerMediaUrl?: string;
  footer?: string;
  buttons?: ParsedButton[];
  components?: TemplateComponent[];
}

interface VariableMapping {
  [key: string]: string;
}

export interface WhatsAppPreviewProps {
  template: Template | null;
  variableMapping: VariableMapping;
  previewProfile: string;
  onProfileChange: (name: string) => void;
}

// ── Profile configs (Rich Personalized Data for Clock Tower Jaipur) ───────────

const PROFILES: { name: string; variables: Record<string, string> }[] = [
  {
    name: "Sakshay",
    variables: {
      "1": "Sakshay",
      "2": "Friday, June 5",
      "3": "7:30 PM",
    },
  },
  {
    name: "John",
    variables: {
      "1": "John",
      "2": "Saturday, June 6",
      "3": "8:00 PM",
    },
  },
  {
    name: "Priya",
    variables: {
      "1": "Priya",
      "2": "Sunday, June 7",
      "3": "1:30 PM",
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveHeader(template: Template): {
  type: string;
  text: string;
  mediaUrl: string;
} {
  if (template.headerType && template.headerType !== "NONE") {
    return {
      type: template.headerType,
      text: template.headerText ?? "",
      mediaUrl: template.headerMediaUrl ?? "",
    };
  }

  const headerComp = template.components?.find((c) => c.type === "HEADER");
  if (headerComp) {
    return {
      type: headerComp.format ?? "TEXT",
      text: headerComp.text ?? "",
      mediaUrl: headerComp.example?.header_handle?.[0] ?? "",
    };
  }

  return { type: "NONE", text: "", mediaUrl: "" };
}

function resolveFooter(template: Template): string {
  if (template.footer) return template.footer;
  return (
    template.components?.find((c) => c.type === "FOOTER")?.text ?? ""
  );
}

function resolveButtons(template: Template): ParsedButton[] {
  if (template.buttons && template.buttons.length > 0) return template.buttons;

  const buttonComp = template.components?.find((c) => c.type === "BUTTONS");
  if (!buttonComp?.buttons) return [];

  return buttonComp.buttons.map((b): ParsedButton => ({
    type: b.type,
    text: b.text,
    url: b.url,
    phoneNumber: b.phone_number,
  }));
}

/** Substitute variables with strong styling for mapped vs fallback values */
function substituteVariables(
  text: string,
  mapping: VariableMapping
): React.ReactNode[] {
  const parts = text.split(/(\{\{\d+\}\})/g);

  return parts.map((part, idx) => {
    const match = part.match(/^\{\{(\d+)\}\}$/);
    if (!match) return <React.Fragment key={idx}>{part}</React.Fragment>;

    const key = match[1];
    const value = mapping[key];

    if (value) {
      return (
        <span key={idx} className="font-semibold text-[#111b21]">
          {value}
        </span>
      );
    }

    return (
      <span
        key={idx}
        className="font-medium text-indigo-600 bg-indigo-50/80 px-1 py-0.5 rounded border border-indigo-100 text-[12px]"
        style={{ fontStyle: "normal" }}
      >
        {`[Variable ${key}]`}
      </span>
    );
  });
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-3 pb-1 shrink-0 bg-[#ffffff] dark:bg-[#111b21] transition-colors duration-200">
      <span className="text-[12px] font-semibold text-[#111b21] dark:text-[#f1f2f6] tracking-tight">
        9:41
      </span>
      <div className="flex items-center gap-1.5 text-[#111b21] dark:text-[#f1f2f6]">
        <svg
          width="17"
          height="11"
          viewBox="0 0 17 11"
          fill="none"
          className="opacity-90"
        >
          <rect x="0" y="7" width="3" height="4" rx="0.5" fill="currentColor" />
          <rect x="4.5" y="4.5" width="3" height="6.5" rx="0.5" fill="currentColor" />
          <rect x="9" y="2" width="3" height="9" rx="0.5" fill="currentColor" />
          <rect x="13.5" y="0" width="3" height="11" rx="0.5" fill="currentColor" opacity="0.3" />
        </svg>
        <Wifi className="w-3.5 h-3.5 opacity-90" />
        <BatteryFull className="w-4 h-4 opacity-90" />
      </div>
    </div>
  );
}

function ChatHeader({ businessName }: { businessName: string }) {
  const initials = getInitials(businessName || "Aries Business");

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 shrink-0 bg-[#ffffff] border-b border-slate-100 shadow-sm">
      {/* Back chevron */}
      <svg
        width="12"
        height="20"
        viewBox="0 0 12 20"
        fill="none"
        className="opacity-80 cursor-pointer shrink-0 text-[#008069]"
      >
        <path
          d="M10 2L2 10L10 18"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="w-9 h-9 rounded-full bg-[#008069]/10 flex items-center justify-center border border-[#008069]/20">
          <span className="text-[11px] font-bold text-[#008069]">{initials}</span>
        </div>
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
      </div>

      {/* Name + verified */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-[14px] font-bold text-[#111b21] truncate leading-tight">
            {businessName}
          </p>
          <BadgeCheck className="w-4 h-4 text-[#008069] shrink-0" />
        </div>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Online</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 shrink-0 text-[#008069]">
        <Phone className="w-4.5 h-4.5" />
        <MoreVertical className="w-4.5 h-4.5" />
      </div>
    </div>
  );
}

function MessageHeader({
  type,
  text,
  mediaUrl,
}: {
  type: string;
  text: string;
  mediaUrl: string;
}) {
  if (type === "NONE" || !type) return null;

  if (type === "TEXT") {
    return (
      <p className="text-[13px] font-bold text-[#111b21] mb-1.5 leading-snug">
        {text}
      </p>
    );
  }

  if (type === "IMAGE") {
    if (mediaUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl}
          alt="Header media"
          className="w-full rounded-lg mb-2 object-cover"
          style={{ maxHeight: 180 }}
        />
      );
    }
    return (
      <div className="w-full h-36 rounded-lg mb-2 flex items-center justify-center bg-slate-100 border border-slate-200">
        <div className="flex flex-col items-center gap-1.5 text-slate-400">
          <ImageIcon className="w-7 h-7 opacity-60" />
          <span className="text-[10px] font-medium opacity-70">Image Header</span>
        </div>
      </div>
    );
  }

  if (type === "VIDEO") {
    return (
      <div className="w-full h-36 rounded-lg mb-2 flex items-center justify-center bg-slate-900/10 border border-slate-200 relative overflow-hidden">
        <div className="w-9 h-9 rounded-full bg-black/20 flex items-center justify-center backdrop-blur-sm">
          <Play className="w-4 h-4 text-white fill-white ml-0.5" />
        </div>
        <span className="absolute bottom-2 right-2.5 text-[9px] font-medium text-slate-500 bg-white/90 px-1.5 py-0.5 rounded-md">
          Video
        </span>
      </div>
    );
  }

  if (type === "DOCUMENT") {
    return (
      <div className="flex items-center gap-2.5 p-2 mb-2 bg-[#f0f2f5] border border-slate-200/50 rounded-lg">
        <div className="w-8 h-8 rounded bg-red-500/10 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-[#111b21] truncate">
            {text || "Document"}
          </p>
          <p className="text-[10px] text-muted-foreground">PDF · Tap to view</p>
        </div>
      </div>
    );
  }

  return null;
}

function PreviewButton({ button }: { button: ParsedButton }) {
  const isUrl = button.type === "URL";
  const isPhone = button.type === "PHONE_NUMBER";

  return (
    <div className="flex items-center justify-center gap-2 py-3 px-4 hover:bg-slate-50/50 transition-colors duration-150 cursor-pointer">
      {isUrl && <ExternalLink className="w-3.5 h-3.5 text-[#0066cc] shrink-0" />}
      {isPhone && <Phone className="w-3.5 h-3.5 text-[#0066cc] shrink-0" />}
      <span className="text-[13px] font-semibold text-[#0066cc] leading-tight">
        {button.text}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 shadow-md flex items-center justify-center">
        <MessageSquare className="w-6 h-6 text-[#008069] opacity-70" />
      </div>
      <div>
        <p className="text-[13px] font-bold text-[#111b21]">Preview Personalization</p>
        <p className="text-[11px] text-muted-foreground mt-1 max-w-[200px] leading-relaxed">
          Select a WhatsApp template to view live dynamic variables instantly.
        </p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function WhatsAppPreview({
  template,
  variableMapping,
  previewProfile,
  onProfileChange,
}: WhatsAppPreviewProps) {
  const activeProfileVars = useMemo(() => {
    const profile = PROFILES.find((p) => p.name === previewProfile) ?? PROFILES[0];
    return { ...profile.variables, ...variableMapping };
  }, [previewProfile, variableMapping]);

  const header = useMemo(
    () => (template ? resolveHeader(template) : null),
    [template]
  );
  const footer = useMemo(
    () => (template ? resolveFooter(template) : ""),
    [template]
  );
  const buttons = useMemo(
    () => (template ? resolveButtons(template) : []),
    [template]
  );
  const bodyText = template?.body ?? "";

  const businessName = "sakshay";

  return (
    <div className="flex flex-col gap-2 w-full items-center">
      {/* ── Device Shell ──────────────────────────────────────────────────── */}
      <div className="relative w-[90%] min-w-[315px] max-w-[385px] xl:max-w-[415px] shrink-0 select-none rounded-[44px] p-[2px] bg-gradient-to-b from-[#dfe1e8] via-[#c4c6ce] to-[#9d9fa6] dark:from-[#3a3b3e] dark:via-[#2b2c2e] dark:to-[#1a1b1c] shadow-[0_28px_70px_-15px_rgba(0,0,0,0.22),0_14px_28px_-10px_rgba(0,0,0,0.14),inset_0_1.5px_2px_rgba(255,255,255,0.5)] ring-1 ring-slate-400/15">
        {/* Soft Bezel Outer Glow Ring & Thin Bezel Border */}
        <div
          className="relative rounded-[39.5px] border-[2.6px] border-[#18191c] dark:border-[#141517] overflow-hidden transition-all duration-300 ring-1 ring-[#ffffff]/15"
          style={{
            background: "#efeae2",
            boxShadow:
              "inset 0 1px 2px rgba(255,255,255,0.15), inset 0 -1px 2px rgba(0,0,0,0.2)",
          }}
        >
          {/* Dynamic Island styled notch */}
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-full bg-[#111b21] flex items-center justify-center border border-white/5"
            style={{ width: 80, height: 18 }}
          >
            <div className="w-2 h-2 rounded-full bg-[#1d2731] ml-auto mr-3 border border-white/5" />
          </div>

          {/* Screen Content Wrapper */}
          <div className="flex flex-col bg-[#efeae2] min-h-[470px] sm:min-h-[520px] xl:min-h-[570px]">
            {/* Status bar */}
            <StatusBar />

            {/* Simulated Chat Header */}
            <ChatHeader businessName={businessName} />

            {/* Chat Body (WhatsApp Default Beige Wall) */}
            <div
              className="flex-1 relative overflow-y-auto px-4 py-4"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c0b4a8' fill-opacity='0.16'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
              }}
            >
              <div className="flex flex-col gap-4">
                {/* Date stamp */}
                <div className="flex justify-center">
                  <span className="text-[10px] text-[#667781] bg-white/85 px-2.5 py-0.5 rounded-md shadow-sm font-semibold uppercase tracking-wide">
                    Today
                  </span>
                </div>

                {/* Sent Campaign Bubble (Aligned to RIGHT, WhatsApp light-green background) */}
                <AnimatePresence mode="wait">
                  {template ? (
                    <motion.div
                      key={template.name}
                      initial={{ opacity: 0, y: 12, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      className="flex flex-col items-end w-full relative animate-in fade-in slide-in-from-bottom-2 duration-150"
                    >
                      {/* WhatsApp Sent Message Bubble Container */}
                      <div
                        className="relative max-w-[85%] rounded-2xl rounded-tr-none overflow-hidden px-4 pt-3 pb-2 bg-[#d9fdd3] text-[#111b21] shadow-[0_1px_3px_rgba(0,0,0,0.10),0_2px_6px_rgba(0,0,0,0.05)]"
                      >
                        {/* Bubble tail element */}
                        <div
                          className="absolute top-0 right-0 w-2.5 h-2.5 bg-[#d9fdd3]"
                          style={{
                            clipPath: "polygon(0 0, 100% 0, 100% 100%)",
                          }}
                        />

                        {/* Media/Text Header */}
                        {header && header.type !== "NONE" && (
                          <div className="pt-0.5">
                            <MessageHeader
                               type={header.type}
                               text={header.text}
                               mediaUrl={header.mediaUrl}
                            />
                          </div>
                        )}

                        {/* Message Body Content */}
                        <div className="pt-0.5 select-text">
                          <AnimatePresence mode="wait">
                            <motion.p
                              key={`${template.name}-${previewProfile}`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.12 }}
                              className="text-[14.5px] text-[#111b21] leading-[1.6] whitespace-pre-wrap break-words tracking-normal font-normal"
                            >
                              {substituteVariables(bodyText, activeProfileVars)}
                            </motion.p>
                          </AnimatePresence>

                          {/* Footer */}
                          {footer && (
                            <p className="text-[11px] text-[#667781] mt-2 leading-snug">
                              {footer}
                            </p>
                          )}

                          {/* Timestamp and Double Checkticks */}
                          <div className="flex items-center justify-end gap-1 mt-2 pb-0.5">
                            <span className="text-[9px] text-[#667781] font-medium leading-none">
                              9:41 AM
                            </span>
                            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                          </div>
                        </div>

                        {/* Buttons attached bottom plate */}
                        {buttons.length > 0 && (
                          <div className="border-t border-[#c5e6bd] mt-3 -mx-4 bg-white/30 divide-y divide-[#c5e6bd]/80">
                            {buttons.map((btn, i) => (
                              <div key={i}>
                                <PreviewButton button={btn} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <EmptyState key="empty" />
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom Keyboard stub */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 shrink-0 bg-[#f0f2f5] border-t border-slate-200/30">
              <div className="flex-1 h-8.5 bg-white rounded-full flex items-center px-4 shadow-sm border border-slate-200/50">
                <span className="text-[12px] text-slate-400">Message</span>
              </div>
              <div
                className="w-8.5 h-8.5 rounded-full flex items-center justify-center shrink-0 cursor-pointer shadow-sm hover:brightness-95 active:scale-95 transition-all duration-150"
                style={{ background: "#008069" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
                  <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 14 0h-2zm-5 9a7.07 7.07 0 0 1-7-7H3a9 9 0 0 0 18 0h-2a7.07 7.07 0 0 1-7 7z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Micro Label ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: template ? 1 : 0, y: template ? 0 : 4 }}
        transition={{ duration: 0.2 }}
        className="flex items-center justify-center gap-1.5 shrink-0"
      >
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[9.5px] text-muted-foreground/60 font-bold tracking-[0.1em] uppercase">
          WhatsApp Live Preview
        </span>
      </motion.div>
    </div>
  );
}
