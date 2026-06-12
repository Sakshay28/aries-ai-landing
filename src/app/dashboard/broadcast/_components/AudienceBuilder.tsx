"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Tag, SlidersHorizontal, Zap, Plus, X, ChevronDown,
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, UserCheck,
  UploadCloud, FileSpreadsheet, Check, CheckCircle2, UserCheck2
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { ContactPickerDrawer } from './ContactPickerDrawer';
import toast from 'react-hot-toast';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AudienceState {
  type: 'all' | 'tags' | 'custom' | 'retarget' | 'csv' | 'manual';
  tags: string[];
  customFilters: CustomFilter[];
  retargetCampaignId: string | null;
  retargetCondition: 'unread' | 'no_reply' | 'clicked_cta' | 'not_clicked';
  retargetDelayDays: number;
  manualContactIds?: string[];
  csvFile?: any;
}

interface CustomFilter {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface EstimateResult {
  total: number;
  excluded: number;
  duplicates: number;
  invalid: number;
  noConsent: number;
  spamRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface Campaign {
  id: string;
  name: string;
  sent_count: number;
  read_count: number;
}

interface AudienceBuilderProps {
  audience: AudienceState;
  onChange: (a: AudienceState) => void;
  estimate: EstimateResult;
  totalContacts: number;
  completedCampaigns: Campaign[];
  availableTags?: string[];
  onOpenRecipientsDrawer?: () => void;
}

type ChoiceId = AudienceState['type'];

interface ChoiceCard {
  id: ChoiceId;
  label: string;
  description: string;
  icon: React.ElementType;
}

const AUDIENCE_CHOICES: ChoiceCard[] = [
  {
    id: 'all',
    label: 'All Contacts',
    description: 'Target every active contact in your database',
    icon: Users,
  },
  {
    id: 'custom',
    label: 'Segments',
    description: 'Build smart conditional target groups',
    icon: SlidersHorizontal,
  },
  {
    id: 'tags',
    label: 'Tags',
    description: 'Target by labeled categories (e.g. VIP, Lead)',
    icon: Tag,
  },
  {
    id: 'manual',
    label: 'Select Contacts',
    description: 'Select individual recipients manually',
    icon: Users,
  },
  {
    id: 'csv',
    label: 'CSV Upload',
    description: 'Import contacts instantly from a spreadsheet',
    icon: FileSpreadsheet,
  },
  {
    id: 'retarget',
    label: 'Retargeting',
    description: 'Reconnect with unengaged past audiences',
    icon: Zap,
  },
];

const FILTER_FIELDS = [
  { value: 'country',          label: 'Country'          },
  { value: 'lead_score',       label: 'Lead Score'       },
  { value: 'last_interaction', label: 'Last Interaction' },
  { value: 'channel',          label: 'Channel'          },
] as const;

const FILTER_OPERATORS = [
  { value: '=',        label: '=' },
  { value: '>',        label: '>' },
  { value: '<',        label: '<' },
  { value: 'contains', label: 'contains' },
] as const;

const RETARGET_CONDITIONS = [
  { value: 'unread',      label: 'Unread'      },
  { value: 'no_reply',    label: 'No Reply'    },
  { value: 'clicked_cta', label: 'Clicked CTA' },
  { value: 'not_clicked', label: 'Not Clicked' },
] as const;

const RETARGET_DELAYS = [1, 3, 7, 14] as const;

const SPAM_RISK_CONFIG: Record<EstimateResult['spamRisk'], {
  label: string;
  cls: string;
  Icon: React.ElementType;
}> = {
  LOW:    { label: 'Low Risk',    cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', Icon: ShieldCheck  },
  MEDIUM: { label: 'Medium Risk', cls: 'bg-amber-500/10  text-amber-600  border-amber-500/20',    Icon: ShieldAlert  },
  HIGH:   { label: 'High Risk',   cls: 'bg-red-500/10    text-red-600    border-red-500/20',       Icon: ShieldX      },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2.5">
      {children}
    </p>
  );
}

function Chip({
  active,
  onClick,
  children,
  removable,
  onRemove,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all duration-200 select-none ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/10'
          : 'bg-transparent text-muted-foreground border-border hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50'
      }`}
    >
      {children}
      {removable && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Remove"
          onClick={e => { e.stopPropagation(); onRemove?.(); }}
          onKeyDown={e => e.key === 'Enter' && onRemove?.()}
          className="ml-0.5 opacity-60 hover:opacity-100"
        >
          <X className="w-3.5 h-3.5" />
        </span>
      )}
    </button>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const [flash, setFlash]     = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      setFlash(true);
      const timer = setTimeout(() => {
        setDisplay(value);
        prev.current = value;
        setFlash(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <span
      className={`tabular-nums transition-opacity duration-150 ${flash ? 'opacity-30' : 'opacity-100'}`}
    >
      {display.toLocaleString()}
    </span>
  );
}

// ── Onboarding Option Cards Grid ──────────────────────────────────────────────

function OnboardingGrid({
  selected,
  onSelect,
}: {
  selected: ChoiceId;
  onSelect: (id: ChoiceId) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted-foreground/80 font-bold uppercase tracking-widest select-none text-left">
        Targeting Strategy
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {AUDIENCE_CHOICES.map((choice) => {
          const isActive = choice.id === selected;
          const Icon = choice.icon;
          return (
            <motion.div
              key={choice.id}
              onClick={() => onSelect(choice.id)}
              whileHover={{ scale: 1.01, y: -2 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              className={`group flex flex-col justify-between text-left p-6 min-h-[180px] rounded-2xl border cursor-pointer transition-all duration-200 select-none ${
                isActive
                  ? 'border-indigo-500/40 bg-indigo-500/[0.03] dark:bg-indigo-500/[0.01] shadow-[0_8px_30px_rgba(99,102,241,0.08),0_0_0_2px_rgba(99,102,241,0.25)] ring-2 ring-indigo-500/25'
                  : 'border-border/60 hover:border-indigo-500/30 hover:bg-secondary/5 hover:shadow-lg'
              }`}
            >
              {/* Top: Icon Badge */}
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-300 ${
                  isActive
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-900/30 dark:border-indigo-800'
                    : 'bg-secondary/40 border-border/40 text-muted-foreground/60 group-hover:bg-indigo-500/5 group-hover:border-indigo-500/15 group-hover:text-indigo-600'
                }`}
              >
                <Icon className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
              </div>
              
              {/* Middle: Title */}
              <h4
                className={`text-[15px] font-bold tracking-tight transition-colors duration-200 mt-2 ${
                  isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-900 dark:text-zinc-100 group-hover:text-foreground'
                }`}
              >
                {choice.label}
              </h4>

              {/* Bottom: Description */}
              <p className="text-[12px] text-muted-foreground/70 leading-relaxed transition-colors duration-200 group-hover:text-muted-foreground/80 mt-1">
                {choice.description}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Panel: CSV Upload (High fidelity validation experience) ───────────────────

function CSVUploadPanel({ 
  csvFile, 
  onUpload 
}: { 
  csvFile: any; 
  onUpload: (result: any) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/broadcast/csv/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        onUpload({
          name: data.fileName,
          size: data.fileSize,
          rows: data.totalRows,
          duplicates: data.duplicatesRemoved,
          invalid: data.invalidRows,
          valid: data.validRows,
          contacts: data.contacts
        });
        toast.success('Spreadsheet processed successfully!');
      } else {
        toast.error(data.error || 'Failed to upload CSV');
      }
    } catch {
      toast.error('Connection error during upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".csv,.xls,.xlsx" 
        className="hidden" 
      />
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="flex flex-col items-center justify-center p-6 border border-dashed border-border hover:border-indigo-400/80 rounded-2xl bg-secondary/10 cursor-pointer transition-all group"
      >
        <UploadCloud className={`w-8 h-8 ${uploading ? 'animate-bounce text-indigo-500' : 'text-muted-foreground/50 group-hover:text-indigo-500'} transition-colors mb-2.5`} />
        <p className="text-[12px] font-semibold text-foreground">
          {uploading ? 'Processing spreadsheet...' : 'Drag and drop your spreadsheet here or browse'}
        </p>
        <p className="text-[10.5px] text-muted-foreground/75 mt-1">
          Supports .csv, .xls, .xlsx files up to 10MB
        </p>
      </div>

      {/* CSV Validation Feedback */}
      <AnimatePresence>
        {csvFile && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="p-4 bg-background border border-border/60 rounded-2xl shadow-sm space-y-3.5"
          >
            {/* File info header */}
            <div className="flex items-center gap-3 pb-3 border-b border-border/30">
              <div className="w-8.5 h-8.5 rounded-lg bg-[#22c55e]/8 border border-[#22c55e]/20 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4.5 h-4.5 text-[#22c55e]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-foreground truncate">{csvFile.name}</p>
                <p className="text-[10px] text-muted-foreground">{csvFile.size} · {(csvFile.rows || 0).toLocaleString()} rows uploaded</p>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-bold text-[#22c55e] bg-[#22c55e]/10 border border-[#22c55e]/20 px-2 py-0.5 rounded-md">
                <Check className="w-3 h-3" /> Ready
              </div>
            </div>

            {/* Micro Validation Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-3 bg-secondary/15 rounded-xl border border-border/20 text-left">
                <p className="text-[10px] font-semibold text-muted-foreground">Duplicates</p>
                <p className="text-[15px] font-bold text-foreground mt-0.5">{(csvFile.duplicates || 0)} removed</p>
                <p className="text-[9.5px] text-muted-foreground/80 mt-1">Ready for compliance ✓</p>
              </div>
              <div className="p-3 bg-secondary/15 rounded-xl border border-border/20 text-left">
                <p className="text-[10px] font-semibold text-muted-foreground">Invalid Numbers</p>
                <p className="text-[15px] font-bold text-[#eab308] mt-0.5">{(csvFile.invalid || 0)} corrected</p>
                <p className="text-[9.5px] text-muted-foreground/80 mt-1">Country codes resolved ✓</p>
              </div>
              <div className="p-3 bg-secondary/15 rounded-xl border border-border/20 text-left">
                <p className="text-[10px] font-semibold text-muted-foreground">Net Recipients</p>
                <p className="text-[15px] font-bold text-[#22c55e] mt-0.5">{(csvFile.valid || 0).toLocaleString()}</p>
                <p className="text-[9.5px] text-muted-foreground/80 mt-1">Verified live numbers ✓</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Panel: All Contacts ───────────────────────────────────────────────────────

function AllContactsPanel({ totalContacts, onClick }: { totalContacts: number; onClick?: () => void }) {
  const count = totalContacts;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className="flex items-start gap-4 p-4 rounded-xl bg-indigo-500/[0.04] border border-indigo-500/15 cursor-pointer hover:bg-indigo-500/[0.07] hover:border-indigo-500/25 hover:shadow-sm transition-all duration-150 text-left select-none"
    >
      <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <Users className="w-4 h-4 text-indigo-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-foreground tracking-tight">
          All Contacts Selected
        </p>
        <p className="text-[12px] text-muted-foreground/80 mt-0.5 leading-relaxed">
          {count.toLocaleString()} eligible recipients in your database
        </p>
        <p className="text-[11px] text-muted-foreground/60 mt-1.5">
          Broadcast will be delivered to all active opted-in contacts. Click to view list.
        </p>
      </div>
      <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md shrink-0">
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
        <span className="text-[10px] font-bold text-emerald-600">Active</span>
      </div>
    </motion.div>
  );
}



// ── Audience Active Status Banner (for Tags / CSV / Segments / Retarget) ─────

const AUDIENCE_STATUS_COPY: Record<string, { title: string; subtitle: string }> = {
  tags:     { title: 'Tagged Audience Active',      subtitle: 'Broadcast will send to selected contact tags.' },
  custom:   { title: 'Segment Audience Active',     subtitle: 'Broadcast will target filtered customer groups.' },
  csv:      { title: 'CSV Audience Ready',           subtitle: 'Imported recipients available for dispatch.' },
  retarget: { title: 'Retargeting Audience Active',  subtitle: 'Re-engaging selected broadcast recipients.' },
  manual:   { title: 'Manual Contacts Active',      subtitle: 'Targeting specific recipients selected from CRM.' },
};

function AudienceActiveBanner({ type, onClick }: { type: string; onClick?: () => void }) {
  const copy = AUDIENCE_STATUS_COPY[type];
  if (!copy) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl bg-indigo-500/[0.04] border border-indigo-500/[0.12] mb-4 cursor-pointer hover:bg-indigo-500/[0.07] hover:border-indigo-500/20 hover:shadow-sm transition-all duration-150 text-left select-none"
    >
      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[12px] font-semibold text-foreground">{copy.title}</span>
        <span className="text-[11.5px] text-muted-foreground/70 ml-2">{copy.subtitle} (Click to view)</span>
      </div>
      <div className="flex items-center gap-1 bg-emerald-500/[0.08] border border-emerald-500/[0.15] px-2 py-0.5 rounded-md shrink-0">
        <span className="text-[10px] font-bold text-emerald-600">Active</span>
      </div>
    </motion.div>
  );
}

// ── Panel: Tags ───────────────────────────────────────────────────────────────

function TagsPanel({

  selected,
  available,
  onToggle,
}: {
  selected: string[];
  available: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground/85 leading-relaxed">
        Select target tags. Contacts tagged with any of these labels will receive this campaign:
      </p>
      {available.length === 0 ? (
        <div className="py-6 text-center">
          <Tag className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[12px] text-muted-foreground">No tags found in CRM list</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {available.map(tag => (
            <Chip
              key={tag}
              active={selected.includes(tag)}
              onClick={() => onToggle(tag)}
            >
              {tag}
            </Chip>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div className="pt-3.5 border-t border-border/30">
          <p className="text-[10.5px] font-semibold text-muted-foreground mb-2">
            Targeting contacts with {selected.length} label{selected.length > 1 ? 's' : ''}:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selected.map(tag => (
              <Chip
                key={tag}
                active
                removable
                onRemove={() => onToggle(tag)}
              >
                {tag}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel: Custom Filters (Segments) ──────────────────────────────────────────

function CustomFilterPanel({
  filters,
  onAdd,
  onUpdate,
  onRemove,
}: {
  filters: CustomFilter[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<CustomFilter>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground/85 leading-relaxed">
        Build smart customer cohorts based on database fields, country codes, and interaction metrics:
      </p>

      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {filters.map((filter, idx) => (
            <React.Fragment key={filter.id}>
              {idx > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-1"
                >
                  <div className="h-px flex-1 bg-border/20" />
                  <span className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground/40 px-2">
                    AND
                  </span>
                  <div className="h-px flex-1 bg-border/20" />
                </motion.div>
              )}
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2"
              >
                {/* Field */}
                <div className="relative flex-1 min-w-0">
                  <select
                    value={filter.field}
                    onChange={e => onUpdate(filter.id, { field: e.target.value })}
                    className="w-full h-9 pl-3 pr-8 bg-background border border-border/60 hover:border-border focus:border-indigo-500/50 rounded-lg text-[12px] text-foreground outline-none transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">Select Field…</option>
                    {FILTER_FIELDS.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                </div>

                {/* Operator */}
                <div className="relative w-[85px] shrink-0">
                  <select
                    value={filter.operator}
                    onChange={e => onUpdate(filter.id, { operator: e.target.value })}
                    className="w-full h-9 pl-3 pr-7 bg-background border border-border/60 hover:border-border focus:border-indigo-500/50 rounded-lg text-[12px] text-foreground outline-none transition-colors appearance-none cursor-pointer"
                  >
                    {FILTER_OPERATORS.map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                </div>

                {/* Value */}
                <input
                  type="text"
                  placeholder="Filter Value…"
                  value={filter.value}
                  onChange={e => onUpdate(filter.id, { value: e.target.value })}
                  className="flex-1 min-w-0 h-9 px-3 bg-background border border-border/60 hover:border-border focus:border-indigo-500/50 rounded-lg text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/35"
                />

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => onRemove(filter.id)}
                  className="w-8 h-9 flex items-center justify-center text-muted-foreground/45 hover:text-rose-500 hover:bg-rose-50/50 rounded-lg transition-all shrink-0"
                  aria-label="Remove filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            </React.Fragment>
          ))}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 px-3.5 py-1.5 text-[11.5px] font-bold text-indigo-600 border border-indigo-500/20 hover:border-indigo-500/40 hover:bg-indigo-50/40 rounded-lg transition-all"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Segment Rule
      </button>

      {filters.length === 0 && (
        <p className="text-[11px] text-muted-foreground/60 text-center py-2.5">
          No filters added yet. Click "Add Segment Rule" to begin grouping.
        </p>
      )}
    </div>
  );
}

// ── Panel: Retargeting ────────────────────────────────────────────────────────

function RetargetingPanel({
  audience,
  completedCampaigns,
  onChange,
}: {
  audience: AudienceState;
  completedCampaigns: Campaign[];
  onChange: (patch: Partial<AudienceState>) => void;
}) {
  const selectedCampaign = completedCampaigns.find(c => c.id === audience.retargetCampaignId);
  const qualifyCount = selectedCampaign
    ? Math.max(0, (selectedCampaign.sent_count || 0) - (selectedCampaign.read_count || 0))
    : 0;

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground/85 leading-relaxed">
        Reconnect dynamically with audiences from completed past broadcast campaigns:
      </p>

      {/* Source campaign */}
      <div>
        <SectionLabel>Source Campaign</SectionLabel>
        {completedCampaigns.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground/80 py-2.5">
            No completed campaigns available to retarget yet.
          </p>
        ) : (
          <div className="relative">
            <select
              value={audience.retargetCampaignId || ''}
              onChange={e => onChange({ retargetCampaignId: e.target.value || null })}
              className="w-full h-9.5 pl-3.5 pr-9 bg-background border border-border/70 hover:border-border focus:border-indigo-500/50 rounded-lg text-[13px] text-foreground outline-none transition-colors appearance-none cursor-pointer"
            >
              <option value="">— Select completed broadcast —</option>
              {completedCampaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.sent_count.toLocaleString()} sent)
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Condition chips */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <SectionLabel>Retarget Condition</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {RETARGET_CONDITIONS.map(c => (
              <Chip
                key={c.value}
                active={audience.retargetCondition === c.value}
                onClick={() => onChange({ retargetCondition: c.value })}
              >
                {c.label}
              </Chip>
            ))}
          </div>
        </div>

        {/* Delay chips */}
        <div>
          <SectionLabel>Send Delay</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {RETARGET_DELAYS.map(days => (
              <Chip
                key={days}
                active={audience.retargetDelayDays === days}
                onClick={() => onChange({ retargetDelayDays: days })}
              >
                {days} {days === 1 ? 'day' : 'days'}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Estimate */}
      <AnimatePresence>
        {selectedCampaign && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="flex items-center gap-3 p-3 bg-indigo-500/[0.03] border border-indigo-500/10 rounded-xl"
          >
            <UserCheck className="w-4 h-4 text-indigo-500 shrink-0" />
            <p className="text-[12px] text-foreground font-medium">
              Targeting <span className="font-bold text-indigo-600">~{qualifyCount.toLocaleString()}</span> unengaged contacts from "{selectedCampaign.name}"
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Live Estimation Card Widget ──────────────────────────────────────────────

function EstimationCard({ estimate }: { estimate: EstimateResult }) {
  const risk = SPAM_RISK_CONFIG[estimate.spamRisk];
  const recipients = Math.max(0, estimate.total - estimate.excluded - estimate.duplicates - estimate.invalid - (estimate.noConsent || 0));

  return (
    <div className="rounded-2xl border border-border/30 bg-[#fbfcfd] dark:bg-card/40 overflow-hidden shadow-sm pt-4.5 pb-2">
      {/* Header */}
      <div className="px-5 pb-3 border-b border-border/20 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Audience Estimate
        </p>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${risk.cls}`}>
          <risk.Icon className="w-3 h-3" />
          {risk.label}
        </span>
      </div>

      {/* Hero numbers panel */}
      <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b border-border/20">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/45 mb-1">Recipients</p>
          {recipients > 0 ? (
            <p className="text-[34px] font-semibold text-foreground leading-none tracking-tight">
              <AnimatedNumber value={recipients} />
            </p>
          ) : (
            <p className="text-[16px] font-semibold text-muted-foreground/50 leading-loose">
              Awaiting selection
            </p>
          )}
        </div>
        <div className="flex flex-col justify-end text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/45 mb-1.5">Compliance</p>
          <p className="text-[11.5px] font-semibold text-emerald-600/90 flex items-center justify-end gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> 100% Consented
          </p>
        </div>
      </div>

      {/* Breakdown detail list */}
      <div className="px-5 py-3 space-y-2.5 text-[12px]">
        {[
          { label: 'CRM Contacts Excluded (Opted out)', value: estimate.excluded,   color: 'text-muted-foreground/75' },
          { label: 'No Consent (Never messaged)',       value: estimate.noConsent || 0, color: (estimate.noConsent || 0) > 0 ? 'text-rose-600 font-semibold' : 'text-muted-foreground/75' },
          { label: 'Removed Duplicates',  value: estimate.duplicates, color: 'text-muted-foreground/75' },
          { label: 'Corrected / Flagged Invalid Numbers',     value: estimate.invalid,    color: estimate.invalid > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground/75' },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-muted-foreground/80">{row.label}</span>
            <span className={`font-semibold tabular-nums ${row.color}`}>
              <AnimatedNumber value={row.value} />
            </span>
          </div>
        ))}
      </div>

      {(estimate.noConsent || 0) > 0 && (
        <div className="mx-4 mb-2 mt-2 flex items-start gap-2.5 p-3 bg-rose-50 dark:bg-rose-500/5 border border-rose-200/60 dark:border-rose-500/15 rounded-xl">
          <ShieldX className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-rose-700 dark:text-rose-400 leading-relaxed font-medium">
            <strong>{(estimate.noConsent || 0).toLocaleString()} contact{(estimate.noConsent || 0) !== 1 ? 's' : ''} blocked</strong> — they have never messaged your WhatsApp number. Per WhatsApp Business Policy, broadcasts require prior consent. These contacts must initiate a conversation first.
          </p>
        </div>
      )}

      {estimate.spamRisk === 'HIGH' && (
        <div className="mx-4 mb-2 mt-2 flex items-start gap-2.5 p-3 bg-rose-50 border border-rose-100 rounded-xl">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-rose-600 leading-relaxed font-medium">
            Spam Alert: A large audience volume was detected. Consider applying a Segments filter to restrict target batches.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AudienceBuilder({
  audience,
  onChange,
  estimate,
  totalContacts,
  completedCampaigns,
  availableTags = [],
  onOpenRecipientsDrawer,
}: AudienceBuilderProps) {
  const activeTab = audience.type as ChoiceId;
  const [pickerOpen, setPickerOpen] = useState(false);

  const setChoice = useCallback((tab: ChoiceId) => {
    onChange({ ...audience, type: tab });
  }, [audience, onChange]);

  const toggleTag = useCallback((tag: string) => {
    const next = audience.tags.includes(tag)
      ? audience.tags.filter(t => t !== tag)
      : [...audience.tags, tag];
    onChange({ ...audience, tags: next });
  }, [audience, onChange]);

  const addFilter = useCallback(() => {
    const newFilter: CustomFilter = { id: uuidv4(), field: '', operator: '=', value: '' };
    onChange({ ...audience, customFilters: [...audience.customFilters, newFilter] });
  }, [audience, onChange]);

  const updateFilter = useCallback((id: string, patch: Partial<CustomFilter>) => {
    onChange({
      ...audience,
      customFilters: audience.customFilters.map(f => f.id === id ? { ...f, ...patch } : f),
    });
  }, [audience, onChange]);

  const removeFilter = useCallback((id: string) => {
    onChange({ ...audience, customFilters: audience.customFilters.filter(f => f.id !== id) });
  }, [audience, onChange]);

  const patchAudience = useCallback((patch: Partial<AudienceState>) => {
    onChange({ ...audience, ...patch });
  }, [audience, onChange]);

  return (
    <div className="space-y-6">
      {/* Onboarding grid selection */}
      <OnboardingGrid selected={activeTab} onSelect={setChoice} />

      {/* Expanded contextual configuration container */}
      <div className="pt-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
            animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-border/20 pt-4"
          >
            {activeTab === 'all' && (
              <AllContactsPanel totalContacts={totalContacts} onClick={onOpenRecipientsDrawer} />
            )}
            {activeTab === 'tags' && (
              <div>
                <AudienceActiveBanner type="tags" onClick={onOpenRecipientsDrawer} />
                <TagsPanel
                  selected={audience.tags}
                  available={availableTags}
                  onToggle={toggleTag}
                />
              </div>
            )}
            {activeTab === 'custom' && (
              <div>
                <AudienceActiveBanner type="custom" onClick={onOpenRecipientsDrawer} />
                <CustomFilterPanel
                  filters={audience.customFilters}
                  onAdd={addFilter}
                  onUpdate={updateFilter}
                  onRemove={removeFilter}
                />
              </div>
            )}
            {activeTab === 'manual' && (
              <div>
                <AudienceActiveBanner type="manual" onClick={onOpenRecipientsDrawer} />
                <div className="flex items-start gap-4 p-4 rounded-xl bg-indigo-500/[0.04] border border-indigo-500/15">
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Users className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="flex-grow text-left">
                    <p className="text-[13.5px] font-semibold text-foreground tracking-tight">
                      Manual Contacts Targeting Active
                    </p>
                    <p className="text-[12px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                      {(audience.manualContactIds || []).length} contact{(audience.manualContactIds || []).length !== 1 ? 's' : ''} selected manually
                    </p>
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="mt-3 text-[11.5px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-500/[0.05] border border-indigo-500/15 hover:border-indigo-500/30 px-3 py-1.5 rounded-lg transition-all"
                    >
                      {(audience.manualContactIds || []).length > 0 ? 'Modify Selection' : 'Select Contacts'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'csv' && (
              <div>
                <AudienceActiveBanner type="csv" onClick={onOpenRecipientsDrawer} />
                <CSVUploadPanel 
                  csvFile={audience.csvFile}
                  onUpload={(result) => onChange({ ...audience, csvFile: result })}
                />
              </div>
            )}
            {activeTab === 'retarget' && (
              <div>
                <AudienceActiveBanner type="retarget" onClick={onOpenRecipientsDrawer} />
                <RetargetingPanel
                  audience={audience}
                  completedCampaigns={completedCampaigns}
                  onChange={patchAudience}
                />
              </div>
            )}
          </motion.div>

        </AnimatePresence>
      </div>

      {/* Live Estimate Breakdown Card */}
      <EstimationCard estimate={estimate} />

      {/* Slide-over Contact Picker Drawer */}
      <ContactPickerDrawer
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedIds={audience.manualContactIds || []}
        onApply={(ids) => {
          onChange({
            ...audience,
            manualContactIds: ids
          });
        }}
      />
    </div>
  );
}
