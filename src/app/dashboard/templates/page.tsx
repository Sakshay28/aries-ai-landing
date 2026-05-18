"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ExternalLink, MessageSquare, Copy, CheckCircle2, AlertCircle, Loader2, Plus, X, Smartphone } from 'lucide-react';

interface WaTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components?: Array<{ type: string; text?: string; parameters?: unknown[] }>;
}

const CATEGORIES = [
  { id: 'UTILITY', label: 'Utility', desc: 'Order updates, reminders, alerts' },
  { id: 'MARKETING', label: 'Marketing', desc: 'Promotions, offers, announcements' },
  { id: 'AUTHENTICATION', label: 'Authentication', desc: 'OTPs, verification codes' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'en_IN', label: 'English (India)' },
  { value: 'hi', label: 'Hindi' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'ta', label: 'Tamil' },
];

export default function TemplatesPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateError, setTemplateError] = useState<string | null>(null);

  // Creator drawer state
  const [showCreator, setShowCreator] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('en');
  const [bodyText, setBodyText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [headerText, setHeaderText] = useState('');

  useEffect(() => {
    fetch('/api/dashboard/templates')
      .then(r => r.json())
      .then(j => {
        if (j.success && Array.isArray(j.data)) {
          setTemplates(j.data);
        } else {
          setTemplateError(j.error || null);
        }
      })
      .catch(() => setTemplateError('network'))
      .finally(() => setLoadingTemplates(false));
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleClose = () => {
    setShowCreator(false);
    setTemplateName('');
    setCategory('MARKETING');
    setLanguage('en');
    setBodyText('');
    setFooterText('');
    setHeaderText('');
  };

  // Sanitize template name to lowercase + underscores only
  const sanitizedName = templateName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1000px] mx-auto w-full space-y-8">

        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">WhatsApp Templates</h1>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Create templates here and submit them to Meta for approval. Once approved, use them in Broadcasts.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreator(true)}
            className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-sm font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Template
          </motion.button>
        </header>

        {/* Templates list */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            Your Approved Templates
          </h2>

          {loadingTemplates && (
            <div className="flex items-center gap-3 py-8 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading templates...
            </div>
          )}

          {!loadingTemplates && (templateError || templates.length === 0) && (
            <div className="p-6 rounded-2xl bg-card border border-border text-sm text-muted-foreground space-y-3">
              <p className="font-medium text-foreground">No approved templates yet.</p>
              <p className="leading-relaxed">
                Create a template using the <strong>Create Template</strong> button above. After submission, Meta typically approves templates within <strong>24 hours</strong>. Once approved, they&apos;ll appear here.
              </p>
            </div>
          )}

          {!loadingTemplates && templates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => {
                const bodyComp = template.components?.find(c => c.type === 'BODY');
                const bodyText = bodyComp?.text ?? '';
                return (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 rounded-2xl bg-card border border-border shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col h-full"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground text-sm font-mono bg-secondary px-2 py-0.5 rounded-md border border-border/50">
                            {template.name}
                          </h3>
                          <button
                            onClick={() => copyToClipboard(template.name)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy template name"
                          >
                            {copied === template.name ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="flex gap-2 text-xs font-medium mt-2">
                          <span className="text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-sm">{template.category}</span>
                          <span className="text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-sm">{template.language.toUpperCase()}</span>
                        </div>
                      </div>
                      <div className={`px-2 py-1 text-[10px] font-bold tracking-wider rounded-md border flex items-center gap-1 ${
                        template.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                          : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                      }`}>
                        {template.status === 'APPROVED' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {template.status}
                      </div>
                    </div>
                    {bodyText && (
                      <div className="flex-1 bg-secondary/30 rounded-xl p-4 border border-border/50 text-sm text-foreground/80 leading-relaxed font-sans relative">
                        <div className="absolute top-2 right-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Preview</div>
                        {bodyText}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Meta notice */}
        <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/20 flex items-start gap-4">
          <MessageSquare className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">Templates require Meta approval</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All WhatsApp templates must be approved by Meta before they can be used in broadcasts. Approval typically takes less than 24 hours.
              You can also manage templates directly in
              {' '}<a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Meta Business Manager <ExternalLink className="inline w-3 h-3" /></a>.
            </p>
          </div>
        </div>

      </div>

      {/* ── Template Creator Drawer ── */}
      <AnimatePresence>
        {showCreator && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={handleClose}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl bg-card border-l border-border shadow-2xl flex flex-col"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-6 h-16 border-b border-border shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Create Template</h2>
                  <p className="text-xs text-muted-foreground">Submit to Meta for approval</p>
                </div>
                <button onClick={handleClose} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto">
                <div className="flex h-full">
                  {/* Form Column */}
                  <div className="flex-1 overflow-auto p-6 space-y-6 custom-scrollbar">

                    {/* Template Name */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Template Name *</label>
                      <input
                        type="text"
                        value={templateName}
                        onChange={e => setTemplateName(e.target.value)}
                        placeholder="e.g. welcome_offer_diwali"
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                      {sanitizedName && sanitizedName !== templateName && (
                        <p className="text-[11px] text-amber-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Will be saved as: <code className="font-mono ml-1">{sanitizedName}</code>
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground/60">Only lowercase letters, numbers, underscores. Must be unique.</p>
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category *</label>
                      <div className="grid grid-cols-3 gap-2">
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat.id}
                            onClick={() => setCategory(cat.id)}
                            className={`p-3 rounded-xl border text-left transition-all ${category === cat.id
                              ? 'border-indigo-500/50 bg-indigo-500/8 text-foreground'
                              : 'border-border hover:border-border/80 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <p className="text-xs font-semibold">{cat.label}</p>
                            <p className="text-[10px] mt-0.5 opacity-70">{cat.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Language */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Language *</label>
                      <select
                        value={language}
                        onChange={e => setLanguage(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-indigo-500/50 transition-colors"
                      >
                        {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </div>

                    {/* Header (optional) */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Header <span className="font-normal normal-case">(optional)</span></label>
                      <input
                        type="text"
                        value={headerText}
                        onChange={e => setHeaderText(e.target.value)}
                        placeholder="e.g. 🎉 Special Offer Just for You!"
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </div>

                    {/* Body */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Body Message *</label>
                      <textarea
                        value={bodyText}
                        onChange={e => setBodyText(e.target.value)}
                        placeholder="Hello {{1}}, your order #{{2}} has been confirmed! 🎉"
                        rows={4}
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500/50 transition-colors resize-none"
                      />
                      <p className="text-[11px] text-muted-foreground/60">Use {`{{1}}`}, {`{{2}}`} for dynamic variables (customer name, order number, etc.)</p>
                    </div>

                    {/* Footer (optional) */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Footer <span className="font-normal normal-case">(optional)</span></label>
                      <input
                        type="text"
                        value={footerText}
                        onChange={e => setFooterText(e.target.value)}
                        placeholder="e.g. Reply STOP to unsubscribe"
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </div>

                    {/* Submit button */}
                    <div className="pt-2 flex gap-3">
                      <button
                        onClick={handleClose}
                        className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        Cancel
                      </button>
                      <a
                        href="https://business.facebook.com/wa/manage/message-templates/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        Submit via Meta <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Live Preview Column */}
                  <div className="w-72 border-l border-border bg-muted/20 p-5 shrink-0 hidden lg:flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <Smartphone className="w-3.5 h-3.5" /> Live Preview
                    </div>
                    {/* Phone mockup */}
                    <div className="flex-1 bg-[#E5DDD5] dark:bg-[#2C2C2C] rounded-2xl p-4 flex flex-col gap-3">
                      {(headerText || bodyText || footerText) ? (
                        <div className="bg-white dark:bg-[#1F2C34] rounded-2xl rounded-tl-sm p-3 shadow-sm max-w-[90%] space-y-1.5">
                          {headerText && (
                            <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-snug">{headerText}</p>
                          )}
                          {bodyText && (
                            <p className="text-[12.5px] text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{bodyText}</p>
                          )}
                          {footerText && (
                            <p className="text-[11px] text-gray-400 mt-1">{footerText}</p>
                          )}
                          <p className="text-[10px] text-gray-400 text-right mt-1">12:00 PM ✓✓</p>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-xs text-muted-foreground text-center opacity-60">Start typing your message to see a preview here</p>
                        </div>
                      )}
                    </div>

                    {/* Meta tag */}
                    {(sanitizedName || category) && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Template Info</p>
                        <div className="space-y-1 text-[11px] text-muted-foreground">
                          {sanitizedName && <p>Name: <span className="font-mono text-foreground">{sanitizedName}</span></p>}
                          <p>Category: <span className="text-foreground">{category}</span></p>
                          <p>Language: <span className="text-foreground">{LANGUAGES.find(l => l.value === language)?.label}</span></p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
