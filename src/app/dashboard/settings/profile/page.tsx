"use client";

import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Globe, Phone, Mail, Tag, X, ChevronDown,
  Save, CheckCircle2, AlertCircle, Loader2, Mic, Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';

// ────────────────────────────────────────────────────────────
// Types & constants
// ────────────────────────────────────────────────────────────
interface BusinessProfile {
  company_name: string;
  industry: string;
  website_url: string;
  core_services: string[];
  tone: string;
  contact_phone: string;
  contact_email: string;
}

const DEFAULT_PROFILE: BusinessProfile = {
  company_name: '',
  industry: '',
  website_url: '',
  core_services: [],
  tone: 'friendly',
  contact_phone: '',
  contact_email: '',
};

const INDUSTRIES = [
  'E-Commerce & Retail',
  'Healthcare & Clinics',
  'Real Estate',
  'Restaurants & Food',
  'Education & Coaching',
  'Finance & Insurance',
  'Salons & Beauty',
  'Travel & Hospitality',
  'Recruitment & HR',
  'Logistics & Shipping',
  'SaaS & Technology',
  'Other',
];

const TONES = [
  { value: 'friendly',      label: 'Friendly',      desc: 'Warm, approachable, uses emojis' },
  { value: 'professional',  label: 'Professional',  desc: 'Formal, precise, business-like' },
  { value: 'casual',        label: 'Casual',        desc: 'Relaxed, conversational, informal' },
  { value: 'formal',        label: 'Formal',        desc: 'Strict, official, no contractions' },
];

// ────────────────────────────────────────────────────────────
// Tag Input Component
// ────────────────────────────────────────────────────────────
function TagInput({
  tags,
  onChange,
  placeholder = 'Type a service and press Enter',
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => onChange(tags.filter(t => t !== tag));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div
      className="flex flex-wrap gap-2 min-h-[42px] w-full rounded-xl border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-foreground/10 focus-within:border-foreground/30 transition-all cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      <AnimatePresence initial={false}>
        {tags.map(tag => (
          <motion.span
            key={tag}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-foreground/8 border border-border text-foreground"
          >
            <Tag className="w-3 h-3 text-muted-foreground" />
            {tag}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeTag(tag); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => input && addTag(input)}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 py-0.5"
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Select Component
// ────────────────────────────────────────────────────────────
function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30 transition-all pr-10"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Field wrapper
// ────────────────────────────────────────────────────────────
function Field({
  label,
  hint,
  icon,
  children,
}: {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main Page
// ────────────────────────────────────────────────────────────
export default function BusinessProfilePage() {
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/dashboard/settings/profile');
        const json = await res.json();
        if (json.success && json.data) {
          setProfile({ ...DEFAULT_PROFILE, ...json.data });
        } else {
          setError(json.error ?? 'Failed to load profile');
        }
      } catch {
        setError('Network error loading profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) => {
    setProfile(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const json = await res.json();
      if (json.success) {
        setSaved(true);
        toast.success('Business profile saved');
        setTimeout(() => setSaved(false), 3000);
      } else {
        throw new Error(json.error ?? 'Save failed');
      }
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8">
      <div className="max-w-[720px] mx-auto w-full space-y-8">

        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Business Profile</h1>
            <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
              This information is used to personalise your AI agent's responses, tone, and vocabulary, with no technical prompting required.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            id="save-profile-btn"
            className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 disabled:opacity-50 transition-all shadow-sm shrink-0"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Profile'}
          </button>
        </header>

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-sm">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Form sections */}
        <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.03)]">

          {/* Section: Company */}
          <div className="p-6 space-y-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Company Information</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Company Name" icon={<Building2 className="w-4 h-4" />} hint="How the AI will refer to your business">
                <input
                  id="company-name"
                  type="text"
                  value={profile.company_name}
                  onChange={e => set('company_name', e.target.value)}
                  placeholder="e.g. Priya's Salon"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30 transition-all"
                />
              </Field>

              <Field label="Industry" icon={<Briefcase className="w-4 h-4" />} hint="Adjusts AI vocabulary and terminology">
                <Select
                  value={profile.industry}
                  onChange={v => set('industry', v)}
                  options={INDUSTRIES}
                  placeholder="Select your industry"
                />
              </Field>

              <Field label="Website URL" icon={<Globe className="w-4 h-4" />} hint="Optional: used in AI responses">
                <input
                  id="website-url"
                  type="url"
                  value={profile.website_url}
                  onChange={e => set('website_url', e.target.value)}
                  placeholder="https://yourbusiness.com"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30 transition-all"
                />
              </Field>
            </div>
          </div>

          {/* Section: Core Services */}
          <div className="p-6 space-y-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Core Services</h2>
            <Field
              label="What do you offer?"
              icon={<Tag className="w-4 h-4" />}
              hint="Type a service and press Enter. The AI will mention these when answering product/service questions."
            >
              <TagInput
                tags={profile.core_services}
                onChange={v => set('core_services', v)}
                placeholder="e.g. Haircuts, Bridal Makeup, Keratin Treatment…"
              />
            </Field>
          </div>

          {/* Section: Tone of Voice */}
          <div className="p-6 space-y-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tone of Voice</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {TONES.map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('tone', value)}
                  className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-all ${
                    profile.tone === value
                      ? 'border-foreground bg-foreground/5 shadow-sm'
                      : 'border-border bg-background hover:border-foreground/30 hover:bg-foreground/2'
                  }`}
                >
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                  <span className="text-[11px] text-muted-foreground leading-relaxed">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section: Contact */}
          <div className="p-6 space-y-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Contact Details</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Phone Number" icon={<Phone className="w-4 h-4" />} hint="Shown to customers when needed">
                <input
                  id="contact-phone"
                  type="tel"
                  value={profile.contact_phone}
                  onChange={e => set('contact_phone', e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30 transition-all"
                />
              </Field>

              <Field label="Email Address" icon={<Mail className="w-4 h-4" />} hint="Used for escalations and summaries">
                <input
                  id="contact-email"
                  type="email"
                  value={profile.contact_email}
                  onChange={e => set('contact_email', e.target.value)}
                  placeholder="hello@yourbusiness.com"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground/30 transition-all"
                />
              </Field>
            </div>
          </div>

        </div>

        {/* AI Preview */}
        <div className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/0 border border-emerald-500/20 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-bold tracking-wide text-emerald-600 dark:text-emerald-400">AI Persona Preview</span>
          </div>
          <div className="bg-background/80 rounded-xl p-4 border border-border/60 text-sm text-foreground leading-relaxed font-mono">
            {profile.company_name || 'Your Business'} assistant here:{' '}
            {profile.tone === 'friendly' && '😊 How can I help you today?'}
            {profile.tone === 'professional' && 'How may I assist you?'}
            {profile.tone === 'casual' && 'Hey! What can I do for you?'}
            {profile.tone === 'formal' && 'Good day. Please state your enquiry.'}
            {profile.core_services.length > 0 && (
              <span className="text-muted-foreground">
                {' '}We specialise in: {profile.core_services.slice(0, 3).join(', ')}{profile.core_services.length > 3 ? ' & more' : ''}.
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">This preview updates as you edit the fields above. The actual AI will use your full knowledge base when responding.</p>
        </div>

        {/* Save footer */}
        <div className="flex items-center justify-end pb-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 h-10 px-6 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Profile'}
          </button>
        </div>

      </div>
    </div>
  );
}
