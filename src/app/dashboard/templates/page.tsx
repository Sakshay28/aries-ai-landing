"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, ExternalLink, MessageSquare, Copy, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface WaTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components?: Array<{ type: string; text?: string; parameters?: unknown[] }>;
}

export default function TemplatesPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateError, setTemplateError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1000px] mx-auto w-full space-y-8">
        
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">WhatsApp Templates</h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Meta manages WhatsApp template approvals. You must create and approve your templates in the Meta Business Manager before using them in Aries AI broadcasts.
          </p>
        </header>

        {/* Meta Instructions Card */}
        <div className="p-6 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/20 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-sm">
                <MessageSquare className="w-4 h-4" />
                Template Management
              </div>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                Aries AI connects securely to WhatsApp. To create a new broadcast template:
                <br /><br />
                1. Go to your Meta Business Manager.<br />
                2. Navigate to WhatsApp Manager → Message Templates.<br />
                3. Create and submit your template for Meta's approval.<br />
                4. Once Approved, copy the exact <b>Template Name</b> to use in Aries AI broadcasts.
              </p>
            </div>
            
            <a 
              href="https://business.facebook.com/wa/manage/message-templates/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
            >
              Open Meta Business Manager <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

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
              <p className="font-medium text-foreground">No templates found yet.</p>
              <p className="leading-relaxed">
                Since Aries AI uses <strong>Gupshup BSP</strong>, create and manage your WhatsApp templates directly in the
                {' '}<strong>Gupshup Dashboard → Template Manager</strong>. Once approved by Meta, enter the exact template name
                when creating a Broadcast campaign.
              </p>
              <a
                href="https://app.gupshup.io"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
              >
                Open Gupshup Dashboard <ExternalLink className="w-3.5 h-3.5" />
              </a>
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

      </div>
    </div>
  );
}
