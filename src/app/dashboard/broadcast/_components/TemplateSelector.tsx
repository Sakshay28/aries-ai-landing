"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  Check,
  Globe,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Template {
  name: string;
  category: string; // 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language: string;
  status: string; // 'APPROVED' | 'PENDING' | 'REJECTED'
  body: string;
  headerType?: string;
  headerText?: string;
  headerMediaUrl?: string;
  footer?: string;
  buttons?: { type: string; text: string; url?: string; phoneNumber?: string }[];
  updatedAt?: string;
}

export interface TemplateSelectorProps {
  templates: Template[];
  selectedTemplate: Template | null;
  onSelect: (template: Template) => void;
  loading?: boolean;
}

type Category = "ALL" | "MARKETING" | "UTILITY" | "AUTHENTICATION";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "ALL", label: "All Templates" },
  { id: "MARKETING", label: "Marketing" },
  { id: "UTILITY", label: "Utility" },
  { id: "AUTHENTICATION", label: "Authentication" },
];

function formatLanguage(lang: string): string {
  return lang.split("_")[0].toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MinimalStatusDot({ status }: { status: string }) {
  if (status === "APPROVED") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
        <span className="text-[11px] font-medium text-emerald-600/90 dark:text-emerald-400/90">
          Approved
        </span>
      </div>
    );
  }
  if (status === "PENDING") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
        <span className="text-[11px] font-medium text-amber-600/90 dark:text-amber-400/90">
          Pending
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
      <span className="text-[11px] font-medium text-rose-600/90 dark:text-rose-400/90">
        Rejected
      </span>
    </div>
  );
}

function SkeletonRow({ delay }: { delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay }}
      className="flex items-center gap-4 px-4 py-4 border-b border-border/30"
    >
      <div className="flex-1 min-w-0 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="h-4 w-28 rounded bg-secondary animate-pulse" />
          <div className="h-3 w-10 rounded bg-secondary/80 animate-pulse" />
        </div>
        <div className="h-3.5 w-5/6 rounded bg-secondary/60 animate-pulse" />
      </div>
      <div className="h-4 w-14 rounded bg-secondary/60 animate-pulse shrink-0" />
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TemplateSelector({
  templates,
  selectedTemplate,
  onSelect,
  loading = false,
}: TemplateSelectorProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>("ALL");
  const chipScrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      const matchesCategory =
        activeCategory === "ALL" || t.category === activeCategory;
      const matchesQuery =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [templates, query, activeCategory]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex flex-col gap-0 w-full bg-transparent">
      {/* ── Search & Filter Panel (Command Palette Aesthetic) ────────────────── */}
      <div className="pb-3.5 space-y-3">
        {/* Rounded borderless search container */}
        <div className="relative group flex items-center bg-secondary/30 hover:bg-secondary/40 focus-within:bg-background border border-slate-200/60 dark:border-zinc-800/60 focus-within:border-indigo-500/50 rounded-xl transition-all duration-200 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]">
          <Search className="absolute left-4.5 w-4 h-4 text-muted-foreground/40 pointer-events-none group-focus-within:text-indigo-500 transition-colors duration-200" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates… (Press '/' to focus)"
            aria-label="Search templates"
            className="w-full h-12 pl-11 pr-11 bg-transparent rounded-xl text-[13px] text-foreground outline-none placeholder:text-muted-foreground/45"
          />
          <AnimatePresence>
            {query && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-3.5 w-5.5 h-5.5 flex items-center justify-center rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary/80 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Minimal segmented control category filter */}
        <div className="flex items-center justify-between gap-3">
          <div
            ref={chipScrollRef}
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar"
          >
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`shrink-0 h-7 px-2.5 rounded-full text-[10.5px] font-semibold tracking-tight transition-all duration-200 select-none ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm border border-indigo-600 dark:border-indigo-500"
                      : "bg-secondary/25 text-muted-foreground border border-border/20 hover:border-border/40 hover:text-foreground hover:bg-secondary/40"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
          <span className="shrink-0 text-[10.5px] font-semibold text-muted-foreground/60 whitespace-nowrap tabular-nums uppercase tracking-wide">
            {loading ? "Loading…" : `${filtered.length} template${filtered.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* ── Apple-density Template List ──────────────────────────────────────── */}
      <div className="flex flex-col">
        {loading && (
          <div className="flex flex-col divide-y divide-border/20">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonRow key={i} delay={i * 0.05} />
            ))}
          </div>
        )}

        {!loading && templates.length === 0 && (
          selectedTemplate ? (
            <div className="space-y-2.5 text-left">
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="group relative flex items-start gap-4 p-3 cursor-pointer transition-all duration-200 rounded-xl bg-indigo-500/[0.02] dark:bg-indigo-500/[0.01] border border-indigo-500/35 shadow-[0_4px_16px_rgba(99,102,241,0.03)]"
              >
                <div className="shrink-0 mt-0.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center border transition-colors bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800/80 text-indigo-600">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[13px] font-semibold tracking-tight truncate max-w-[190px] text-indigo-600">
                      {selectedTemplate.name}
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wide">
                      {selectedTemplate.category}
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground/60 px-1.5 py-0.5 rounded bg-secondary/50">
                      {formatLanguage(selectedTemplate.language)}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground/75 leading-relaxed line-clamp-2 pr-6">
                    {selectedTemplate.body}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0 pl-2 self-end">
                  <MinimalStatusDot status={selectedTemplate.status} />
                </div>
                <div className="absolute right-4 top-4 w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-center shadow-sm">
                  <Check className="w-3.5 h-3.5 text-indigo-600" strokeWidth={3} />
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 px-6 text-center bg-secondary/10 border border-dashed border-border/50 rounded-2xl">
              <div className="w-10 h-10 bg-secondary/50 rounded-xl flex items-center justify-center mb-3.5">
                <FileText className="w-5 h-5 text-muted-foreground/60" />
              </div>
              <p className="text-[13px] font-semibold text-foreground mb-1">
                No Meta templates found
              </p>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed max-w-[230px]">
                Sync templates with Meta Business Manager to make them available in campaigns.
              </p>
            </div>
          )
        )}

        {!loading && templates.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-10 h-10 bg-secondary/40 rounded-xl flex items-center justify-center mb-3">
              <Search className="w-4.5 h-4.5 text-muted-foreground/40" />
            </div>
            <p className="text-[13px] font-semibold text-foreground mb-1">
              No matching templates
            </p>
            <p className="text-[12px] text-muted-foreground max-w-[200px] leading-relaxed">
              We couldn't find any templates for "{query}". Try editing your query.
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1.5 custom-scrollbar pb-2">
            {filtered.map((template, i) => {
              const isSelected =
                selectedTemplate?.name === template.name &&
                selectedTemplate?.language === template.language;

              return (
                <motion.div
                  key={`${template.name}-${template.language}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: i * 0.02 }}
                  whileHover={{ scale: 1.008, y: -0.5 }}
                  onClick={() => onSelect(template)}
                  role="option"
                  aria-selected={isSelected}
                  className={`group relative flex items-start gap-3.5 p-3 cursor-pointer transition-all duration-200 rounded-xl border ${
                    isSelected
                      ? "bg-indigo-600/[0.02] dark:bg-indigo-400/[0.02] border-indigo-500/35 dark:border-indigo-400/25 shadow-[0_4px_16px_rgba(99,102,241,0.04)]"
                      : "bg-background/45 hover:bg-secondary/10 border-slate-200/50 dark:border-zinc-800/50 hover:border-slate-300 dark:hover:border-zinc-700"
                  }`}
                >
                  {/* Left Column: Icon accent */}
                  <div className="shrink-0 mt-0.5">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors ${
                        isSelected
                          ? "bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800/80 text-indigo-600"
                          : "bg-secondary/40 border-border/40 text-muted-foreground group-hover:bg-background"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Center Column: Details & Body Snippet */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[13px] font-semibold tracking-tight truncate max-w-[190px] ${
                          isSelected ? "text-indigo-600 dark:text-indigo-400 font-bold" : "text-foreground"
                        }`}
                        title={template.name}
                      >
                        {template.name}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wide">
                        {template.category}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground/60 px-1.5 py-0.5 rounded bg-secondary/50">
                        {formatLanguage(template.language)}
                      </span>
                    </div>

                    {/* Highly scannable two-line preview */}
                    <p className="text-[12px] text-muted-foreground/80 dark:text-muted-foreground/70 leading-relaxed line-clamp-2 pr-6 transition-colors duration-150">
                      {template.body || (
                        <span className="italic opacity-50">Empty template body</span>
                      )}
                    </p>
                  </div>

                  {/* Right Column: Status dot & Date */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0 pl-2 self-end">
                    <MinimalStatusDot status={template.status} />
                    {template.updatedAt && (
                      <span className="text-[10px] text-muted-foreground/55 tabular-nums">
                        {formatDate(template.updatedAt)}
                      </span>
                    )}
                  </div>

                  {/* Selected check indicator - top right corner prevents overlap */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-4 top-4 w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-center shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5 text-indigo-600" strokeWidth={3} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
