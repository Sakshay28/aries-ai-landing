'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Plus,
  LayoutGrid,
  FileText,
  CheckCircle2,
  Clock,
  AlertOctagon,
  TrendingUp,
  Inbox
} from 'lucide-react';
import TemplateList from './_components/TemplateList';
import TemplateLibrary from './_components/TemplateLibrary';
import TemplateStudio from './_components/TemplateStudio';
import type { WaTemplate, TemplateFormState, TemplateStatus } from './_components/types';
import { DEFAULT_FORM_STATE } from './_components/constants';

// Helper to parse Meta's components array format into form state fields
function parseMetaComponents(components: any[] = []): Partial<TemplateFormState> {
  const parsed: Partial<TemplateFormState> = {};
  
  const headerComp = components.find((c) => c.type === 'HEADER');
  if (headerComp) {
    if (headerComp.format === 'TEXT') {
      parsed.headerType = 'TEXT';
      parsed.headerText = headerComp.text ?? '';
    } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format)) {
      parsed.headerType = headerComp.format;
      parsed.headerMediaUrl = headerComp.example?.header_handle?.[0] ?? '';
    } else {
      parsed.headerType = 'NONE';
    }
  } else {
    parsed.headerType = 'NONE';
  }

  const bodyComp = components.find((c) => c.type === 'BODY');
  if (bodyComp) {
    parsed.body = bodyComp.text ?? '';
  }

  const footerComp = components.find((c) => c.type === 'FOOTER');
  if (footerComp) {
    parsed.footer = footerComp.text ?? '';
  }

  const buttonsComp = components.find((c) => c.type === 'BUTTONS');
  if (buttonsComp && Array.isArray(buttonsComp.buttons)) {
    parsed.buttons = buttonsComp.buttons.map((b: any, index: number) => {
      let type = 'QUICK_REPLY';
      if (b.type === 'URL') type = 'URL';
      else if (b.type === 'PHONE_NUMBER') type = 'PHONE_NUMBER';
      else if (b.type === 'COPY_CODE') type = 'COPY_CODE';

      return {
        id: `btn-${index}-${Date.now()}`,
        type,
        text: b.text ?? '',
        url: b.url,
        phoneNumber: b.phone_number,
        urlType: b.url ? (b.example ? 'DYNAMIC' : 'STATIC') : undefined,
      };
    });
  } else {
    parsed.buttons = [];
  }

  return parsed;
}

export default function TemplatesPage() {
  const [activeTab, setActiveTab] = useState<'my' | 'explore'>('my');
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioInitialState, setStudioInitialState] = useState<Partial<TemplateFormState> | undefined>(undefined);

  // Fetch templates list
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/templates');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setTemplates(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger initial list load
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Sync statuses from Meta
  const handleSyncStatus = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/dashboard/templates/sync', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.updated > 0) {
        await fetchTemplates();
      }
    } catch (err) {
      console.error('Failed to sync template statuses:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Sync automatically if PENDING templates exist
  useEffect(() => {
    const hasPending = templates.some((t) => t.status === 'PENDING');
    if (!hasPending) return;

    const timer = setInterval(() => {
      handleSyncStatus();
    }, 25000); // every 25 seconds

    return () => clearInterval(timer);
  }, [templates]);

  // Existing template names for zero-latency local checks
  const existingNames = useMemo(() => templates.map((t) => t.name), [templates]);

  // Template count stats
  const stats = useMemo(() => {
    const counts = {
      approved: 0,
      pending: 0,
      rejected: 0,
      drafts: 0,
      total: templates.length,
    };
    templates.forEach((t) => {
      if (t.status === 'APPROVED') counts.approved++;
      else if (t.status === 'PENDING') counts.pending++;
      else if (t.status === 'REJECTED') counts.rejected++;
      else if (t.status === 'DRAFT') counts.drafts++;
    });
    return counts;
  }, [templates]);

  // Create new template handler
  const handleCreateNew = () => {
    setStudioInitialState(DEFAULT_FORM_STATE);
    setStudioOpen(true);
  };

  // Import template from starter library
  const handleImportFromLibrary = (importedState: Partial<TemplateFormState>) => {
    setStudioInitialState(importedState);
    setStudioOpen(true);
  };

  // Edit template handler
  const handleEdit = (tmpl: WaTemplate) => {
    // If it's a Meta-only template (without flat values but with components), parse components
    const componentFields = tmpl.components ? parseMetaComponents(tmpl.components) : {};
    
    const initial: Partial<TemplateFormState> = {
      localDraftId: tmpl.localId,
      metaTemplateId: tmpl.id,
      name: tmpl.name,
      normalizedName: tmpl.name,
      category: tmpl.category,
      subtype: tmpl.subtype || 'Default',
      language: tmpl.language,
      status: tmpl.status,
      headerType: tmpl.headerType || componentFields.headerType || 'NONE',
      headerText: tmpl.headerText || componentFields.headerText || '',
      headerMediaUrl: tmpl.headerMediaUrl || componentFields.headerMediaUrl || '',
      body: tmpl.body || componentFields.body || '',
      footer: tmpl.footer || componentFields.footer || '',
      buttons: tmpl.buttons || componentFields.buttons || [],
      variableMap: tmpl.variableMap || {},
    };

    setStudioInitialState(initial);
    setStudioOpen(true);
  };

  // Duplicate template handler
  const handleDuplicate = (tmpl: WaTemplate) => {
    const componentFields = tmpl.components ? parseMetaComponents(tmpl.components) : {};

    const initial: Partial<TemplateFormState> = {
      name: `${tmpl.name}_copy`,
      normalizedName: `${tmpl.name}_copy`,
      category: tmpl.category,
      subtype: tmpl.subtype || 'Default',
      language: tmpl.language,
      status: 'DRAFT',
      headerType: tmpl.headerType || componentFields.headerType || 'NONE',
      headerText: tmpl.headerText || componentFields.headerText || '',
      headerMediaUrl: tmpl.headerMediaUrl || componentFields.headerMediaUrl || '',
      body: tmpl.body || componentFields.body || '',
      footer: tmpl.footer || componentFields.footer || '',
      buttons: tmpl.buttons || componentFields.buttons || [],
      variableMap: tmpl.variableMap || {},
    };

    setStudioInitialState(initial);
    setStudioOpen(true);
  };

  // Delete template handler
  const handleDelete = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/dashboard/templates/${id}?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        await fetchTemplates();
      } else {
        alert(json.error || 'Failed to delete template');
      }
    } catch (err) {
      console.error('Delete template error:', err);
      alert('Network error. Failed to delete template.');
    }
  };

  // Handle saved draft or submission from Studio
  const handleStudioSaved = () => {
    setStudioOpen(false);
    fetchTemplates();
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-6xl mx-auto w-full space-y-8">
        
        {/* ── Header ── */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              WhatsApp Templates Studio
            </h1>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Create, manage and deploy WhatsApp templates with Meta approval tracking and live previews.
            </p>
          </div>
          <button
            onClick={handleCreateNew}
            className="shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-sm font-semibold shadow-md transition-all active:scale-98"
          >
            <Plus className="w-4 h-4" /> Create Template
          </button>
        </header>

        {/* ── Stats Dashboard ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Approved */}
          <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-primary/20 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Approved by Meta</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold mt-2 text-foreground">{stats.approved}</p>
            <p className="text-[10px] text-muted-foreground/80 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" /> Active in broadcasts
            </p>
          </div>

          {/* Pending */}
          <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-primary/20 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Pending Review</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold mt-2 text-foreground">{stats.pending}</p>
            <p className="text-[10px] text-muted-foreground/80 mt-1">Reviewing under 24h</p>
          </div>

          {/* Rejected */}
          <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-primary/20 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Meta Rejected</span>
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500">
                <AlertOctagon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold mt-2 text-foreground">{stats.rejected}</p>
            <p className="text-[10px] text-muted-foreground/80 mt-1">Requires modification</p>
          </div>

          {/* Local Drafts */}
          <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-primary/20 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Local Drafts</span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold mt-2 text-foreground">{stats.drafts}</p>
            <p className="text-[10px] text-muted-foreground/80 mt-1">Saved autosave drafts</p>
          </div>
        </div>

        {/* ── Tab Switcher ── */}
        <div className="flex bg-muted p-1.5 rounded-xl gap-1.5 border border-border/60 shadow-inner w-fit">
          <button
            onClick={() => setActiveTab('my')}
            className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'my'
                ? 'bg-card text-foreground border border-border shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            All Templates ({stats.total})
          </button>
          <button
            onClick={() => setActiveTab('explore')}
            className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'explore'
                ? 'bg-card text-foreground border border-border shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            Starter Library
          </button>
        </div>

        {/* ── Main View Area ── */}
        <div className="min-h-[400px]">
          {activeTab === 'my' ? (
            <TemplateList
              templates={templates}
              loading={loading || syncing}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onSync={handleSyncStatus}
              onCreateNew={handleCreateNew}
            />
          ) : (
            <TemplateLibrary onImport={handleImportFromLibrary} />
          )}
        </div>
      </div>

      {/* ── Dynamic Template Studio Full-Screen Workspace Drawer ── */}
      <AnimatePresence>
        {studioOpen && (
          <TemplateStudio
            initial={studioInitialState}
            onClose={() => setStudioOpen(false)}
            onSaved={handleStudioSaved}
            existingNames={existingNames}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
