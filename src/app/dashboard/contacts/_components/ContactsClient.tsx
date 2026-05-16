"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Filter, Plus, Users, Zap, BrainCircuit, Activity, 
  MessageSquare, UserCircle2, ArrowLeft, ArrowRight, MoreHorizontal, 
  Sparkles, CheckCircle2, AlertCircle, Phone, Mail, MapPin, Tag,
  Clock, Share, Download, Network, UploadCloud, FileSpreadsheet,
  Database, Workflow, X, CheckSquare, Square, DownloadCloud,
  ChevronRight, RefreshCcw, LayoutGrid
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { SkeletonRow } from '@/components/ui/skeleton';

// --- TYPES ---

type ContactState = 'AI Active' | 'Awaiting Reply' | 'Human Assigned' | 'Escalated' | 'Converted' | 'Cold' | 'High Intent';

interface Contact {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  email: string;
  location: string;
  latestMessage: string;
  sentiment: 'Positive' | 'Neutral' | 'Negative' | 'Urgent';
  qualificationScore: number;
  lastActive: string;
  tags: string[];
  activeFlow: string | null;
  state: ContactState;
  aiSummary: string;
}

interface TimelineEvent {
  type: string;
  sender?: string;
  time: string;
  content: string;
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

// --- HELPERS ---
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function leadToContact(lead: Record<string, unknown>): Contact {
  const name = (lead.name as string) || (lead.phone as string) || 'Unknown';
  const parts = name.trim().split(' ');
  const avatar = parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  const status = (lead.lead_status as string) || 'new';
  const stateMap: Record<string, ContactState> = {
    new: 'Awaiting Reply', hot: 'High Intent', warm: 'AI Active',
    cold: 'Cold', converted: 'Converted', lost: 'Cold',
  };
  return {
    id: lead.id as string,
    name,
    avatar,
    phone: (lead.phone as string) || '—',
    email: (lead.email as string) || '—',
    location: '—',
    latestMessage: (lead.notes as string) || 'No messages yet.',
    sentiment: (lead.lead_score as number) >= 80 ? 'Positive' : (lead.lead_score as number) <= 30 ? 'Urgent' : 'Neutral',
    qualificationScore: (lead.lead_score as number) || 0,
    lastActive: timeAgo((lead.last_message_at as string) || (lead.created_at as string)),
    tags: [],
    activeFlow: null,
    state: stateMap[status] || 'Awaiting Reply',
    aiSummary: (lead.notes as string) || 'No AI summary available yet for this contact.',
  };
}

const FILTER_DEFS = [
  { id: 'all', label: 'All Contacts', icon: Users, status: null },
  { id: 'active', label: 'Active Conversations', icon: Activity, status: 'warm' },
  { id: 'high-intent', label: 'High Intent', icon: Sparkles, status: 'hot' },
  { id: 'qualified', label: 'Qualified Leads', icon: CheckCircle2, status: 'converted' },
  { id: 'escalated', label: 'Human Escalated', icon: AlertCircle, status: 'cold' },
];

type ImportStep = 'hidden' | 'source' | 'mapping' | 'duplicates' | 'progress';

export function ContactsClient() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [importStep, setImportStep] = useState<ImportStep>('hidden');

  // --- REAL DATA STATE ---
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});
  const [profileTimeline, setProfileTimeline] = useState<TimelineEvent[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabaseRef = useRef(createBrowserSupabaseClient());

  const fetchContacts = useCallback(async (search = '') => {
    setLoading(true);
    const supabase = supabaseRef.current;
    let query = supabase
      .from('leads')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50);

    if (activeFilter === 'active') query = query.eq('lead_status', 'warm');
    else if (activeFilter === 'high-intent') query = query.eq('lead_status', 'hot');
    else if (activeFilter === 'qualified') query = query.eq('lead_status', 'converted');
    else if (activeFilter === 'escalated') query = query.eq('lead_status', 'cold');

    if (search.trim()) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data } = await query;
    setContacts((data || []).map(leadToContact));
    setLoading(false);
  }, [activeFilter]);

  const fetchFilterCounts = useCallback(async () => {
    const supabase = supabaseRef.current;
    const [all, warm, hot, converted, cold] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('lead_status', 'warm'),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('lead_status', 'hot'),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('lead_status', 'converted'),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('lead_status', 'cold'),
    ]);
    setFilterCounts({
      all: all.count || 0,
      active: warm.count || 0,
      'high-intent': hot.count || 0,
      qualified: converted.count || 0,
      escalated: cold.count || 0,
    });
  }, []);

  // Load real contact profile timeline from messages
  const loadProfileTimeline = useCallback(async (contactId: string) => {
    setProfileLoading(true);
    const supabase = supabaseRef.current;
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('lead_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!conv) { setProfileTimeline([]); setProfileLoading(false); return; }

    const { data: msgs } = await supabase
      .from('messages')
      .select('content, direction, ai_generated, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(20);

    const events: TimelineEvent[] = (msgs || []).map(m => ({
      type: 'message',
      sender: m.direction === 'inbound' ? 'user' : (m.ai_generated ? 'ai' : 'human'),
      time: new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      content: m.content,
    }));
    setProfileTimeline(events);
    setProfileLoading(false);
  }, []);

  useEffect(() => { fetchContacts(); fetchFilterCounts(); }, [fetchContacts, fetchFilterCounts]);

  useEffect(() => {
    if (selectedContactId) loadProfileTimeline(selectedContactId);
  }, [selectedContactId, loadProfileTimeline]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => fetchContacts(val), 300);
  };

  const selectedContact = contacts.find(c => c.id === selectedContactId);

  const filters = FILTER_DEFS.map(f => ({ ...f, count: filterCounts[f.id] || 0 }));

  const toggleContactSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedContactIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedContactIds(newSet);
  };

  const selectAll = () => {
    if (selectedContactIds.size === contacts.length) setSelectedContactIds(new Set());
    else setSelectedContactIds(new Set(contacts.map(c => c.id)));
  };

  const closeImportModal = () => setImportStep('hidden');

  // --- IMPORT MODAL RENDERER ---
  const renderImportModal = () => {
    if (importStep === 'hidden') return null;

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeImportModal}
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-3xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/50 backdrop-blur-md shrink-0">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Import Contacts</h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Automatically sync contacts and conversations.</p>
            </div>
            <button onClick={closeImportModal} className="p-2 text-muted-foreground hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 md:p-8 overflow-y-auto flex-1 custom-scrollbar">
            {importStep === 'source' && (
              <div className="space-y-6">
                <h3 className="text-sm font-semibold text-foreground">Choose Import Source</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { name: 'CSV Upload', icon: FileSpreadsheet, desc: 'Map columns to fields' },
                    { name: 'HubSpot', icon: Database, desc: 'Two-way sync' },
                    { name: 'Salesforce', icon: Database, desc: 'Two-way sync' },
                    { name: 'Google Contacts', icon: Users, desc: 'One-time import' },
                    { name: 'WhatsApp Sync', icon: MessageSquare, desc: 'Auto-create from chat' },
                    { name: 'Zapier', icon: Workflow, desc: 'Trigger via API' },
                  ].map(source => (
                    <button 
                      key={source.name}
                      onClick={() => setImportStep('mapping')}
                      className="flex flex-col items-center text-center p-5 rounded-xl border border-border bg-background hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 transition-all group"
                    >
                      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        <source.icon className="w-5 h-5" />
                      </div>
                      <span className="text-[14px] font-semibold text-foreground">{source.name}</span>
                      <span className="text-[12px] text-muted-foreground mt-1">{source.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {importStep === 'mapping' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Map Fields</h3>
                  <span className="text-[12px] font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded">AI Suggested</span>
                </div>
                
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-2 text-[11px] uppercase tracking-widest font-bold text-muted-foreground bg-secondary/50 p-3 border-b border-border">
                    <div>CSV Column</div>
                    <div>Aries Field</div>
                  </div>
                  {[
                    { from: 'phone_number', to: 'Phone Number' },
                    { from: 'full_name', to: 'Name' },
                    { from: 'email_address', to: 'Email' },
                    { from: 'lead_stage', to: 'Status (Tag)' },
                  ].map((field, i) => (
                    <div key={i} className="grid grid-cols-2 items-center p-3 border-b border-border last:border-0 bg-background hover:bg-secondary/20 transition-colors">
                      <div className="text-[13px] font-medium text-foreground">{field.from}</div>
                      <div className="flex items-center gap-2 pr-2">
                        <ArrowLeft className="w-3 h-3 text-muted-foreground opacity-50 rotate-180 shrink-0" />
                        <select className="w-full text-[13px] bg-secondary border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                          <option>{field.to}</option>
                          <option>Ignore</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importStep === 'duplicates' && (
              <div className="space-y-6">
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[14px] font-semibold text-amber-900 dark:text-amber-200">Duplicates Detected</h4>
                    <p className="text-[13px] text-amber-800/80 dark:text-amber-200/80 mt-1">
                      We found 45 contacts with matching phone numbers in your database. How would you like to handle them?
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 border border-indigo-500 rounded-xl bg-indigo-50/50 dark:bg-indigo-500/10 cursor-pointer">
                    <input type="radio" name="dup" defaultChecked className="w-4 h-4 text-indigo-600 border-indigo-300 focus:ring-indigo-500" />
                    <div>
                      <div className="text-[14px] font-medium text-indigo-900 dark:text-indigo-100">Merge with existing</div>
                      <div className="text-[12px] text-indigo-600/80 dark:text-indigo-400/80">Update empty fields without overwriting existing data.</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-4 border border-border rounded-xl bg-background hover:bg-secondary/50 cursor-pointer transition-colors">
                    <input type="radio" name="dup" className="w-4 h-4 text-indigo-600 border-border focus:ring-indigo-500" />
                    <div>
                      <div className="text-[14px] font-medium text-foreground">Skip duplicates</div>
                      <div className="text-[12px] text-muted-foreground">Only import completely new contacts.</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {importStep === 'progress' && (
              <div className="space-y-6 py-6 text-center flex flex-col items-center">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin mb-4"></div>
                <h3 className="text-lg font-semibold text-foreground">Importing Contacts...</h3>
                
                <div className="w-full max-w-sm mt-6 text-left space-y-3 bg-secondary/30 p-4 rounded-xl border border-border">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-foreground/80">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Synced Sarah Jenkins
                  </div>
                  <div className="flex items-center gap-2 text-[13px] font-medium text-foreground/80">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Merged 12 duplicates
                  </div>
                  <div className="flex items-center gap-2 text-[13px] font-medium text-foreground/80">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Tagged 'Enterprise' contacts
                  </div>
                  <div className="flex items-center gap-2 text-[13px] font-medium text-foreground/80 animate-pulse">
                    <RefreshCcw className="w-4 h-4 text-indigo-500 animate-spin" /> Enriching AI profiles...
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-5 border-t border-border bg-background/50 backdrop-blur-md flex justify-between items-center shrink-0">
            {importStep === 'progress' ? (
              <div className="text-[13px] font-medium text-muted-foreground">This might take a minute...</div>
            ) : (
              <button onClick={closeImportModal} className="text-[13px] font-medium text-muted-foreground hover:text-foreground">Cancel</button>
            )}
            
            <div className="flex gap-3">
              {importStep === 'mapping' && (
                <button onClick={() => setImportStep('source')} className="h-9 px-4 text-[13px] font-medium text-foreground bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">
                  Back
                </button>
              )}
              {importStep === 'duplicates' && (
                <button onClick={() => setImportStep('mapping')} className="h-9 px-4 text-[13px] font-medium text-foreground bg-secondary hover:bg-secondary/80 rounded-lg transition-colors">
                  Back
                </button>
              )}
              
              {importStep === 'mapping' && (
                <button onClick={() => setImportStep('duplicates')} className="h-9 px-6 text-[13px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg shadow-sm transition-colors">
                  Next Step
                </button>
              )}
              {importStep === 'duplicates' && (
                <button onClick={() => setImportStep('progress')} className="h-9 px-6 text-[13px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg shadow-sm transition-colors">
                  Start Import
                </button>
              )}
              {importStep === 'progress' && (
                <button onClick={closeImportModal} className="h-9 px-6 text-[13px] font-medium text-primary-foreground bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors">
                  Done
                </button>
              )}
            </div>
          </div>

        </motion.div>
      </div>
    );
  };

  // --- STREAM VIEW (LIST) ---
  const renderStreamView = () => (
    <div className="flex flex-col md:flex-row h-full w-full bg-background relative z-10 text-foreground overflow-hidden">
      
      {/* Subtle background ambient glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/[0.02] rounded-full blur-[100px] pointer-events-none"></div>

      {/* Left Panel - Smart Filters */}
      <div className="w-64 border-r border-border/60 p-5 hidden md:flex flex-col gap-6 bg-card/30 z-10 shrink-0">
        <div className="space-y-4">
          <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase px-2">Smart Filters</h2>
          <div className="space-y-0.5">
            {filters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-lg transition-all duration-200 ${
                  activeFilter === filter.id 
                    ? 'bg-foreground/5 text-foreground font-semibold shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <filter.icon className={`w-4 h-4 ${activeFilter === filter.id ? 'text-foreground/80' : 'text-muted-foreground/60'}`} />
                  {filter.label}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  activeFilter === filter.id ? 'bg-background shadow-sm text-foreground/80' : 'bg-transparent text-muted-foreground'
                }`}>
                  {filter.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Segment Card */}
        <div className="mt-auto space-y-4">
          <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/10 transition-colors hover:bg-indigo-50/80 dark:hover:bg-indigo-500/10">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-2">
              <BrainCircuit className="w-4 h-4" />
              <span className="text-xs font-semibold tracking-tight">Dynamic Segment</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              AI detected 12 new leads asking about <span className="font-medium text-foreground">pricing</span> in the last hour.
            </p>
            <button className="mt-3 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
              Review Segment →
            </button>
          </div>
        </div>
      </div>

      {/* Center Area - Contact Stream */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent relative z-10">
        
        {/* Global AI Search Header */}
        <header className="h-[72px] border-b border-border/60 flex items-center justify-between px-6 shrink-0 bg-background/80 backdrop-blur-md z-20">
          <div className="flex-1 max-w-2xl relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground/60 group-focus-within:text-indigo-500/70 transition-colors" />
            </div>
            <input 
              type="text" 
              placeholder="Search contacts by name, phone, or email..." 
              className="w-full h-10 pl-10 pr-4 bg-card border border-border/80 hover:border-border focus:border-indigo-500/30 focus:ring-4 focus:ring-indigo-500/10 rounded-lg text-[13px] placeholder:text-muted-foreground/50 transition-all outline-none shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
              value={searchQuery}
              onChange={handleSearch}
            />
            {searchQuery && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> AI Searching
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pl-6">
            <button 
              onClick={() => setImportStep('source')}
              className="h-9 px-4 text-[13px] font-medium bg-card text-foreground hover:bg-secondary border border-border/80 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
            >
              <DownloadCloud className="w-4 h-4 text-muted-foreground" /> Import
            </button>
            <button className="h-9 px-4 text-[13px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.1)] transition-colors flex items-center">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Contact
            </button>
          </div>
        </header>

        {/* Contact Stream Wrapper */}
        <div className="flex-1 overflow-auto p-6 lg:p-8 z-10 custom-scrollbar relative">
          
          {/* Floating Bulk Actions Bar */}
          <AnimatePresence>
            {selectedContactIds.size > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-10 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-4 text-[13px] font-medium"
              >
                <div className="flex items-center gap-2 border-r border-background/20 pr-4">
                  <span className="bg-background/20 text-background px-2 py-0.5 rounded-full">{selectedContactIds.size}</span>
                  selected
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-3 py-1.5 hover:bg-background/20 rounded-lg transition-colors flex items-center gap-1.5"><Tag className="w-4 h-4"/> Add Tag</button>
                  <button className="px-3 py-1.5 hover:bg-background/20 rounded-lg transition-colors flex items-center gap-1.5"><Zap className="w-4 h-4"/> Start Flow</button>
                  <button className="px-3 py-1.5 hover:bg-background/20 rounded-lg transition-colors flex items-center gap-1.5"><UserCircle2 className="w-4 h-4"/> Assign</button>
                </div>
                <button onClick={() => setSelectedContactIds(new Set())} className="ml-2 p-1 hover:bg-background/20 rounded-full transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="max-w-[1200px] mx-auto pb-20">
            
            {/* Elevated Content Container for Rows */}
            <div className="bg-card border border-border/60 rounded-2xl shadow-[0_4px_24px_-8px_rgba(0,0,0,0.04)] overflow-visible">
                           {/* Header Row for Select All */}
               <div className="flex items-center p-4 border-b border-border/60 bg-secondary/30 rounded-t-2xl">
                 <button onClick={selectAll} className="text-muted-foreground hover:text-foreground transition-colors mr-3 ml-2">
                   {selectedContactIds.size === contacts.length && contacts.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                 </button>
                 <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex-1 pl-4">Contact</div>
                 <div className="hidden lg:block text-[11px] font-bold uppercase tracking-widest text-muted-foreground w-48 text-right pr-4">Attributes</div>
                 <div className="hidden sm:block text-[11px] font-bold uppercase tracking-widest text-muted-foreground w-12 text-center">Score</div>
                 <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground w-28 text-right">Status</div>
              </div>

              {loading ? (
                <div className="divide-y divide-border/40">
                  {[...Array(5)].map((_, i) => <SkeletonRow key={i} className="px-6" />)}
                </div>
              ) : contacts.length === 0 ? (
                <div className="py-16 text-center">
                  <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? `No contacts matching "${searchQuery}"` : 'No contacts yet. Contacts are created automatically from WhatsApp conversations.'}
                  </p>
                </div>
              ) : null}

              {!loading && contacts.map((contact, i) => (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  onClick={() => setSelectedContactId(contact.id)}
                  className={`group relative flex items-center p-4 cursor-pointer transition-all duration-200 border-b border-border/40 last:border-b-0 hover:bg-secondary/40 hover:shadow-sm z-10 hover:z-20 ${selectedContactIds.has(contact.id) ? 'bg-indigo-50/30 dark:bg-indigo-500/5' : ''}`}
                >
                  <button 
                    onClick={(e) => toggleContactSelection(contact.id, e)}
                    className={`mr-3 ml-2 transition-colors shrink-0 ${selectedContactIds.has(contact.id) ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground/40 group-hover:text-muted-foreground'}`}
                  >
                    {selectedContactIds.has(contact.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>

                  {/* Status Indicator Bar (Very subtle) */}
                  <div className="w-1 h-10 rounded-full mr-3 shrink-0 opacity-80 hidden sm:block" style={{
                    backgroundColor: 
                      contact.state === 'AI Active' ? '#10B981' : 
                      contact.state === 'Escalated' ? '#EF4444' : 
                      'transparent'
                  }}></div>

                  <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-[13px] font-semibold text-foreground border border-border">
                        {contact.avatar}
                      </div>
                      {contact.state === 'AI Active' && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-[1.5px] border-card"></span>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-[14px] font-semibold text-foreground/90 truncate">{contact.name}</h3>
                        <div className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold shrink-0 ${
                          contact.sentiment === 'Positive' ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/10' :
                          contact.sentiment === 'Urgent' ? 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-500/10' :
                          'text-muted-foreground bg-secondary'
                        }`}>
                          {contact.sentiment}
                        </div>
                      </div>
                      <p className="text-[13px] text-muted-foreground truncate max-w-[500px]">
                        <span className="font-medium text-foreground/60 mr-2 shrink-0">{contact.lastActive}</span>
                        {contact.latestMessage}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 pl-4 shrink-0 transition-opacity group-hover:opacity-0 md:group-hover:opacity-100">
                    {/* Tags & Flow */}
                    <div className="hidden lg:flex flex-col items-end gap-1.5 w-48">
                      <div className="flex items-center gap-1.5 justify-end w-full truncate">
                        {contact.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border/50 truncate max-w-[80px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium justify-end w-full truncate">
                        {contact.activeFlow ? (
                           <><Network className="w-3 h-3 text-indigo-500/70 dark:text-indigo-400/70 shrink-0" /> <span className="truncate">{contact.activeFlow}</span></>
                        ) : (
                           <><UserCircle2 className="w-3 h-3 opacity-50 shrink-0" /> No Active Flow</>
                        )}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="hidden sm:flex flex-col items-center justify-center w-12">
                      <div className="text-[14px] font-semibold text-foreground/90">{contact.qualificationScore}</div>
                    </div>

                    {/* State Pill */}
                    <div className="w-28 flex justify-end shrink-0">
                      <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                        contact.state === 'AI Active' ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20' :
                        contact.state === 'Escalated' ? 'text-red-700 bg-red-50 border border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20' :
                        contact.state === 'Awaiting Reply' ? 'text-blue-700 bg-blue-50 border border-blue-200 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/20' :
                        'text-muted-foreground bg-secondary border border-border/50'
                      }`}>
                        {contact.state === 'AI Active' && <Zap className="w-3 h-3 shrink-0" />}
                        {contact.state}
                      </div>
                    </div>
                  </div>

                  {/* Hover Actions Bar (Absolute inside row) */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0 hidden md:flex items-center gap-1 bg-background/95 backdrop-blur-md px-2 py-1.5 rounded-lg shadow-sm border border-border">
                    <button className="px-3 py-1.5 text-[12px] font-medium text-foreground bg-secondary hover:bg-secondary/80 rounded-md transition-colors flex items-center gap-1.5">
                      <LayoutGrid className="w-3.5 h-3.5" /> View Profile
                    </button>
                    <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors" title="Message">
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors" title="More">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                </motion.div>
              ))}
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );

  // --- PROFILE VIEW (OVERLAY) ---
  const renderProfileView = () => {
    if (!selectedContact) return null;

    return (
      <motion.div 
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute inset-0 bg-background z-50 flex flex-col md:flex-row overflow-hidden shadow-2xl"
      >
        {/* Left Column - Identity */}
        <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-border/60 bg-card/40 flex flex-col p-6 overflow-y-auto custom-scrollbar shrink-0">
          <button 
            onClick={() => setSelectedContactId(null)}
            className="flex items-center text-[13px] font-medium text-muted-foreground hover:text-foreground mb-8 transition-colors w-fit bg-secondary/50 hover:bg-secondary px-3 py-1.5 rounded-lg border border-border/50"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to List
          </button>

          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center text-2xl font-bold border border-border mb-4 relative shadow-sm">
              {selectedContact.avatar}
              {selectedContact.state === 'AI Active' && (
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-card shadow-sm"></span>
              )}
            </div>
            <h2 className="text-[18px] font-bold text-foreground tracking-tight">{selectedContact.name}</h2>
            <div className="text-[13px] text-muted-foreground mt-0.5 font-medium">{selectedContact.location}</div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Contact Info</div>
              <div className="flex items-center gap-3 text-[13px] font-medium text-foreground bg-card shadow-sm p-2.5 rounded-lg border border-border/60 hover:border-indigo-500/30 transition-colors cursor-pointer group">
                <Phone className="w-4 h-4 text-muted-foreground/70 group-hover:text-indigo-500 transition-colors" />
                {selectedContact.phone}
              </div>
              <div className="flex items-center gap-3 text-[13px] font-medium text-foreground bg-card shadow-sm p-2.5 rounded-lg border border-border/60 hover:border-indigo-500/30 transition-colors cursor-pointer group">
                <Mail className="w-4 h-4 text-muted-foreground/70 group-hover:text-indigo-500 transition-colors" />
                {selectedContact.email}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase flex items-center justify-between">
                <span>AI Summary</span>
                <Sparkles className="w-3.5 h-3.5 text-indigo-500/70 dark:text-indigo-400" />
              </div>
              <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/10 text-[13px] leading-relaxed text-indigo-900/80 dark:text-indigo-100/80 font-medium">
                {selectedContact.aiSummary}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Tags</div>
              <div className="flex flex-wrap gap-2">
                {selectedContact.tags.map(tag => (
                  <span key={tag} className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-secondary text-foreground border border-border/60">
                    {tag}
                  </span>
                ))}
                <button className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors">
                  + Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Center Column - Conversation Timeline */}
        <div className="flex-1 flex flex-col bg-background relative min-w-0">
          <header className="h-[72px] border-b border-border/60 flex items-center justify-between px-6 shrink-0 bg-background/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${selectedContact.state === 'AI Active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-muted-foreground'}`}></div>
              <span className="text-[14px] font-semibold text-foreground hidden sm:block">{selectedContact.state}</span>
              <span className="text-muted-foreground/30 text-sm px-2 hidden sm:block">|</span>
              <span className="text-[13px] text-muted-foreground font-medium flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> Last active {selectedContact.lastActive}</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="hidden sm:flex h-9 px-4 text-[13px] font-medium bg-card text-foreground hover:bg-secondary border border-border/80 rounded-lg transition-colors shadow-sm items-center gap-1.5">
                 <Share className="w-3.5 h-3.5" /> Share
              </button>
              <button className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors border border-transparent hover:border-border/50">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6 custom-scrollbar relative bg-[#FAFAFA] dark:bg-[#0A0A0A]">
            {profileLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-border border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : profileTimeline.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-muted-foreground">No conversation history found for this contact.</p>
              </div>
            ) : null}
            {!profileLoading && profileTimeline.map((evt, idx) => (
              <div key={idx} className="flex flex-col">
                {evt.type === 'ai-insight' ? (
                  <div className="flex items-center justify-center my-4">
                    <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-card border border-border shadow-sm text-[12px] hover:shadow-md transition-shadow cursor-default">
                      {evt.icon && <evt.icon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />}
                      <span className="font-semibold text-foreground/90 hidden sm:inline">{evt.title}:</span>
                      <span className="text-muted-foreground font-medium truncate max-w-[150px] sm:max-w-none">{evt.content}</span>
                      <span className="text-[10px] text-muted-foreground/50 ml-2 font-medium">{evt.time}</span>
                    </div>
                  </div>
                ) : (
                  <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${evt.sender === 'user' ? 'self-start' : 'self-end'}`}>
                    <div className="text-[10px] font-semibold text-muted-foreground/70 mb-1.5 ml-1">
                      {evt.sender === 'user' ? selectedContact.name : 'Aries AI'} • {evt.time}
                    </div>
                    <div className={`px-4 py-3 text-[14px] font-medium leading-relaxed shadow-sm ${
                      evt.sender === 'user' 
                        ? 'bg-card border border-border/80 text-foreground rounded-2xl rounded-tl-sm' 
                        : 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-900 dark:text-indigo-50 rounded-2xl rounded-tr-sm'
                    }`}>
                      {evt.content}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="p-4 sm:p-5 bg-card border-t border-border/60 shrink-0 shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
            <div className="relative flex items-center">
              <input 
                type="text" 
                placeholder="Take over conversation..." 
                className="w-full bg-background border border-border/80 rounded-xl py-3 pl-4 pr-12 text-[14px] focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm"
              />
              <button className="absolute right-1.5 p-2 bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity shadow-sm">
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-5 mt-4 px-2">
              <button className="text-[12px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
                <Network className="w-3.5 h-3.5" /> Attach Flow
              </button>
              <button className="text-[12px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
                <AlertCircle className="w-3.5 h-3.5" /> Escalate to Human
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Live Intelligence */}
        <div className="hidden xl:flex w-[300px] border-l border-border/60 bg-card/40 flex-col p-6 overflow-y-auto custom-scrollbar relative z-10 shrink-0">
          <div className="flex items-center gap-2 mb-8">
            <Activity className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            <h3 className="text-[13px] font-bold tracking-wide text-foreground">Live Intelligence</h3>
            <span className="relative flex h-2 w-2 ml-auto">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
          </div>

          <div className="space-y-6">
            {/* Telemetry Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-card border border-border/60 rounded-xl shadow-sm">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Score</div>
                <div className="text-2xl font-bold text-foreground">{selectedContact.qualificationScore}</div>
              </div>
              <div className="p-3 bg-card border border-border/60 rounded-xl shadow-sm">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Intent</div>
                <div className="text-[14px] font-bold text-foreground mt-1 text-emerald-600 dark:text-emerald-400">High</div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Active AI Flow</div>
              <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-xl flex items-center justify-between cursor-pointer group hover:bg-indigo-100 hover:border-indigo-200 dark:hover:bg-indigo-500/20 transition-colors">
                <div className="flex items-center gap-3">
                  <Network className="w-4 h-4 text-indigo-500 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[13px] font-semibold text-indigo-900 dark:text-indigo-100 truncate w-32">{selectedContact.activeFlow || 'None'}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-indigo-500/50" />
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Conversation Health</div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl flex items-center justify-between">
                <span className="text-[13px] font-semibold text-emerald-900 dark:text-emerald-100">Strong</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>

            <div className="space-y-3 pt-5 border-t border-border/60">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5" /> Persistent Memory
              </div>
              <div className="space-y-2">
                <div className="text-[12px] bg-card border border-border/60 p-2.5 rounded-lg text-muted-foreground font-medium shadow-sm">
                  <span className="text-foreground font-semibold">Budget:</span> Enterprise tier ($2k+/mo)
                </div>
                <div className="text-[12px] bg-card border border-border/60 p-2.5 rounded-lg text-muted-foreground font-medium shadow-sm">
                  <span className="text-foreground font-semibold">Tech Stack:</span> Stripe, Next.js
                </div>
                <div className="text-[12px] bg-card border border-border/60 p-2.5 rounded-lg text-muted-foreground font-medium shadow-sm">
                  <span className="text-foreground font-semibold">Primary Goal:</span> Support automation
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="h-full w-full relative overflow-hidden bg-background">
      <AnimatePresence mode="wait">
        {!selectedContactId ? (
          <motion.div 
            key="stream"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex"
          >
            {renderStreamView()}
          </motion.div>
        ) : (
          <motion.div
            key="profile"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40"
          >
            {renderProfileView()}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {importStep !== 'hidden' && renderImportModal()}
      </AnimatePresence>
    </div>
  );
}
