"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Tag, SlidersHorizontal, Zap, Plus, X, ChevronDown,
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, UserCheck,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// ── Types ────────────────────────────────────────────────────────────────────

interface AudienceState {
  type: 'all' | 'tags' | 'custom' | 'retarget';
  tags: string[];
  customFilters: CustomFilter[];
  retargetCampaignId: string | null;
  retargetCondition: 'unread' | 'no_reply' | 'clicked_cta' | 'not_clicked';
  retargetDelayDays: number;
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
}

// ── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'all',      label: 'All Contacts', Icon: Users           },
  { id: 'tags',     label: 'Tags',         Icon: Tag             },
  { id: 'custom',   label: 'Custom Filter', Icon: SlidersHorizontal },
  { id: 'retarget', label: 'Retargeting',  Icon: Zap             },
] as const;

type TabId = typeof TABS[number]['id'];

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

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-3">
      {children}
    </p>
  );
}

/** Pill chip — used for tags, conditions, delays */
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
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all duration-150 select-none ${
        active
          ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm shadow-indigo-500/20'
          : 'bg-transparent text-muted-foreground border-border hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50'
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
          <X className="w-3 h-3" />
        </span>
      )}
    </button>
  );
}

// ── Shimmer number ─────────────────────────────────────────────────────────────

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

// ── Panel: All Contacts ───────────────────────────────────────────────────────

function AllContactsPanel({ totalContacts }: { totalContacts: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-indigo-500/8 border border-indigo-500/15 flex items-center justify-center">
        <Users className="w-5 h-5 text-indigo-500" />
      </div>
      <div>
        <p className="text-[22px] font-semibold text-foreground tabular-nums">
          {totalContacts.toLocaleString()}
          <span className="text-[14px] font-normal text-muted-foreground ml-2">contacts available</span>
        </p>
        <p className="text-[12px] text-muted-foreground mt-1">
          Send to everyone with a phone number
        </p>
      </div>
    </div>
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
      <p className="text-[12px] text-muted-foreground">
        Select tags to target contacts with those labels
      </p>
      {available.length === 0 ? (
        <div className="py-8 text-center">
          <Tag className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">No tags available yet</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
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
        <div className="pt-2 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground mb-2">
            Targeting contacts with{' '}
            <span className="font-semibold text-indigo-600">{selected.length}</span>{' '}
            tag{selected.length > 1 ? 's' : ''}
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

// ── Panel: Custom Filters ─────────────────────────────────────────────────────

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
      <p className="text-[12px] text-muted-foreground">
        Combine conditions to build a precise audience. All filters use AND logic.
      </p>

      <div className="space-y-2">
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
                  <div className="h-px flex-1 bg-border/50" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-2">
                    AND
                  </span>
                  <div className="h-px flex-1 bg-border/50" />
                </motion.div>
              )}
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2"
              >
                {/* Field */}
                <div className="relative flex-1 min-w-0">
                  <select
                    value={filter.field}
                    onChange={e => onUpdate(filter.id, { field: e.target.value })}
                    className="w-full h-9 pl-3 pr-8 bg-background border border-border/70 hover:border-border focus:border-indigo-500/50 rounded-lg text-[12px] text-foreground outline-none transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">Field…</option>
                    {FILTER_FIELDS.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                </div>

                {/* Operator */}
                <div className="relative w-[92px] shrink-0">
                  <select
                    value={filter.operator}
                    onChange={e => onUpdate(filter.id, { operator: e.target.value })}
                    className="w-full h-9 pl-3 pr-7 bg-background border border-border/70 hover:border-border focus:border-indigo-500/50 rounded-lg text-[12px] text-foreground outline-none transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">Op…</option>
                    {FILTER_OPERATORS.map(op => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                </div>

                {/* Value */}
                <input
                  type="text"
                  placeholder="Value…"
                  value={filter.value}
                  onChange={e => onUpdate(filter.id, { value: e.target.value })}
                  className="flex-1 min-w-0 h-9 px-3 bg-background border border-border/70 hover:border-border focus:border-indigo-500/50 rounded-lg text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40"
                />

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => onRemove(filter.id)}
                  className="w-8 h-9 flex items-center justify-center text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0"
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
        className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium text-indigo-600 border border-indigo-500/30 hover:border-indigo-500/60 hover:bg-indigo-50 rounded-lg transition-all"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Filter
      </button>

      {filters.length === 0 && (
        <p className="text-[11px] text-muted-foreground/60 text-center py-2">
          No filters added yet. Click "+ Add Filter" to start.
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
    <div className="space-y-5">
      {/* Source campaign */}
      <div>
        <SectionLabel>Source Campaign</SectionLabel>
        {completedCampaigns.length === 0 ? (
          <p className="text-[12px] text-muted-foreground py-3">
            No completed campaigns available to retarget.
          </p>
        ) : (
          <div className="relative">
            <select
              value={audience.retargetCampaignId || ''}
              onChange={e => onChange({ retargetCampaignId: e.target.value || null })}
              className="w-full h-10 pl-3.5 pr-9 bg-background border border-border/70 hover:border-border focus:border-indigo-500/50 rounded-lg text-[13px] text-foreground outline-none transition-colors appearance-none cursor-pointer"
            >
              <option value="">— Pick a campaign —</option>
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
      <div>
        <SectionLabel>Retarget Condition</SectionLabel>
        <div className="flex flex-wrap gap-2">
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
        <SectionLabel>Send After</SectionLabel>
        <div className="flex flex-wrap gap-2">
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

      {/* Estimate */}
      <AnimatePresence>
        {selectedCampaign && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="flex items-center gap-3 p-3.5 bg-indigo-500/[0.04] border border-indigo-500/15 rounded-xl"
          >
            <UserCheck className="w-4 h-4 text-indigo-500 shrink-0" />
            <p className="text-[13px] text-foreground">
              <span className="font-bold text-indigo-600">~{qualifyCount.toLocaleString()}</span>
              {' '}contacts qualify based on your selection
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Estimation Widget ─────────────────────────────────────────────────────────

function EstimationCard({ estimate }: { estimate: EstimateResult }) {
  const risk = SPAM_RISK_CONFIG[estimate.spamRisk];
  const recipients = Math.max(0, estimate.total - estimate.excluded - estimate.duplicates - estimate.invalid);

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-border/50 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Live Estimate
        </p>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${risk.cls}`}>
          <risk.Icon className="w-3 h-3" />
          {risk.label}
        </span>
      </div>

      {/* Recipient count — hero number */}
      <div className="px-5 py-4 border-b border-border/40">
        <p className="text-[11px] text-muted-foreground mb-0.5">Recipients</p>
        <p className="text-[38px] font-semibold text-foreground leading-none tracking-tight">
          <AnimatedNumber value={recipients} />
        </p>
      </div>

      {/* Breakdown rows */}
      <div className="px-5 py-3 space-y-2.5">
        {[
          { label: 'Opted out (excluded)', value: estimate.excluded,   color: 'text-muted-foreground' },
          { label: 'Duplicates removed',  value: estimate.duplicates, color: 'text-muted-foreground' },
          { label: 'Invalid numbers',     value: estimate.invalid,    color: estimate.invalid > 0 ? 'text-amber-600' : 'text-muted-foreground' },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">{row.label}</span>
            <span className={`text-[12px] font-semibold tabular-nums ${row.color}`}>
              <AnimatedNumber value={row.value} />
            </span>
          </div>
        ))}
      </div>

      {estimate.spamRisk === 'HIGH' && (
        <div className="mx-4 mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200/60 rounded-xl">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-600 leading-snug">
            High spam risk detected. Consider narrowing your audience or reviewing your template before sending.
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
}: AudienceBuilderProps) {
  const activeTab = audience.type as TabId;

  const setTab = useCallback((tab: TabId) => {
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
    <div className="space-y-5">
      {/* ── Tab navigation ───────────────────────────────────────────────── */}
      <div className="relative flex border-b border-border/60">
        {TABS.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-indigo-600'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.Icon className="w-3.5 h-3.5 shrink-0" />
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="audience-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-full"
                  transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className="min-h-[160px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {activeTab === 'all' && (
              <AllContactsPanel totalContacts={totalContacts} />
            )}
            {activeTab === 'tags' && (
              <TagsPanel
                selected={audience.tags}
                available={availableTags}
                onToggle={toggleTag}
              />
            )}
            {activeTab === 'custom' && (
              <CustomFilterPanel
                filters={audience.customFilters}
                onAdd={addFilter}
                onUpdate={updateFilter}
                onRemove={removeFilter}
              />
            )}
            {activeTab === 'retarget' && (
              <RetargetingPanel
                audience={audience}
                completedCampaigns={completedCampaigns}
                onChange={patchAudience}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Live estimation widget ────────────────────────────────────────── */}
      <EstimationCard estimate={estimate} />
    </div>
  );
}
