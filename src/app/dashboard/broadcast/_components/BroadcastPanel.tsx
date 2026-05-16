import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, X, BarChart3, Edit3 } from 'lucide-react';

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
}

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
  setEditTemplate
}: BroadcastPanelProps) {
  if (!panelMode) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
      />
      
      <motion.div
        initial={{ x: '100%', opacity: 0.5 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0.5 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 right-0 w-full md:w-[600px] bg-card border-l border-border shadow-2xl z-50 flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-background/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-secondary`}>
              {panelMode === 'analytics' ? <BarChart3 className="w-5 h-5" /> : <Edit3 className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-[16px] font-semibold tracking-tight">
                {panelMode === 'new' ? 'New Campaign' : panelMode === 'edit' ? 'Edit Campaign' : 'Analytics'}
              </h2>
              <p className="text-[12px] text-muted-foreground">{selectedCampaign?.name || 'Create a new broadcast'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          {(panelMode === 'edit' || panelMode === 'new') ? (
            <div className="space-y-8">
              <div className="space-y-4">
                <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Campaign Name</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="e.g. Summer Promo Blast"
                  className="w-full h-10 px-4 bg-background border border-border rounded-lg text-[14px] focus:border-indigo-500 outline-none" 
                />
              </div>
              
              <div className="space-y-4">
                <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Gupshup Template Name</label>
                <input 
                  type="text" 
                  value={editTemplate}
                  onChange={e => setEditTemplate(e.target.value)}
                  placeholder="e.g. welcome_offer_01"
                  className="w-full h-10 px-4 bg-background border border-border rounded-lg text-[14px] focus:border-indigo-500 outline-none" 
                />
                <p className="text-xs text-muted-foreground mt-1">Must exactly match the approved template name in your Gupshup Dashboard.</p>
              </div>

              <div className="space-y-4">
                <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Audience</label>
                <div className="p-4 border border-border rounded-xl bg-background flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className="p-2 bg-secondary rounded-lg"><Users className="w-4 h-4" /></div>
                     <div>
                       <div className="text-[14px] font-medium">All Contacts</div>
                       <div className="text-[12px] text-muted-foreground">
                         {panelMode === 'new' ? 'Will calculate on save' : `${selectedCampaign?.audience_count} Contacts`}
                       </div>
                     </div>
                   </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 border border-border rounded-xl bg-background">
                   <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Sent</div>
                   <div className="text-[32px] font-semibold text-foreground">{selectedCampaign?.sent_count}</div>
                   <div className="text-[12px] text-muted-foreground font-medium mt-1">out of {selectedCampaign?.audience_count}</div>
                </div>
                <div className="p-5 border border-red-500/20 rounded-xl bg-red-50/30">
                   <div className="text-[11px] font-bold uppercase tracking-widest text-red-600/80 mb-1">Failed</div>
                   <div className="text-[32px] font-semibold text-red-600">{selectedCampaign?.failed_count}</div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-6 border-t border-border bg-background/50 backdrop-blur-md flex justify-end gap-3 shrink-0">
           <button onClick={onClose} className="h-10 px-4 text-[13px] font-medium bg-secondary hover:bg-secondary/80 rounded-lg">
             {panelMode === 'analytics' ? 'Close' : 'Cancel'}
           </button>
           {(panelMode === 'edit' || panelMode === 'new') && (
             <button 
              onClick={onSave}
              disabled={saving}
              className="h-10 px-6 text-[13px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg disabled:opacity-50"
             >
               {saving ? 'Saving...' : 'Save Campaign'}
             </button>
           )}
           {panelMode === 'edit' && selectedCampaign?.status === 'draft' && (
             <button 
              onClick={() => onSend(selectedCampaign.id)}
              disabled={sending}
              className="h-10 px-6 text-[13px] font-medium text-emerald-foreground bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
             >
               {sending ? 'Sending...' : 'Send Now'}
             </button>
           )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
