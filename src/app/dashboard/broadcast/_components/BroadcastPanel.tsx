import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, X, BarChart3, Edit3, Calendar, Zap, AlertCircle,
  Send, CheckCircle2, Clock, FileText
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface Campaign {
  id: string;
  name: string;
  template_name: string;
  status: string;
  audience_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  scheduled_at?: string | null;
}

interface ApprovedTemplate {
  name: string;
  body: string;
}

interface BroadcastPanelProps {
  panelMode: 'edit' | 'analytics' | 'new' | null;
  selectedCampaign: Campaign | null;
  editName: string;
  editTemplate: string;
  saving: boolean;
  sending: boolean;
  onClose: () => void;
  onSave: () => void;
  onSend: (id: string) => void;
  setEditName: (name: string) => void;
  setEditTemplate: (template: string) => void;
  approvedTemplates: ApprovedTemplate[];
  audienceType: 'all' | 'retarget';
  setAudienceType: (val: 'all' | 'retarget') => void;
  retargetParentId: string | null;
  setRetargetParentId: (id: string | null) => void;
  scheduledAt: string | null;
  setScheduledAt: (val: string | null) => void;
  completedCampaigns: Campaign[];
  campaigns: Campaign[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTemplateScore(name: string): { level: 'HIGH' | 'MEDIUM' | 'LOW'; pct: number } {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  const val = h % 100;
  if (val > 65) return { level: 'HIGH', pct: val };
  if (val > 30) return { level: 'MEDIUM', pct: val };
  return { level: 'LOW', pct: val };
}

function cleanName(name: string): string {
  if (name.startsWith('__retarget:')) {
    const idx = name.indexOf('__:');
    if (idx !== -1) return name.slice(idx + 3);
  }
  return name;
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 bg-secondary/60 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Section Label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2">
      {children}
    </label>
  );
}

// ── Toggle Option ─────────────────────────────────────────────────────────────
function ToggleOption({
  label, sublabel, icon: Icon, active, onClick
}: {
  label: string; sublabel?: string; icon: React.ElementType; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-left transition-all duration-150 ${
        active
          ? 'border-indigo-500/40 bg-indigo-500/6 text-foreground'
          : 'border-border/60 bg-transparent text-muted-foreground hover:border-border hover:text-foreground hover:bg-foreground/[0.02]'
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-500' : 'text-muted-foreground/50'}`} />
      <div>
        <p className="text-[13px] font-medium leading-tight">{label}</p>
        {sublabel && <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{sublabel}</p>}
      </div>
      <div className="ml-auto">
        <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
          active ? 'border-indigo-500 bg-indigo-500' : 'border-border/60 bg-transparent'
        }`}>
          {active && <div className="w-full h-full rounded-full bg-white scale-[0.45] block" />}
        </div>
      </div>
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function BroadcastPanel({
  panelMode,
  selectedCampaign,
  editName,
  editTemplate,
  saving,
  sending,
  onClose,
  onSave,
  onSend,
  setEditName,
  setEditTemplate,
  approvedTemplates,
  audienceType,
  setAudienceType,
  retargetParentId,
  setRetargetParentId,
  scheduledAt,
  setScheduledAt,
  completedCampaigns,
}: BroadcastPanelProps) {
  if (!panelMode) return null;

  const selectedTemplate = approvedTemplates.find(t => t.name === editTemplate);
  const score = editTemplate ? getTemplateScore(editTemplate) : null;

  const scoreColors = {
    HIGH: {
      badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
      bar: 'bg-emerald-500',
      label: 'High performance',
    },
    MEDIUM: {
      badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
      bar: 'bg-amber-400',
      label: 'Medium performance',
    },
    LOW: {
      badge: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
      bar: 'bg-rose-500',
      label: 'Low performance',
    },
  };

  const panelTitle = panelMode === 'new' ? 'New Campaign' : panelMode === 'edit' ? 'Edit Campaign' : 'Campaign Analytics';
  const panelSubtitle = panelMode === 'new' ? 'Configure and launch your broadcast' : selectedCampaign ? cleanName(selectedCampaign.name) : '';

  const retargetParent = completedCampaigns.find(c => c.id === retargetParentId);
  const retargetSize = retargetParent ? Math.max(0, (retargetParent.sent_count || 0) - (retargetParent.read_count || 0)) : 0;

  const isDraft = selectedCampaign?.status === 'draft';
  const deliveryRate = selectedCampaign?.sent_count
    ? Math.round(((selectedCampaign.delivered_count || 0) / selectedCampaign.sent_count) * 100)
    : 0;
  const readRate = selectedCampaign?.sent_count
    ? Math.round(((selectedCampaign.read_count || 0) / selectedCampaign.sent_count) * 100)
    : 0;

  return (
    <AnimatePresence>
      {/* Overlay */}
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 bg-background/60 backdrop-blur-[2px] z-40"
      />

      {/* Panel */}
      <motion.div
        key="panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
        className="fixed inset-y-0 right-0 w-full md:w-[520px] bg-card border-l border-border shadow-2xl z-50 flex flex-col"
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
              {panelMode === 'analytics' ? (
                <BarChart3 className="w-4 h-4 text-foreground/70" />
              ) : panelMode === 'new' ? (
                <Send className="w-4 h-4 text-indigo-500" />
              ) : (
                <Edit3 className="w-4 h-4 text-foreground/70" />
              )}
            </div>
            <div>
              <h2 className="text-[14px] font-semibold tracking-tight text-foreground">{panelTitle}</h2>
              {panelSubtitle && (
                <p className="text-[11px] text-muted-foreground truncate max-w-[280px]">{panelSubtitle}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">

          {/* ── Form (new / edit) ──────────────────────────────────────────── */}
          {(panelMode === 'edit' || panelMode === 'new') && (
            <div className="p-6 space-y-7">

              {/* 1. Campaign Name */}
              <div>
                <SectionLabel>Campaign Name</SectionLabel>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="e.g. Diwali Offer 2025"
                  className="w-full h-10 px-3.5 bg-background border border-border/70 hover:border-border focus:border-indigo-500/50 rounded-lg text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50"
                />
              </div>

              {/* 2. WhatsApp Template */}
              <div>
                <SectionLabel>WhatsApp Template</SectionLabel>
                {approvedTemplates.length > 0 ? (
                  <div className="space-y-3">
                    <select
                      value={editTemplate}
                      onChange={e => setEditTemplate(e.target.value)}
                      className="w-full h-10 px-3.5 bg-background border border-border/70 hover:border-border focus:border-indigo-500/50 rounded-lg text-[13px] text-foreground outline-none transition-colors"
                    >
                      <option value="">— Select template —</option>
                      {approvedTemplates.map(t => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>

                    {/* Template preview card */}
                    {selectedTemplate && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="rounded-xl border border-border/60 bg-background overflow-hidden"
                      >
                        {/* Performance badge */}
                        {score && (
                          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-secondary/20">
                            <span className="text-[11px] text-muted-foreground font-medium">Template performance</span>
                            <span className={`px-2 py-0.5 rounded-[5px] text-[10px] font-bold border ${scoreColors[score.level].badge}`}>
                              {scoreColors[score.level].label}
                            </span>
                          </div>
                        )}

                        {/* WhatsApp bubble preview */}
                        <div className="p-4 bg-[url('/wa-bg.png')] bg-repeat bg-[length:300px]">
                          <div className="bg-white dark:bg-zinc-800 rounded-xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%] shadow-sm">
                            <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap break-words font-normal">
                              {selectedTemplate.body || '(No body text)'}
                            </p>
                            <p className="text-right text-[10px] text-muted-foreground/60 mt-1.5">9:41 AM ✓✓</p>
                          </div>
                        </div>

                        {score?.level === 'LOW' && (
                          <div className="flex items-start gap-2 px-4 py-3 border-t border-rose-500/10 bg-rose-500/[0.03]">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-rose-600 leading-snug">
                              This template has lower open rates. Consider rewriting the opening line for better engagement.
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTemplate}
                      onChange={e => setEditTemplate(e.target.value)}
                      placeholder="e.g. welcome_offer_v2"
                      className="w-full h-10 px-3.5 bg-background border border-border/70 rounded-lg text-[13px] text-foreground outline-none focus:border-indigo-500/50 transition-colors"
                    />
                    <p className="text-[11px] text-muted-foreground">No approved templates found. Enter the template name manually.</p>
                  </div>
                )}
              </div>

              {/* 3. Target Audience */}
              <div>
                <SectionLabel>Target Audience</SectionLabel>
                <div className="space-y-2">
                  <ToggleOption
                    label="All Contacts"
                    sublabel="Everyone with a saved phone number"
                    icon={Users}
                    active={audienceType === 'all'}
                    onClick={() => { setAudienceType('all'); setRetargetParentId(null); }}
                  />
                  <ToggleOption
                    label="Retarget Audience"
                    sublabel="People who didn't read a previous campaign"
                    icon={Zap}
                    active={audienceType === 'retarget'}
                    onClick={() => {
                      setAudienceType('retarget');
                      if (completedCampaigns.length > 0 && !retargetParentId) {
                        setRetargetParentId(completedCampaigns[0].id);
                      }
                    }}
                  />
                </div>

                {/* Retarget selector */}
                {audienceType === 'retarget' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3 p-4 bg-indigo-500/[0.04] border border-indigo-500/15 rounded-xl space-y-3"
                  >
                    <SectionLabel>Source Campaign</SectionLabel>
                    {completedCampaigns.length > 0 ? (
                      <>
                        <select
                          value={retargetParentId || ''}
                          onChange={e => setRetargetParentId(e.target.value)}
                          className="w-full h-9 px-3 bg-background border border-border/70 rounded-lg text-[13px] text-foreground outline-none focus:border-indigo-500/50 transition-colors"
                        >
                          {completedCampaigns.map(c => (
                            <option key={c.id} value={c.id}>
                              {cleanName(c.name)} ({c.sent_count} sent, {c.read_count} read)
                            </option>
                          ))}
                        </select>
                        {retargetParent && (
                          <div className="flex items-center gap-2 text-[12px] text-indigo-600 font-medium">
                            <Zap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            Targeting <span className="font-bold">{retargetSize}</span> contacts who did not open
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">No completed campaigns to retarget yet.</p>
                    )}
                  </motion.div>
                )}
              </div>

              {/* 4. Schedule */}
              <div>
                <SectionLabel>When to Send</SectionLabel>
                <div className="space-y-2">
                  <ToggleOption
                    label="Send Immediately"
                    sublabel="Campaign will start sending once you click Send"
                    icon={Send}
                    active={scheduledAt === null}
                    onClick={() => setScheduledAt(null)}
                  />
                  <ToggleOption
                    label="Schedule for Later"
                    sublabel="Pick a date and time to auto-send"
                    icon={Calendar}
                    active={scheduledAt !== null}
                    onClick={() => {
                      const d = new Date(Date.now() + 3_600_000);
                      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
                      setScheduledAt(local.toISOString().slice(0, 16));
                    }}
                  />
                </div>

                {scheduledAt !== null && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3"
                  >
                    <div className="relative">
                      <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={e => setScheduledAt(e.target.value)}
                        className="w-full h-10 pl-10 pr-4 bg-background border border-border/70 hover:border-border focus:border-indigo-500/50 rounded-lg text-[13px] text-foreground outline-none transition-colors"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Campaign will be sent automatically at the scheduled time.
                    </p>
                  </motion.div>
                )}
              </div>

              {/* 5. Audience summary */}
              <div className="flex items-center gap-3 p-3.5 bg-secondary/30 rounded-xl border border-border/50">
                <div className="w-8 h-8 bg-background rounded-lg flex items-center justify-center border border-border/50">
                  <Users className="w-4 h-4 text-muted-foreground/60" />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-foreground">
                    {audienceType === 'retarget' && retargetParent
                      ? `~${retargetSize} contacts`
                      : selectedCampaign
                      ? `${selectedCampaign.audience_count.toLocaleString()} contacts`
                      : 'Calculated on save'
                    }
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {audienceType === 'retarget' ? 'Did not read previous campaign' : 'Total audience size'}
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* ── Analytics View ─────────────────────────────────────────────── */}
          {panelMode === 'analytics' && selectedCampaign && (
            <div className="p-6 space-y-6">
              {/* Status + Schedule info */}
              <div className="flex items-center gap-3 p-4 bg-secondary/30 border border-border/50 rounded-xl">
                <div>
                  {selectedCampaign.status === 'sending' ? (
                    <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-emerald-600">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      Currently sending
                    </span>
                  ) : selectedCampaign.status === 'completed' ? (
                    <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Completed
                    </span>
                  ) : selectedCampaign.status === 'scheduled' ? (
                    <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-blue-600">
                      <Clock className="w-4 h-4" /> Scheduled
                      {selectedCampaign.scheduled_at && (
                        <span className="text-[11px] font-normal text-muted-foreground">
                          for {new Date(selectedCampaign.scheduled_at).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                          })}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
                      <FileText className="w-4 h-4" /> Draft
                    </span>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Template: <span className="font-medium text-foreground/70">{selectedCampaign.template_name}</span>
                  </p>
                </div>
              </div>

              {/* Primary metrics */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Audience',  value: selectedCampaign.audience_count,  sub: 'Total recipients' },
                  { label: 'Sent',      value: selectedCampaign.sent_count,       sub: 'Messages dispatched' },
                  { label: 'Delivered', value: selectedCampaign.delivered_count,  sub: `${deliveryRate}% delivery rate` },
                  { label: 'Read',      value: selectedCampaign.read_count,       sub: `${readRate}% read rate` },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="p-4 border border-border/60 rounded-xl bg-background">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1">{label}</p>
                    <p className="text-[28px] font-semibold text-foreground leading-none tabular-nums">{(value || 0).toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Progress bars */}
              {selectedCampaign.sent_count > 0 && (
                <div className="space-y-4 p-4 border border-border/60 rounded-xl bg-background">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-foreground/80">Delivery rate</span>
                      <span className="text-[12px] font-bold text-foreground tabular-nums">{deliveryRate}%</span>
                    </div>
                    <ProgressBar
                      value={selectedCampaign.delivered_count}
                      max={selectedCampaign.sent_count}
                      color="bg-emerald-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-foreground/80">Read rate</span>
                      <span className="text-[12px] font-bold text-foreground tabular-nums">{readRate}%</span>
                    </div>
                    <ProgressBar
                      value={selectedCampaign.read_count}
                      max={selectedCampaign.sent_count}
                      color="bg-blue-500"
                    />
                  </div>
                  {selectedCampaign.failed_count > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium text-rose-600/80">Failed</span>
                        <span className="text-[12px] font-bold text-rose-600 tabular-nums">{selectedCampaign.failed_count}</span>
                      </div>
                      <ProgressBar
                        value={selectedCampaign.failed_count}
                        max={selectedCampaign.sent_count}
                        color="bg-rose-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Retarget prompt for completed campaigns */}
              {selectedCampaign.status === 'completed' && (
                <div className="p-4 bg-indigo-500/[0.04] border border-indigo-500/15 rounded-xl flex items-start gap-3">
                  <Zap className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Re-engage unread contacts</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {Math.max(0, (selectedCampaign.sent_count || 0) - (selectedCampaign.read_count || 0))} contacts didn't read this campaign. Create a retarget broadcast to follow up.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer Actions ──────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-border/60 bg-card/80 backdrop-blur-sm flex items-center justify-end gap-2.5 shrink-0">
          <button
            onClick={onClose}
            className="h-9 px-4 text-[13px] font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
          >
            {panelMode === 'analytics' ? 'Close' : 'Cancel'}
          </button>

          {(panelMode === 'edit' || panelMode === 'new') && (
            <button
              onClick={onSave}
              disabled={saving}
              className="h-9 px-5 text-[13px] font-semibold bg-foreground text-background hover:bg-foreground/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                  Saving...
                </>
              ) : scheduledAt ? 'Schedule' : 'Save Draft'}
            </button>
          )}

          {panelMode === 'edit' && isDraft && selectedCampaign && (
            <button
              onClick={() => onSend(selectedCampaign.id)}
              disabled={sending}
              className="h-9 px-5 text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {sending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> Send Now
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
