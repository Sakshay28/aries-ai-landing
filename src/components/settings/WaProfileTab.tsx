'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  User, MapPin, Mail, Globe, AlignLeft, Tag, Upload,
  Save, RefreshCw, AlertCircle, CheckCircle2, Phone, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';

const VERTICALS = [
  { value: 'UNDEFINED', label: 'Select category…' },
  { value: 'RESTAURANT', label: 'Restaurant & Food' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'BEAUTY', label: 'Beauty & Cosmetics' },
  { value: 'HEALTH', label: 'Health & Medical' },
  { value: 'HOTEL', label: 'Hotel & Accommodation' },
  { value: 'TRAVEL', label: 'Travel & Transportation' },
  { value: 'APPAREL', label: 'Apparel & Clothing' },
  { value: 'FINANCE', label: 'Finance & Banking' },
  { value: 'EDU', label: 'Education' },
  { value: 'ENTERTAIN', label: 'Entertainment' },
  { value: 'EVENT_PLAN', label: 'Event Planning' },
  { value: 'GROCERY', label: 'Grocery & Supermarket' },
  { value: 'GOVT', label: 'Government' },
  { value: 'NONPROFIT', label: 'Non-profit' },
  { value: 'PROF_SERVICES', label: 'Professional Services' },
  { value: 'AUTO', label: 'Automotive' },
  { value: 'OTHER', label: 'Other' },
  { value: 'NOT_A_BIZ', label: 'Not a Business' },
];

interface WaProfile {
  about: string;
  description: string;
  address: string;
  email: string;
  websites: string[];
  vertical: string;
  profile_picture_url: string;
}

const EMPTY: WaProfile = {
  about: '',
  description: '',
  address: '',
  email: '',
  websites: ['', ''],
  vertical: 'UNDEFINED',
  profile_picture_url: '',
};

function SectionCard({ title, icon: Icon, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--secondary)' }}>
        <Icon className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{title}</span>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-[11px] font-bold tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>
          {label}
        </label>
        {hint && <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; maxLength?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full h-10 px-3 rounded-xl text-sm outline-none transition-all"
      style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3, maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; maxLength?: number;
}) {
  return (
    <div className="space-y-1">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all resize-none"
        style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
      />
      {maxLength && (
        <div className="text-right text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
          {value.length}/{maxLength}
        </div>
      )}
    </div>
  );
}

function ProfilePreview({ profile, picPreview }: { profile: WaProfile; picPreview: string | null }) {
  const initials = (profile.about || 'WA').slice(0, 2).toUpperCase();
  const displayPic = picPreview || profile.profile_picture_url;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="px-4 py-3 border-b text-xs font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)', background: 'var(--secondary)' }}>
        Live Preview
      </div>
      {/* Simulated WhatsApp profile card */}
      <div className="p-5">
        <div className="rounded-2xl overflow-hidden shadow-sm border" style={{ borderColor: 'var(--border)', background: '#e5ddd5' }}>
          {/* WA header bar */}
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: '#075E54' }}>
            <div className="w-4 h-4 text-white opacity-70">←</div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden"
              style={{ background: '#25D366', color: 'white' }}
            >
              {displayPic ? (
                <img src={displayPic} alt="" className="w-full h-full object-cover" />
              ) : initials}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {profile.about || 'Your Business'}
              </div>
              <div className="text-[9px] text-green-200">WhatsApp Business</div>
            </div>
          </div>

          {/* Profile body */}
          <div className="bg-white p-4 space-y-3">
            <div className="flex flex-col items-center gap-2 py-3">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold overflow-hidden shadow"
                style={{ background: '#25D366', color: 'white' }}
              >
                {displayPic ? (
                  <img src={displayPic} alt="" className="w-full h-full object-cover" />
                ) : initials}
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold" style={{ color: '#111' }}>
                  {profile.about || 'Your Business'}
                </div>
                <div className="text-[10px] text-gray-400">+91 XXXXX XXXXX</div>
              </div>
            </div>

            {profile.description && (
              <div className="text-[11px] text-gray-600 border-t pt-3" style={{ borderColor: '#f0f0f0' }}>
                {profile.description}
              </div>
            )}

            <div className="space-y-2 border-t pt-3" style={{ borderColor: '#f0f0f0' }}>
              {VERTICALS.find(v => v.value === profile.vertical)?.label !== 'Select category…' && profile.vertical !== 'UNDEFINED' && (
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <Tag className="w-3 h-3" />
                  {VERTICALS.find(v => v.value === profile.vertical)?.label}
                </div>
              )}
              {profile.address && (
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{profile.address}</span>
                </div>
              )}
              {profile.email && (
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <Mail className="w-3 h-3" />
                  <span className="truncate">{profile.email}</span>
                </div>
              )}
              {profile.websites.filter(Boolean).map((url, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] text-blue-500">
                  <Globe className="w-3 h-3" />
                  <span className="truncate">{url}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WaProfileTab() {
  const [profile, setProfile] = useState<WaProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [picPreview, setPicPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/whatsapp/profile');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const d = json.data ?? {};
      setProfile({
        about: d.about ?? '',
        description: d.description ?? '',
        address: d.address ?? '',
        email: d.email ?? '',
        websites: [d.websites?.[0] ?? '', d.websites?.[1] ?? ''],
        vertical: d.vertical ?? 'UNDEFINED',
        profile_picture_url: d.profile_picture_url ?? '',
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const update = (field: keyof WaProfile, value: string | string[]) => {
    setProfile(p => ({ ...p, [field]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...profile,
        websites: profile.websites.filter(Boolean),
      };
      const res = await fetch('/api/dashboard/whatsapp/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');

      // Re-fetch from Meta to confirm the data actually persisted.
      // Without this, the UI shows local state and the user can't tell if
      // Meta actually saved it until they manually refresh.
      await fetchProfile();
      toast.success('Saved and verified on WhatsApp ✓');
      setDirty(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const uploadPicture = async (file: File) => {
    setUploadingPic(true);
    // Show local preview immediately
    const previewUrl = URL.createObjectURL(file);
    setPicPreview(previewUrl);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/dashboard/whatsapp/profile/picture', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Profile picture updated on WhatsApp');
      // Refresh to get the new picture URL from Meta
      await fetchProfile();
      setPicPreview(null);
    } catch (e) {
      toast.error((e as Error).message);
      setPicPreview(null);
    } finally {
      setUploadingPic(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadPicture(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadPicture(file);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--muted-foreground)', borderTopColor: 'transparent' }} />
        <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Loading profile from Meta…</span>
      </div>
    );
  }

  if (error) {
    const isNotConfigured = error.toLowerCase().includes('not configured') || error.toLowerCase().includes('credentials');
    if (isNotConfigured) {
      return (
        <div className="rounded-2xl border p-10 text-center space-y-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ background: '#e7f5ef' }}>
            <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.557 4.126 1.527 5.855L.057 23.57a.75.75 0 0 0 .93.894l5.878-1.54A11.946 11.946 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.012-1.374l-.36-.213-3.49.915.933-3.4-.234-.37A9.818 9.818 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
          </div>
          <div>
            <div className="text-base font-semibold mb-1" style={{ color: 'var(--foreground)' }}>WhatsApp not connected</div>
            <div className="text-sm max-w-sm mx-auto" style={{ color: 'var(--muted-foreground)' }}>
              Add your Meta WhatsApp credentials to activate the Business Profile, chatbot, and broadcasts.
            </div>
          </div>
          <a
            href="/dashboard/settings?tab=whatsapp"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: '#25D366', color: 'white' }}
          >
            Connect WhatsApp <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border p-8 text-center space-y-3" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <AlertCircle className="w-8 h-8 mx-auto" style={{ color: '#ef4444' }} />
        <div className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Could not load WhatsApp profile</div>
        <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{error}</div>
        <button
          onClick={fetchProfile}
          className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl text-sm font-medium transition-all"
          style={{ background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div key="wabizprofile" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Changes are sent directly to Meta and visible on WhatsApp within a few minutes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchProfile}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all"
            style={{ background: 'var(--secondary)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: dirty ? '#10B981' : 'var(--muted)',
              color: dirty ? 'white' : 'var(--muted-foreground)',
              cursor: dirty ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving…' : 'Save to WhatsApp'}
          </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: edit form (2/3 width) */}
        <div className="lg:col-span-2 space-y-5">

          {/* Profile Picture */}
          <SectionCard title="Profile Picture" icon={User}>
            <div className="flex items-center gap-5">
              {/* Current picture */}
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden shadow-md"
                style={{ background: '#25D366', color: 'white' }}
              >
                {(picPreview || profile.profile_picture_url) ? (
                  <img
                    src={picPreview || profile.profile_picture_url}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Phone className="w-8 h-8 text-white" />
                )}
              </div>

              {/* Drop zone */}
              <div
                className="flex-1 border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all"
                style={{
                  borderColor: dragOver ? '#10B981' : 'var(--border)',
                  background: dragOver ? 'rgba(16,185,129,0.05)' : 'var(--background)',
                }}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {uploadingPic ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#10B981', borderTopColor: 'transparent' }} />
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Uploading to Meta…</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <Upload className="w-5 h-5 mx-auto" style={{ color: 'var(--muted-foreground)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      Drop image or click to upload
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      JPG or PNG · max 5 MB · square recommended
                    </span>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Business Info */}
          <SectionCard title="Business Info" icon={AlignLeft}>
            <Field label="About / Status" hint={`${profile.about.length}/139`}>
              <Input
                value={profile.about}
                onChange={v => update('about', v.slice(0, 139))}
                placeholder="Hey there! We are your go-to destination for…"
                maxLength={139}
              />
            </Field>
            <Field label="Description" hint={`${profile.description.length}/512`}>
              <Textarea
                value={profile.description}
                onChange={v => update('description', v.slice(0, 512))}
                placeholder="Tell customers about your business, what you offer, your story…"
                rows={3}
                maxLength={512}
              />
            </Field>
            <Field label="Category">
              <select
                value={profile.vertical}
                onChange={e => update('vertical', e.target.value)}
                className="w-full h-10 px-3 rounded-xl text-sm outline-none transition-all"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              >
                {VERTICALS.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </Field>
          </SectionCard>

          {/* Contact Details */}
          <SectionCard title="Contact Details" icon={Mail}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Address">
                <Input
                  value={profile.address}
                  onChange={v => update('address', v)}
                  placeholder="123 MG Road, Bangalore 560001"
                  maxLength={256}
                />
              </Field>
              <Field label="Email">
                <Input
                  value={profile.email}
                  onChange={v => update('email', v)}
                  placeholder="hello@yourbusiness.com"
                  type="email"
                  maxLength={128}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Websites */}
          <SectionCard title="Websites" icon={Globe}>
            <Field label="Website 1">
              <Input
                value={profile.websites[0]}
                onChange={v => update('websites', [v, profile.websites[1]])}
                placeholder="https://yourbusiness.com"
                type="url"
                maxLength={256}
              />
            </Field>
            <Field label="Website 2 (optional)">
              <Input
                value={profile.websites[1]}
                onChange={v => update('websites', [profile.websites[0], v])}
                placeholder="https://yourbusiness.in"
                type="url"
                maxLength={256}
              />
            </Field>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Up to 2 websites are shown on your WhatsApp Business profile.
            </p>
          </SectionCard>

          {/* Official Account info */}
          <div
            className="rounded-2xl border p-4 flex items-start gap-3"
            style={{ background: 'var(--secondary)', borderColor: 'var(--border)' }}
          >
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
            <div className="text-xs space-y-1" style={{ color: 'var(--muted-foreground)' }}>
              <p className="font-semibold" style={{ color: 'var(--foreground)' }}>Display Name & Blue Tick</p>
              <p>
                Your display name (the name shown in chats) is set in Meta Business Manager and cannot be changed here.
                To request a Blue Tick (Official Business Account), visit your phone number's <strong>Profile</strong> tab in
                the WhatsApp Manager.
              </p>
            </div>
          </div>
        </div>

        {/* Right: live preview (1/3 width) */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <ProfilePreview profile={profile} picPreview={picPreview} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
