'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CATEGORIES } from '../constants';
import type { TemplateCategory, TemplateFormState } from '../types';
import { Check, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react';

interface Props {
  state: TemplateFormState;
  onChange: (updates: Partial<TemplateFormState>) => void;
}

export default function CategoryStep({ state, onChange }: Props) {
  const selectedCat = CATEGORIES.find((c) => c.id === state.category);
  const [showRejectionTips, setShowRejectionTips] = useState<Record<string, boolean>>({});

  const toggleRejectionTips = (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowRejectionTips((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  return (
    <div className="space-y-6">
      {/* Category Grid/List Cards */}
      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const isSelected = state.category === cat.id;
          const tipsOpen = showRejectionTips[cat.id] ?? false;

          return (
            <motion.button
              key={cat.id}
              type="button"
              onClick={() => onChange({ category: cat.id as TemplateCategory, subtype: cat.subtypes[0] })}
              whileHover={{ y: -1, transition: { duration: 0.15 } }}
              className={`w-full text-left p-4.5 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group focus:outline-none ${
                isSelected
                  ? 'border-primary/80 bg-primary/[0.015] shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                  : 'border-border/50 hover:border-border/80 bg-card hover:bg-muted/5'
              }`}
            >
              <div className="flex items-start gap-3.5">
                {/* Icon Pill */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border text-base transition-all ${
                  isSelected ? 'bg-primary/10 text-primary border-primary/10' : 'bg-muted/30 border-border/40 text-foreground/75'
                }`}>
                  {cat.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground tracking-tight">{cat.label}</h3>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-primary shrink-0"
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </motion.div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/90 leading-relaxed mt-1">{cat.description}</p>

                  {/* Approval Time Trust Microcopy */}
                  <div className="mt-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-500 flex items-center gap-1 select-none">
                    <span className="text-[11px] font-bold">✓</span>
                    <span>
                      {cat.id === 'AUTHENTICATION' ? 'Typically under 30m' : 'Usually approved within 24h'}
                    </span>
                  </div>

                  {/* Pre-collapsed rejection tips (Stripe style) */}
                  {isSelected && (
                    <div className="mt-4 pt-3.5 border-t border-border/40 space-y-3">
                      <div>
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                          Campaign Examples
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {cat.examples.map((ex) => (
                            <span
                              key={ex}
                              className="px-2 py-0.5 text-[10px] rounded-lg bg-muted text-foreground/80 border border-border/40 font-semibold"
                            >
                              {ex}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Collapsible rejection risks */}
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={(e) => toggleRejectionTips(cat.id, e)}
                          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500 hover:text-amber-700 hover:underline transition-all"
                        >
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${tipsOpen ? 'rotate-90' : ''}`} />
                          Common rejection risks
                        </button>
                        <AnimatePresence initial={false}>
                          {tipsOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden bg-amber-500/[0.02] border border-amber-500/15 rounded-xl p-3 space-y-1.5"
                            >
                              {cat.rejectionRisks.map((risk) => (
                                <p key={risk} className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                  <span>{risk}</span>
                                </p>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Subtype Selection segment control */}
      {selectedCat && selectedCat.subtypes.length > 1 && (
        <div className="space-y-3 p-4 bg-muted/20 border border-border/80 rounded-2xl">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Template Subtype / Variant
          </label>
          <div className="bg-background/85 p-1 rounded-xl flex gap-1 border border-border/80 w-fit select-none overflow-x-auto max-w-full">
            {selectedCat.subtypes.map((sub) => {
              const isSubSelected = state.subtype === sub;
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => onChange({ subtype: sub })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    isSubSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  {sub}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Select the variant format that best fits your trigger mechanism. Helps Meta route automation priorities correctly.
          </p>
        </div>
      )}
    </div>
  );
}
