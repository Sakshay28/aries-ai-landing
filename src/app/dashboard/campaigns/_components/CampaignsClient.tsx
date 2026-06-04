"use client";

import React, { useEffect, useState } from 'react';
import { Radar, Plus, Copy, Check, Trash2, Link2, Users2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

type Campaign = {
  id: string;
  name: string;
  ref_code: string;
  color: string;
  is_active: boolean;
  created_at: string;
  lead_count: number;
  meta_ad_id?: string | null;
};

export function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [waNumber, setWaNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [refCode, setRefCode] = useState('');
  const [metaAdId, setMetaAdId] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/dashboard/campaigns');
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.campaigns);
        setWaNumber(data.wa_number || '');
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCampaigns(); }, []);

  const trackingLink = (refCode: string) => {
    const text = encodeURIComponent(`Hi! I'd like to know more. [${refCode}]`);
    if (!waNumber) return `(set your WhatsApp number in Business Profile)`;
    return `https://wa.me/${waNumber}?text=${text}`;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/dashboard/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ref_code: refCode, meta_ad_id: metaAdId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Campaign created');
        setName('');
        setRefCode('');
        setMetaAdId('');
        fetchCampaigns();
      } else {
        toast.error(data.error || 'Failed to create');
      }
    } catch {
      toast.error('Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (c: Campaign) => {
    if (!confirm(`Delete "${c.name}"? Leads already tagged keep their data; the link stops tracking.`)) return;
    try {
      const res = await fetch(`/api/dashboard/campaigns?id=${c.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('Deleted'); fetchCampaigns(); }
      else toast.error(data.error || 'Failed to delete');
    } catch { toast.error('Failed to delete'); }
  };

  const copyLink = (c: Campaign) => {
    const link = trackingLink(c.ref_code);
    navigator.clipboard.writeText(link);
    setCopiedId(c.id);
    toast.success('Link copied');
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1000px] mx-auto w-full space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Radar className="w-6 h-6 text-violet-600" /> Tracking Campaigns
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl mt-1">
            Create a unique WhatsApp link for each batch or source (e.g. &ldquo;4 June Tracking&rdquo;, &ldquo;11 June Tracking&rdquo;).
            Anyone who messages through that link is automatically tagged, so you can separate and filter leads on the
            Sales Pipeline and in your Google Sheet.
          </p>
        </header>

        {/* Create form */}
        <form onSubmit={handleCreate} className="bg-card border border-border shadow-sm rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Campaign name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 4 June Tracking"
                className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Short code <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input
                value={refCode}
                onChange={(e) => setRefCode(e.target.value)}
                placeholder="auto from name, e.g. 4june"
                className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Meta Ad ID <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input
                value={metaAdId}
                onChange={(e) => setMetaAdId(e.target.value)}
                placeholder="for Click-to-WhatsApp ads"
                className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-indigo-500 outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> {creating ? 'Creating...' : 'Create campaign'}
            </button>
          </div>
        </form>

        {/* List */}
        <div className="space-y-3">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading campaigns...</div>
          ) : campaigns.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground border-2 border-dashed border-border/50 rounded-2xl">
              No campaigns yet. Create one above to start tracking where your leads come from.
            </div>
          ) : (
            campaigns.map((c) => (
              <div key={c.id} className="bg-card border border-border shadow-sm rounded-2xl p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                      <h3 className="font-semibold text-sm truncate">{c.name}</h3>
                      <span className="text-[11px] font-mono bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">#{c.ref_code}</span>
                      {c.meta_ad_id && (
                        <span className="text-[11px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">Ad: {c.meta_ad_id}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Link2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate font-mono">{trackingLink(c.ref_code)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium bg-secondary px-2.5 py-1 rounded-lg">
                      <Users2 className="w-4 h-4 text-muted-foreground" /> {c.lead_count}
                      <span className="text-muted-foreground font-normal">leads</span>
                    </div>
                    <button
                      onClick={() => copyLink(c)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-secondary transition-colors"
                    >
                      {copiedId === c.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      Copy link
                    </button>
                    <a
                      href={trackingLink(c.ref_code)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
                      title="Open link"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDelete(c)}
                      className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete campaign"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {!waNumber && !loading && (
          <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            ⚠️ Set your WhatsApp number in <strong>Business Profile</strong> so tracking links can be generated.
          </p>
        )}
      </div>
    </div>
  );
}
