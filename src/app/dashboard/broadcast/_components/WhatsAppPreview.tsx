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

// ── Profile configs ────────────────────────────────────────────────────────────

const PROFILES: { name: string; variables: Record<string, string> }[] = [
  { name: "Sakshay", variables: { "1": "Sakshay", "2": "Monday", "3": "30%" } },
  { name: "John",    variables: { "1": "John",    "2": "Tuesday", "3": "20%" } },
  { name: "Priya",   variables: { "1": "Priya",   "2": "Friday",  "3": "25%" } },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive effective header info from template (handles both parsed and raw components) */
function resolveHeader(template: Template): {
  type: string;
  text: string;
  mediaUrl: string;
} {
  // Prefer top-level parsed fields
  if (template.headerType && template.headerType !== "NONE") {
    return {
      type: template.headerType,
      text: template.headerText ?? "",
      mediaUrl: template.headerMediaUrl ?? "",
    };
  }

  // Fall back to raw Meta components
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

/** Resolve footer from parsed fields or raw components */
function resolveFooter(template: Template): string {
  if (template.footer) return template.footer;
  return (
    template.components
      ?.find((c) => c.type === "FOOTER")
      ?.text ?? ""
  );
}

/** Resolve buttons from parsed fields or raw components */
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

/** Replace {{N}} placeholders with mapped values or styled fallback spans */
function substituteVariables(
  text: string,
  mapping: VariableMapping
): React.ReactNode[] {
  // Split on {{N}} tokens
  const parts = text.split(/(\{\{\d+\}\})/g);

  return parts.map((part, idx) => {
    const match = part.match(/^\{\{(\d+)\}\}$/);
    if (!match) return <React.Fragment key={idx}>{part}</React.Fragment>;

    const key = match[1];
    const value = mapping[key];

    if (value) {
      return (
        <span key={idx} className="font-semibold text-foreground">
          {value}
        </span>
      );
    }

    return (
      <span
        key={idx}
        className="font-medium text-indigo-500 bg-indigo-50 px-1 rounded"
        style={{ fontStyle: "italic" }}
      >
        {`[Variable ${key}]`}
      </span>
    );
  });
}

/** Get initials from a name string */
function getInitials(name: string): string {
  return name
    .trim()
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Simulated device status bar */
function StatusBar() {
  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-1 shrink-0">
      <span className="text-[11px] font-semibold text-foreground/80 tracking-tight">
        9:41
      </span>
      <div className="flex items-center gap-1.5">
        {/* Signal bars – SVG mimic */}
        <svg
          width="16"
          height="11"
          viewBox="0 0 16 11"
          fill="none"
          className="opacity-70"
        >
          <rect x="0" y="7" width="3" height="4" rx="0.5" fill="currentColor" />
          <rect x="4.5" y="4.5" width="3" height="6.5" rx="0.5" fill="currentColor" />
          <rect x="9" y="2" width="3" height="9" rx="0.5" fill="currentColor" />
          <rect x="13.5" y="0" width="2.5" height="11" rx="0.5" fill="currentColor" opacity="0.35" />
        </svg>
        <Wifi className="w-3.5 h-3.5 opacity-70" />
        <BatteryFull className="w-4 h-4 opacity-70" />
      </div>
    </div>
  );
}

/** WhatsApp-style chat header bar */
function ChatHeader({ businessName }: { businessName: string }) {
  const initials = getInitials(businessName || "Business");

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 shrink-0"
      style={{ background: "#075E54" }}
    >
      {/* Back chevron */}
      <svg
        width="10"
        height="16"
        viewBox="0 0 10 16"
        fill="none"
        className="opacity-90 shrink-0"
      >
        <path
          d="M8.5 1.5L2 8l6.5 6.5"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="w-8 h-8 rounded-full bg-emerald-300/30 flex items-center justify-center border border-white/20">
          <span className="text-[11px] font-bold text-white">{initials}</span>
        </div>
      </div>

      {/* Name + verified */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-[13px] font-semibold text-white truncate leading-tight">
            {businessName || "Business"}
          </p>
          <BadgeCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
        </div>
        <p className="text-[10px] text-white/60 leading-tight">Business account</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3.5 shrink-0">
        <Phone className="w-4 h-4 text-white/80" />
        <MoreVertical className="w-4 h-4 text-white/80" />
      </div>
    </div>
  );
}

/** Message header rendering */
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
      <p className="text-[12px] font-bold text-foreground/90 mb-2 leading-snug">
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
          alt="Template header"
          className="w-full rounded-[10px] mb-2 object-cover"
          style={{ maxHeight: 160 }}
        />
      );
    }
    return (
      <div className="w-full h-36 rounded-[10px] mb-2 flex items-center justify-center bg-slate-100 border border-slate-200">
        <div className="flex flex-col items-center gap-1.5 text-slate-400">
          <ImageIcon className="w-8 h-8 opacity-60" />
          <span className="text-[10px] font-medium opacity-70">Image</span>
        </div>
      </div>
    );
  }

  if (type === "VIDEO") {
    return (
      <div className="w-full h-36 rounded-[10px] mb-2 flex items-center justify-center bg-slate-900/10 border border-slate-200 relative overflow-hidden">
        <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center backdrop-blur-sm">
          <Play className="w-5 h-5 text-white fill-white ml-0.5" />
        </div>
        <span className="absolute bottom-2 right-2.5 text-[10px] font-medium text-slate-500 bg-white/80 px-1.5 py-0.5 rounded-full">
          Video
        </span>
      </div>
    );
  }

  if (type === "DOCUMENT") {
    return (
      <div className="flex items-center gap-2.5 p-2.5 mb-2 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="w-8 h-8 rounded-md bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-indigo-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-foreground/90 truncate">
            {text || "Document"}
          </p>
          <p className="text-[10px] text-muted-foreground">PDF · Tap to open</p>
        </div>
      </div>
    );
  }

  return null;
}

/** A single rendered button */
function PreviewButton({ button }: { button: ParsedButton }) {
  const isUrl = button.type === "URL";
  const isPhone = button.type === "PHONE_NUMBER";

  return (
    <div className="flex items-center justify-center gap-1.5 py-2 px-3">
      {isUrl && <ExternalLink className="w-3.5 h-3.5 text-[#0AB4F2] shrink-0" />}
      {isPhone && (
        <Phone className="w-3.5 h-3.5 text-[#0AB4F2] shrink-0" />
      )}
      <span
        className={`text-[13px] font-medium leading-tight ${
          isUrl || isPhone
            ? "text-[#0AB4F2]"
            : "text-[#0AB4F2]"
        }`}
      >
        {button.text}
      </span>
    </div>
  );
}

/** Empty state when no template is selected */
function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-12">
      <div className="w-14 h-14 rounded-2xl bg-white/60 border border-white/40 shadow-sm flex items-center justify-center">
        <MessageSquare className="w-6 h-6 text-slate-400" />
      </div>
      <p className="text-[12px] font-medium text-slate-500 text-center leading-snug">
        Select a template
        <br />
        to preview
      </p>
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
  // Merge profile-driven variables with external mapping (external takes precedence)
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

  // Business name derived from template name (prettified)
  const businessName = "Aries Business";

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* ── Profile Selector ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Preview as
        </span>
        <div className="flex items-center gap-1 p-1 bg-secondary/50 border border-border/60 rounded-lg">
          {PROFILES.map((profile) => (
            <button
              key={profile.name}
              onClick={() => onProfileChange(profile.name)}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all duration-150 ${
                previewProfile === profile.name
                  ? "bg-background text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {profile.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Device Shell ──────────────────────────────────────────────────── */}
      <div
        className="relative mx-auto flex flex-col shrink-0"
        style={{ width: 280 }}
      >
        {/* Outer bezel */}
        <div
          className="relative rounded-[36px] border-2 border-slate-200/90 shadow-2xl overflow-hidden"
          style={{
            background: "#f8f9fa",
            boxShadow:
              "0 32px 64px -12px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        >
          {/* Notch */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 z-10 rounded-b-2xl bg-slate-100"
            style={{ width: 90, height: 22 }}
          />

          {/* Screen area */}
          <div className="flex flex-col overflow-hidden" style={{ minHeight: 560 }}>
            {/* Status bar */}
            <div
              className="pt-6 pb-0"
              style={{ background: "#075E54" }}
            >
              <div className="flex items-center justify-between px-5 pb-1">
                <span className="text-[11px] font-semibold text-white/90 tracking-tight">
                  9:41
                </span>
                <div className="flex items-center gap-1.5 text-white">
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                    <rect x="0" y="6" width="2.5" height="4" rx="0.4" fill="white" />
                    <rect x="4" y="4" width="2.5" height="6" rx="0.4" fill="white" />
                    <rect x="8" y="2" width="2.5" height="8" rx="0.4" fill="white" />
                    <rect x="12" y="0" width="2" height="10" rx="0.4" fill="white" opacity="0.35" />
                  </svg>
                  <Wifi className="w-3 h-3" />
                  <BatteryFull className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* WhatsApp Chat Header */}
              <ChatHeader businessName={businessName} />
            </div>

            {/* Chat area */}
            <div
              className="flex-1 relative overflow-hidden"
              style={{
                background: "#e5ddd5",
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c0b4a8' fill-opacity='0.22'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
              }}
            >
              {/* Scrollable chat content */}
              <div className="flex flex-col px-3 py-4 gap-1 overflow-y-auto" style={{ maxHeight: 400 }}>
                {/* Date chip */}
                <div className="flex justify-center mb-3">
                  <span className="text-[10px] text-[#6b7c85] bg-white/75 px-2.5 py-0.5 rounded-full shadow-sm font-medium">
                    TODAY
                  </span>
                </div>

                {/* Message bubble */}
                <AnimatePresence mode="wait">
                  {template ? (
                    <motion.div
                      key={template.name}
                      initial={{ opacity: 0, y: 12, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                      className="flex flex-col items-start"
                    >
                      {/* Bubble wrapper */}
                      <div
                        className="relative max-w-[92%] rounded-[10px] rounded-tl-sm overflow-hidden"
                        style={{
                          background: "#ffffff",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.13)",
                        }}
                      >
                        {/* Header */}
                        {header && header.type !== "NONE" && (
                          <div className="px-3 pt-2.5">
                            <MessageHeader
                              type={header.type}
                              text={header.text}
                              mediaUrl={header.mediaUrl}
                            />
                          </div>
                        )}

                        {/* Body */}
                        <div className="px-3 pb-1 pt-2">
                          <AnimatePresence mode="wait">
                            <motion.p
                              key={`${template.name}-${previewProfile}`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="text-[13px] text-[#303030] leading-[1.55] whitespace-pre-wrap break-words"
                            >
                              {substituteVariables(bodyText, activeProfileVars)}
                            </motion.p>
                          </AnimatePresence>

                          {/* Footer */}
                          {footer && (
                            <p className="text-[11px] text-[#8e9296] mt-1.5 leading-snug">
                              {footer}
                            </p>
                          )}

                          {/* Timestamp */}
                          <div className="flex items-center justify-end gap-1 mt-1.5">
                            <span className="text-[10px] text-[#8e9296]">
                              9:41 AM
                            </span>
                            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                          </div>
                        </div>

                        {/* Buttons */}
                        {buttons.length > 0 && (
                          <div className="border-t border-slate-100">
                            {buttons.map((btn, i) => (
                              <div
                                key={i}
                                className={i > 0 ? "border-t border-slate-100" : ""}
                              >
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

            {/* Bottom bar — WhatsApp input stub */}
            <div
              className="flex items-center gap-2 px-3 py-2 shrink-0"
              style={{ background: "#f0f2f5" }}
            >
              <div className="flex-1 h-8 bg-white rounded-full flex items-center px-3">
                <span className="text-[11px] text-slate-400">Message</span>
              </div>
              {/* Mic button */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "#25D366" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="white"
                >
                  <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 14 0h-2zm-5 9a7.07 7.07 0 0 1-7-7H3a9 9 0 0 0 18 0h-2a7.07 7.07 0 0 1-7 7z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Side buttons — volume + power */}
        <div
          className="absolute left-[-3px] rounded-l top-[100px] w-[3px] h-10 bg-slate-300 rounded-l-full"
          aria-hidden
        />
        <div
          className="absolute left-[-3px] top-[150px] w-[3px] h-10 bg-slate-300 rounded-l-full"
          aria-hidden
        />
        <div
          className="absolute right-[-3px] top-[120px] w-[3px] h-14 bg-slate-300 rounded-r-full"
          aria-hidden
        />
      </div>

      {/* ── Bottom label ──────────────────────────────────────────────────── */}
      {template && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 shrink-0"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] text-muted-foreground font-medium">
            Live preview · {template.name}
          </span>
        </motion.div>
      )}
    </div>
  );
}
