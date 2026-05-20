"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Sparkles, Upload, Play, Clock, FileText, Activity, Users, Zap, Search, Filter, MoreHorizontal, Network, X, ChevronRight, BarChart3, Copy, PauseCircle, Download, Trash2, Edit3, Send } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import { BroadcastPanel } from './BroadcastPanel';

// Types matching Supabase Schema
type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed';

interface Campaign {
  id: string;
  name: string;
  template_name: string;
  status: CampaignStatus;
  audience_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  scheduled_at: string | null;
  created_at: string;
}

const filters = [
  { id: 'all', label: 'All Campaigns', icon: Network },
  { id: 'sending', label: 'Sending', icon: Play },
  { id: 'scheduled', label: 'Scheduled', icon: Clock },
  { id: 'draft', label: 'Drafts', icon: FileText },
  { id: 'completed', label: 'Completed', icon: Activity },
];

export function BroadcastClient() {
  const supabase = createBrowserSupabaseClient();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Interactive State
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [panelMode, setPanelMode] = useState<'edit' | 'analytics' | 'new' | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [editName, setEditName] = useState('');
  const [editTemplate, setEditTemplate] = useState('');

  // Retargeting & Scheduler State
  const [audienceType, setAudienceType] = useState<'all' | 'retarget'>('all');
  const [retargetParentId, setRetargetParentId] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);

  // Approved templates for the picker
  const [approvedTemplates, setApprovedTemplates] = useState<{ name: string; body: string }[]>([]);

  const fetchCampaigns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('broadcast_campaigns')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching campaigns:', error);
      toast.error('Failed to load campaigns');
    } else {
      setCampaigns(data as Campaign[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCampaigns();
    // Fetch approved templates for the picker
    fetch('/api/dashboard/templates')
      .then(r => r.json())
      .then(j => {
        if (j.success && Array.isArray(j.data)) {
          const approved = j.data
            .filter((t: { status: string; name: string; components?: { type: string; text?: string }[] }) => t.status === 'APPROVED')
            .map((t: { name: string; components?: { type: string; text?: string }[] }) => ({
              name: t.name,
              body: t.components?.find((c) => c.type === 'BODY')?.text || '',
            }));
          setApprovedTemplates(approved);
        }
      })
      .catch(() => {});
    // Close dropdown when clicking outside
    const handleClick = () => setActiveDropdown(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const filteredCampaigns = campaigns.filter(c => {
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (activeFilter === 'all') return true;
    return c.status === activeFilter;
  });

  const openPanel = (campaign: Campaign | null, mode: 'edit' | 'analytics' | 'new', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedCampaign(campaign);
    setPanelMode(mode);
    setActiveDropdown(null);
    
    if (campaign) {
      // Parse retargeting name prefix
      const nameVal = campaign.name;
      if (nameVal.startsWith('__retarget:')) {
        const endIdx = nameVal.indexOf('__:');
        if (endIdx !== -1) {
          const parentId = nameVal.slice(11, endIdx);
          const cleanName = nameVal.slice(endIdx + 3);
          setEditName(cleanName);
          setAudienceType('retarget');
          setRetargetParentId(parentId);
        } else {
          setEditName(nameVal);
          setAudienceType('all');
          setRetargetParentId(null);
        }
      } else {
        setEditName(nameVal);
        setAudienceType('all');
        setRetargetParentId(null);
      }
      setEditTemplate(campaign.template_name);

      // Parse scheduling
      if (campaign.scheduled_at) {
        const date = new Date(campaign.scheduled_at);
        const offset = date.getTimezoneOffset();
        const local = new Date(date.getTime() - offset * 60_000);
        setScheduledAt(local.toISOString().slice(0, 16));
      } else {
        setScheduledAt(null);
      }
    } else {
      setEditName('');
      setEditTemplate('');
      setAudienceType('all');
      setRetargetParentId(null);
      setScheduledAt(null);
    }
  };

  const handleRetargetAction = (parentCampaign: Campaign) => {
    let cleanParentName = parentCampaign.name;
    if (cleanParentName.startsWith('__retarget:')) {
      const endIdx = cleanParentName.indexOf('__:');
      if (endIdx !== -1) {
        cleanParentName = cleanParentName.slice(endIdx + 3);
      }
    }
    
    setSelectedCampaign(null);
    setPanelMode('new');
    setEditName(`Retarget: ${cleanParentName}`);
    setEditTemplate(parentCampaign.template_name);
    setAudienceType('retarget');
    setRetargetParentId(parentCampaign.id);
    setScheduledAt(null);
    setActiveDropdown(null);
  };

  const closePanel = () => {
    setSelectedCampaign(null);
    setPanelMode(null);
  };

  const toggleDropdown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveDropdown(activeDropdown === id ? null : id);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    
    setSaving(true);
    
    try {
      if (panelMode === 'new') {
        const { data: tenantData } = await supabase.from('tenants').select('id').single();
        if (!tenantData) throw new Error('No tenant found');
        
        let finalName = editName;
        let finalAudienceCount = 0;

        if (audienceType === 'retarget' && retargetParentId) {
          finalName = `__retarget:${retargetParentId}__:${editName}`;
          const parentCamp = campaigns.find(c => c.id === retargetParentId);
          if (parentCamp) {
            finalAudienceCount = Math.max(0, (parentCamp.sent_count || 0) - (parentCamp.read_count || 0));
          }
        } else {
          const { count } = await supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .not('phone', 'is', null);
          finalAudienceCount = count || 0;
        }

        const isScheduled = scheduledAt !== null;

        const { error } = await supabase.from('broadcast_campaigns').insert({
          tenant_id: tenantData.id,
          name: finalName,
          template_name: editTemplate,
          audience_count: finalAudienceCount,
          status: isScheduled ? 'scheduled' : 'draft',
          scheduled_at: isScheduled ? new Date(scheduledAt).toISOString() : null
        });
        
        if (error) throw error;
        toast.success(isScheduled ? 'Campaign scheduled successfully' : 'Campaign created successfully');
      } else if (selectedCampaign) {
        let finalName = editName;
        let finalAudienceCount = selectedCampaign.audience_count;

        if (audienceType === 'retarget' && retargetParentId) {
          finalName = `__retarget:${retargetParentId}__:${editName}`;
          const parentCamp = campaigns.find(c => c.id === retargetParentId);
          if (parentCamp) {
            finalAudienceCount = Math.max(0, (parentCamp.sent_count || 0) - (parentCamp.read_count || 0));
          }
        }

        const isScheduled = scheduledAt !== null;

        const { error } = await supabase
          .from('broadcast_campaigns')
          .update({
            name: finalName,
            template_name: editTemplate,
            audience_count: finalAudienceCount,
            status: isScheduled ? 'scheduled' : 'draft',
            scheduled_at: isScheduled ? new Date(scheduledAt).toISOString() : null
          })
          .eq('id', selectedCampaign.id);
          
        if (error) throw error;
        toast.success('Campaign updated');
      }
      
      closePanel();
      fetchCampaigns();
    } catch (error) {
      console.error(error);
      toast.error('Failed to save campaign');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    setSending(true);
    try {
      const res = await fetch('/api/broadcasts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: id })
      });
      
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error);
      }
      
      toast.success('Campaign sending started!');
      fetchCampaigns();
      if (panelMode) closePanel();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to send campaign');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    
    try {
      await supabase.from('broadcast_campaigns').delete().eq('id', id);
      toast.success('Campaign deleted');
      fetchCampaigns();
    } catch {
      toast.error('Failed to delete campaign');
    }
  };

  return (
    <div className="flex h-full bg-background text-foreground overflow-hidden">
      
      {/* Left Sidebar Filter Panel */}
      <div className="w-64 border-r border-border/60 p-5 hidden md:flex flex-col gap-6 bg-card/30 z-10">
        <div className="space-y-4">
          <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase px-2">Views</h2>
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
                  {filter.id === 'all' ? campaigns.length : campaigns.filter(c => c.status === filter.id).length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
        <header className="h-[72px] border-b border-border/60 flex items-center justify-between px-6 lg:px-8 shrink-0 relative z-20 backdrop-blur-md bg-background/80">
          <div className="flex items-center gap-6 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground/90">Campaigns</h1>
            <div className="hidden md:flex max-w-sm relative group w-full">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground/60 group-focus-within:text-indigo-500/70" />
              </div>
              <input 
                type="text" 
                placeholder="Search campaigns..." 
                className="w-full h-9 pl-10 pr-4 bg-card/60 border border-border/80 hover:border-border focus:border-indigo-500/30 rounded-lg text-sm transition-all outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => openPanel(null, 'new')}
              className="h-9 px-4 text-[13px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors flex items-center"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Broadcast
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 lg:p-8 z-10 custom-scrollbar">
          <div className="bg-card border border-border/60 rounded-[28px] p-8 max-w-[1400px] mx-auto min-h-[calc(100vh-140px)]">

            {/* Aggregate Analytics Banner */}
            {campaigns.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Total Sent', value: campaigns.reduce((s, c) => s + (c.sent_count || 0), 0), icon: Send, color: 'text-indigo-500', bg: 'bg-indigo-500/8' },
                  { label: 'Delivered', value: campaigns.reduce((s, c) => s + (c.delivered_count || 0), 0), icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-500/8' },
                  { label: 'Read', value: campaigns.reduce((s, c) => s + (c.read_count || 0), 0), icon: BarChart3, color: 'text-blue-500', bg: 'bg-blue-500/8' },
                  { label: 'Replied', value: campaigns.reduce((s, c) => s + 0, 0), icon: Zap, color: 'text-amber-500', bg: 'bg-amber-500/8' },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <div key={label} className={`flex items-center gap-4 p-5 rounded-2xl border border-border/60 ${bg}`}>
                    <div className={`p-2.5 rounded-xl bg-background/60 ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                      <p className="text-[24px] font-semibold text-foreground leading-none mt-0.5">{value.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mb-8">
              <div className="text-[13px] font-medium text-muted-foreground">
                Showing <span className="text-foreground font-semibold">{filteredCampaigns.length}</span> campaigns
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">Loading campaigns...</div>
            ) : filteredCampaigns.length > 0 ? (
              <div className="flex flex-col gap-4 w-full">
                {filteredCampaigns.map((campaign, i) => (
                  <motion.div
                    key={campaign.id}
                    onClick={() => openPanel(campaign, 'edit')}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className="group relative flex flex-col xl:flex-row items-start xl:items-center px-6 py-6 border border-border/80 hover:border-border hover:bg-secondary/20 rounded-2xl transition-all duration-300 gap-6 xl:gap-8 w-full cursor-pointer"
                  >
                    {/* Status Indicator Accent */}
                    {campaign.status === 'sending' && (
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500/80 rounded-l-2xl shadow-[0_0_10px_rgba(16,185,129,0.3)]"></div>
                    )}

                    <div className="flex-1 min-w-0 w-full xl:w-auto">
                      <div className="flex items-center gap-3 mb-2.5">
                        <div className={`shrink-0 flex items-center px-2 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-wider ${
                          campaign.status === 'sending' ? 'bg-emerald-50 text-emerald-700' :
                          campaign.status === 'scheduled' ? 'bg-blue-50 text-blue-700' :
                          campaign.status === 'completed' ? 'bg-secondary text-muted-foreground' :
                          campaign.status === 'failed' ? 'bg-red-50 text-red-700' :
                          'bg-secondary/50 text-muted-foreground border border-border/50'
                        }`}>
                          {campaign.status}
                        </div>
                      </div>
                      
                      {(() => {
                        const nameVal = campaign.name;
                        let cleanName = nameVal;
                        let isRetarget = false;
                        if (nameVal.startsWith('__retarget:')) {
                          const endIdx = nameVal.indexOf('__:');
                          if (endIdx !== -1) {
                            cleanName = nameVal.slice(endIdx + 3);
                            isRetarget = true;
                          }
                        }
                        return (
                          <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                            <h3 className="text-[18px] md:text-[20px] font-semibold text-foreground/90 truncate max-w-full">
                              {cleanName}
                            </h3>
                            {isRetarget && (
                              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_8px_rgba(99,102,241,0.2)]">
                                <Zap className="w-3 h-3 text-indigo-400" /> Retarget
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground/80 truncate">
                        <span className="text-foreground/60 shrink-0">Template: {campaign.template_name}</span>
                        <span className="opacity-40 shrink-0">•</span>
                        <span className="flex items-center gap-1 truncate"><Clock className="w-3.5 h-3.5 opacity-70 shrink-0" /> {new Date(campaign.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 md:gap-6 xl:border-l border-border/50 shrink-0 xl:pl-8">
                      {[
                        { label: 'Audience', value: campaign.audience_count, icon: Users },
                        { label: 'Sent', value: campaign.sent_count, icon: Send },
                        { label: 'Delivered', value: campaign.delivered_count, icon: Activity },
                        { label: 'Read', value: campaign.read_count, icon: BarChart3 },
                        { label: 'Failed', value: campaign.failed_count, icon: X },
                      ].map(({ label, value, icon: Icon }) => (
                        <div key={label} className="flex flex-col gap-1 w-16 xl:w-20">
                          <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1">
                            <Icon className="w-3 h-3 opacity-70" /> {label}
                          </span>
                          <span className="text-[20px] font-semibold text-foreground/90">{value ?? 0}</span>
                        </div>
                      ))}
                    </div>

                    <div className="absolute right-6 top-6 xl:top-1/2 xl:-translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1.5 bg-background/80 backdrop-blur-xl px-2 py-1.5 rounded-lg border border-border z-20">
                      {campaign.status === 'draft' && (
                        <button 
                          onClick={(e) => handleSend(campaign.id, e)}
                          disabled={sending}
                          className="px-3 py-1.5 flex items-center gap-1.5 text-[12px] font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" /> Send Now
                        </button>
                      )}
                      <button 
                        onClick={(e) => openPanel(campaign, 'analytics', e)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md" 
                        title="Analytics"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      
                      <div className="relative">
                        <button 
                          onClick={(e) => toggleDropdown(campaign.id, e)}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <AnimatePresence>
                          {activeDropdown === campaign.id && (
                            <motion.div 
                              initial={{ opacity: 0, y: 5, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 5, scale: 0.95 }}
                              className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 flex flex-col py-1"
                            >
                              {campaign.status === 'completed' && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRetargetAction(campaign);
                                  }} 
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-left font-medium"
                                >
                                  <Zap className="w-4 h-4" /> Retarget Campaign
                                </button>
                              )}
                              <button onClick={(e) => handleDelete(campaign.id, e)} className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left font-medium">
                                <Trash2 className="w-4 h-4" /> Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="col-span-full py-24 flex flex-col items-center justify-center text-center border border-dashed border-border/60 rounded-[28px] bg-secondary/20">
                <div className="w-16 h-16 bg-card shadow-sm rounded-full flex items-center justify-center mb-6 border border-border/60">
                  <Zap className="w-6 h-6 text-indigo-500" />
                </div>
                <h3 className="text-[18px] font-semibold text-foreground mb-2">Create your first broadcast orchestration</h3>
                <p className="text-[14px] text-muted-foreground mb-8 max-w-[320px] font-medium leading-relaxed">
                  Launch intelligent conversation waves and automate your outreach with AI.
                </p>
                <button 
                  onClick={() => openPanel(null, 'new')}
                  className="h-10 px-6 text-[13px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg flex items-center"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Broadcast
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <BroadcastPanel 
        panelMode={panelMode}
        selectedCampaign={selectedCampaign}
        editName={editName}
        editTemplate={editTemplate}
        saving={saving}
        sending={sending}
        onClose={closePanel}
        onSave={handleSave}
        onSend={handleSend}
        setEditName={setEditName}
        setEditTemplate={setEditTemplate}
        approvedTemplates={approvedTemplates}
        audienceType={audienceType}
        setAudienceType={setAudienceType}
        retargetParentId={retargetParentId}
        setRetargetParentId={setRetargetParentId}
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt}
        completedCampaigns={campaigns.filter(c => c.status === 'completed')}
      />
    </div>
  );
}
