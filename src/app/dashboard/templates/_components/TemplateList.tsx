'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Edit2,
  Copy,
  Eye,
  RefreshCw,
  Inbox
} from 'lucide-react';
import type { WaTemplate, TemplateCategory, TemplateStatus } from './types';
import StatusBadge from './StatusBadge';
import WhatsAppPreview from './WhatsAppPreview';

interface Props {
  templates: WaTemplate[];
  loading: boolean;
  onEdit: (template: WaTemplate) => void;
  onDuplicate: (template: WaTemplate) => void;
  onDelete: (id: string, name: string) => void;
  onSync: () => void;
  onCreateNew: () => void;
}

// Premium relative date formatter
function formatRelativeTime(dateStr?: string) {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHr > 0) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
    if (diffMin > 0) return `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
    return 'Just now';
  } catch {
    return 'Recently';
  }
}

export default function TemplateList({
  templates,
  loading,
  onEdit,
  onDuplicate,
  onSync,
  onCreateNew,
}: Props) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activePreviewTemplate, setActivePreviewTemplate] = useState<WaTemplate | null>(null);

  // Filtered templates list
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'ALL' || t.category === categoryFilter;
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [templates, search, categoryFilter, statusFilter]);

  const handleEditClick = (template: WaTemplate) => {
    onEdit(template);
  };

  const handleDuplicateClick = (template: WaTemplate) => {
    onDuplicate(template);
  };

  return (
    <div className="space-y-6">
      {/* ── Premium Clean Filter Toolbar ── */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between bg-card/50 backdrop-blur-md p-4 rounded-2xl border border-border/80 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Search templates by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-semibold hidden sm:inline">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-background border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
          </div>

          {/* Status Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-semibold hidden sm:inline">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING">Pending Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="PAUSED">Paused</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </div>

          {/* Sync Button */}
          <button
            onClick={onSync}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-background text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-95 disabled:opacity-50"
            title="Sync latest template statuses from Meta"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync Status
          </button>
        </div>
      </div>

      {/* ── Main Cards Grid View ── */}
      <div>
        {loading && templates.length === 0 ? (
          /* Premium Skeleton Cards Loading State */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card border border-border/60 rounded-2xl p-5 space-y-4 animate-pulse">
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </div>
                <div className="h-px bg-border/40" />
                <div className="flex justify-between items-center">
                  <div className="h-3 bg-muted rounded w-20" />
                  <div className="flex gap-1">
                    <div className="w-8 h-8 rounded-lg bg-muted" />
                    <div className="w-8 h-8 rounded-lg bg-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          /* Empty / No Matches State */
          <div className="flex flex-col items-center justify-center text-center p-16 bg-card border border-border rounded-2xl shadow-sm space-y-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60">
              <Inbox className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">No WhatsApp templates found</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                {search || categoryFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'No templates match your active filters. Try clearing your search.'
                  : 'Start by creating your first highly engaging, Meta-compliant WhatsApp template.'}
              </p>
            </div>
            {(!search && categoryFilter === 'ALL' && statusFilter === 'ALL') && (
              <button
                onClick={onCreateNew}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm active:scale-98"
              >
                <Plus className="w-3.5 h-3.5" /> Create Template
              </button>
            )}
          </div>
        ) : (
          /* Real Data Card Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template, index) => {
              const relativeTime = formatRelativeTime(template.updatedAt);
              return (
                <motion.div
                  key={template.id || template.localId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
                  whileHover={{ y: -3, transition: { duration: 0.15 } }}
                  className="group flex flex-col justify-between bg-card border border-border/60 hover:border-primary/20 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer"
                  onClick={() => setActivePreviewTemplate(template)}
                >
                  <div className="space-y-4">
                    {/* Top Row: Title & Category/Language Info */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-foreground text-sm tracking-tight truncate group-hover:text-primary transition-colors">
                          {template.name}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                          <span className="font-semibold uppercase tracking-wider text-muted-foreground/90">
                            {template.category}
                          </span>
                          <span className="text-muted-foreground/30">•</span>
                          <span className="font-medium uppercase text-muted-foreground/80">
                            {template.language}
                          </span>
                        </p>
                      </div>
                      
                      {/* Status Badging */}
                      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                        <StatusBadge status={template.status} />
                      </div>
                    </div>
                  </div>

                  {/* Horizontal separating line */}
                  <div className="h-px bg-border/40 my-4" />

                  {/* Bottom Row Actions */}
                  <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setActivePreviewTemplate(template)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border border-border/40 hover:border-border hover:bg-muted text-muted-foreground/80 hover:text-foreground transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/25"
                        title="Preview Template"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleEditClick(template)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border border-border/40 hover:border-border hover:bg-muted text-muted-foreground/80 hover:text-foreground transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/25"
                        title="Edit / Resubmit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDuplicateClick(template)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border border-border/40 hover:border-border hover:bg-muted text-muted-foreground/80 hover:text-foreground transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary/25"
                        title="Duplicate / Copy Template"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Slide-in WhatsApp Live Preview Drawer ── */}
      <AnimatePresence>
        {activePreviewTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/45 backdrop-blur-sm"
              onClick={() => setActivePreviewTemplate(null)}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full max-w-md bg-background border-l border-border h-full shadow-2xl flex flex-col z-10"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h3 className="text-sm font-semibold text-foreground truncate max-w-[240px]">
                    {activePreviewTemplate.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    WhatsApp Live Mockup View
                  </p>
                </div>
                <button
                  onClick={() => setActivePreviewTemplate(null)}
                  className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  Close
                </button>
              </div>

              {/* Content body */}
              <div className="flex-1 overflow-y-auto p-6 bg-muted/15 flex flex-col justify-center items-center">
                <div className="w-full max-w-[320px]">
                  <WhatsAppPreview
                    state={{
                      name: activePreviewTemplate.name,
                      normalizedName: activePreviewTemplate.name,
                      category: activePreviewTemplate.category,
                      subtype: activePreviewTemplate.subtype || 'Default',
                      language: activePreviewTemplate.language,
                      headerType: activePreviewTemplate.headerType || 'NONE',
                      headerText: activePreviewTemplate.headerText || '',
                      headerMediaUrl: activePreviewTemplate.headerMediaUrl || '',
                      body: activePreviewTemplate.body || '',
                      variableMap: activePreviewTemplate.variableMap || {},
                      variableMode: 'NORMAL',
                      footer: activePreviewTemplate.footer || '',
                      buttons: activePreviewTemplate.buttons || [],
                      otpMode: 'COPY_CODE',
                      securityRecommendation: true,
                      validityPeriod: 300,
                      status: activePreviewTemplate.status,
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
