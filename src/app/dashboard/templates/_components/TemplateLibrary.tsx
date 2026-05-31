'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search } from 'lucide-react';
import { LIBRARY_TEMPLATES, INDUSTRIES } from './constants';
import type { LibraryTemplate, TemplateFormState } from './types';
import { DEFAULT_FORM_STATE } from './constants';

interface Props {
  onImport: (state: Partial<TemplateFormState>) => void;
}

export default function TemplateLibrary({ onImport }: Props) {
  const [selectedIndustry, setSelectedIndustry] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = LIBRARY_TEMPLATES.filter((t) => {
    const matchesIndustry = selectedIndustry === 'All' || t.industry === selectedIndustry;
    const q = search.toLowerCase();
    const matchesSearch = !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.body.toLowerCase().includes(q);
    return matchesIndustry && matchesSearch;
  });

  const handleImport = (tmpl: LibraryTemplate) => {
    // Convert LibraryTemplate to TemplateFormState
    const imported: Partial<TemplateFormState> = {
      ...DEFAULT_FORM_STATE,
      name: tmpl.title,
      normalizedName: tmpl.name,
      category: tmpl.category,
      subtype: tmpl.subtype,
      language: tmpl.language,
      headerType: tmpl.headerType,
      headerText: tmpl.headerText ?? '',
      body: tmpl.body,
      footer: tmpl.footer ?? '',
      buttons: tmpl.buttons.map((b, i) => ({ ...b, id: `lib-${i}` })),
      variableMap: tmpl.variableMap,
      status: 'DRAFT',
    };
    onImport(imported);
  };

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
        />
      </div>

      {/* Industry filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {INDUSTRIES.map((ind) => (
          <button
            key={ind}
            onClick={() => setSelectedIndustry(ind)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all shrink-0 ${
              selectedIndustry === ind
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {ind}
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground bg-card border border-border rounded-2xl">
          No templates found for &ldquo;{search}&rdquo;
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((tmpl) => (
            <motion.div
              key={tmpl.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="group p-4 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-md transition-all flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{tmpl.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{tmpl.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md bg-primary/10 text-primary border border-primary/20">
                    {tmpl.industry}
                  </span>
                  <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md bg-muted text-muted-foreground border border-border">
                    {tmpl.category}
                  </span>
                </div>
              </div>

              {/* WhatsApp mini-preview */}
              <div className="flex-1 bg-[#e5ddd5] dark:bg-[#1a2329] rounded-xl p-3 mb-3 relative min-h-[100px] flex flex-col justify-end">
                <div className="absolute top-2 right-2 text-[8px] font-bold text-black/30 dark:text-white/20 uppercase tracking-widest">
                  Preview
                </div>
                <div className="bg-white dark:bg-[#202c33] rounded-xl rounded-tl-none p-2.5 shadow max-w-[90%] space-y-1 mt-5">
                  {tmpl.headerText && (
                    <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">{tmpl.headerText}</p>
                  )}
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-3">{tmpl.body}</p>
                  {tmpl.footer && (
                    <p className="text-[10px] text-slate-400">{tmpl.footer}</p>
                  )}
                </div>
              </div>

              {/* Import button */}
              <button
                onClick={() => handleImport(tmpl)}
                className="flex items-center justify-center gap-1.5 w-full py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Import to Builder
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
