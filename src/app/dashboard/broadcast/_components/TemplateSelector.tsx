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

// ── Constants ─────────────────────────────────────────────────────────────────

type Category = "ALL" | "MARKETING" | "UTILITY" | "AUTHENTICATION";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "MARKETING", label: "Marketing" },
  { id: "UTILITY", label: "Utility" },
  { id: "AUTHENTICATION", label: "Authentication" },
];

const CATEGORY_BADGE: Record<
  string,
  { bg: string; text: string; border: string; label: string }
> = {
  MARKETING: {
    bg: "bg-orange-50",
    text: "text-orange-600",
    border: "border-orange-200",
    label: "Marketing",
  },
  UTILITY: {
    bg: "bg-blue-50",
    text: "text-blue-600",
    border: "border-blue-200",
    label: "Utility",
  },
  AUTHENTICATION: {
    bg: "bg-purple-50",
    text: "text-purple-600",
    border: "border-purple-200",
    label: "Auth",
  },
};

const STATUS_BADGE: Record<
  string,
  { bg: string; text: string; border: string; icon: React.ElementType; label: string }
> = {
  APPROVED: {
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    border: "border-emerald-200",
    icon: CheckCircle2,
    label: "Approved",
  },
  PENDING: {
    bg: "bg-amber-50",
    text: "text-amber-600",
    border: "border-amber-200",
    icon: Clock,
    label: "Pending",
  },
  REJECTED: {
    bg: "bg-red-50",
    text: "text-red-600",
    border: "border-red-200",
    icon: XCircle,
    label: "Rejected",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLanguage(lang: string): string {
  // e.g. "en_US" -> "EN"
  return lang.split("_")[0].toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const cfg = CATEGORY_BADGE[category] ?? {
    bg: "bg-secondary/60",
    text: "text-muted-foreground",
    border: "border-border/60",
    label: category,
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[5px] text-[10px] font-bold uppercase tracking-wider border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? {
    bg: "bg-secondary/60",
    text: "text-muted-foreground",
    border: "border-border/60",
    icon: FileText,
    label: status,
  };
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {cfg.label}
    </span>
  );
}

function LanguagePill({ language }: { language: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] text-[10px] font-medium text-muted-foreground bg-secondary/50 border border-border/50">
      <Globe className="w-2.5 h-2.5 shrink-0" />
      {formatLanguage(language)}
    </span>
  );
}

// ── Skeleton Row ──────────────────────────────────────────────────────────────

function SkeletonRow({ delay }: { delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay }}
      className="flex items-center gap-4 px-4 py-3.5 border border-border/50 rounded-xl"
    >
      {/* Left */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-20 rounded-md bg-secondary/80 animate-pulse" />
          <div className="h-4 w-14 rounded-md bg-secondary/60 animate-pulse" />
          <div className="h-4 w-8 rounded-md bg-secondary/40 animate-pulse" />
        </div>
        <div className="h-3.5 w-3/4 rounded-md bg-secondary/60 animate-pulse" />
      </div>
      {/* Right */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="h-4 w-16 rounded-md bg-secondary/60 animate-pulse" />
        <div className="h-3 w-20 rounded-md bg-secondary/40 animate-pulse" />
      </div>
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

  // ── Derived list ─────────────────────────────────────────────────────────
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

  // ── Keyboard shortcut: '/' to focus search ───────────────────────────────
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

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-0 border border-border/60 rounded-xl bg-card overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50 space-y-3">

        {/* Search */}
        <div className="relative group flex items-center">
          <Search className="absolute left-3 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none group-focus-within:text-indigo-500/70 transition-colors duration-150" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
            className="w-full h-9 pl-9 pr-9 bg-background border border-border/60 hover:border-border focus:border-indigo-500/40 focus:bg-background rounded-lg text-[13px] text-foreground outline-none transition-all duration-150 placeholder:text-muted-foreground/50"
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
                className="absolute right-2.5 w-5 h-5 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Category chips + count */}
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
                  className={`shrink-0 h-7 px-3 rounded-lg text-[12px] font-medium border transition-all duration-150 ${
                    isActive
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground hover:bg-foreground/[0.02]"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground/70 whitespace-nowrap tabular-nums">
            {loading ? "—" : `${filtered.length} template${filtered.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden">

        {/* Loading skeletons */}
        {loading && (
          <div className="flex flex-col gap-2 p-3">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonRow key={i} delay={i * 0.05} />
            ))}
          </div>
        )}

        {/* Empty state — no templates at all */}
        {!loading && templates.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
            <div className="w-11 h-11 bg-secondary/60 border border-border/60 rounded-xl flex items-center justify-center mb-4">
              <FileText className="w-4.5 h-4.5 text-muted-foreground/50" />
            </div>
            <p className="text-[13px] font-semibold text-foreground mb-1.5">
              No approved templates
            </p>
            <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[240px]">
              Create templates in the{" "}
              <span className="font-medium text-foreground/70">Templates</span>{" "}
              section and wait for Meta approval.
            </p>
          </div>
        )}

        {/* Empty state — no search results */}
        {!loading && templates.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-11 h-11 bg-secondary/60 border border-border/60 rounded-xl flex items-center justify-center mb-4">
              <Search className="w-4.5 h-4.5 text-muted-foreground/40" />
            </div>
            <p className="text-[13px] font-semibold text-foreground mb-1">
              No templates found
            </p>
            <p className="text-[12px] text-muted-foreground max-w-[220px] leading-relaxed">
              Try a different search term or change the category filter.
            </p>
            {(query || activeCategory !== "ALL") && (
              <button
                onClick={() => {
                  setQuery("");
                  setActiveCategory("ALL");
                }}
                className="mt-4 h-7 px-3 rounded-lg bg-secondary hover:bg-secondary/80 text-[12px] font-medium text-foreground transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Template rows */}
        {!loading && filtered.length > 0 && (
          <div className="flex flex-col gap-1.5 p-3 max-h-[420px] overflow-y-auto custom-scrollbar">
            {filtered.map((template, i) => {
              const isSelected =
                selectedTemplate?.name === template.name &&
                selectedTemplate?.language === template.language;

              return (
                <motion.div
                  key={`${template.name}-${template.language}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: i * 0.03 }}
                  whileHover={
                    isSelected
                      ? {}
                      : { scale: 1.003, transition: { duration: 0.1 } }
                  }
                  onClick={() => onSelect(template)}
                  role="option"
                  aria-selected={isSelected}
                  className={`group relative flex items-center gap-4 px-4 py-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? "border-l-2 border-indigo-500 bg-indigo-500/[0.06] shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
                      : "border border-border/60 bg-transparent hover:bg-foreground/[0.02] hover:border-border"
                  }`}
                >
                  {/* ── Left: Name + badges ──────────────────────────────── */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[13px] font-semibold truncate max-w-[180px] ${
                          isSelected ? "text-indigo-600" : "text-foreground"
                        }`}
                        title={template.name}
                      >
                        {template.name}
                      </span>
                      <CategoryBadge category={template.category} />
                      <LanguagePill language={template.language} />
                    </div>

                    {/* Body snippet */}
                    <p className="text-[12px] text-muted-foreground leading-snug truncate pr-2">
                      {template.body || (
                        <span className="italic opacity-60">No body text</span>
                      )}
                    </p>
                  </div>

                  {/* ── Right: Status + date ─────────────────────────────── */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusBadge status={template.status} />
                    {template.updatedAt && (
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                        {formatDate(template.updatedAt)}
                      </span>
                    )}
                  </div>

                  {/* ── Selected checkmark ───────────────────────────────── */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.15, type: "spring", stiffness: 300, damping: 20 }}
                        className="absolute left-[-1px] top-1/2 -translate-y-1/2 w-5 h-5 bg-indigo-600 rounded-r-md flex items-center justify-center shadow-sm"
                      >
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
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
