'use client';

import { useState } from 'react';
import { X, Phone, MessageCircle, Tag, Plus, Star } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/utils/phone';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import type { RestaurantBooking } from '@/lib/types';

interface GuestProfile {
  phone: string;
  name: string | null;
  totalBookings: number;
  totalVisits: number;
  lastVisit: string | null;
  avgPartySize: number;
  tags: string[];
  notes: string | null;
  vip_status: boolean;
  bookings: (RestaurantBooking & { slot_time?: string | null })[];
}

interface Props {
  profile: GuestProfile | null;
  loading: boolean;
  onClose: () => void;
  onProfileUpdate?: () => void;
}

function formatSlotTime(timeStr?: string | null): string {
  if (!timeStr) return '—';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return timeStr; }
}


const PRESET_TAGS = [
  { label: 'VIP',           color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300/40' },
  { label: 'Regular',       color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-300/40' },
  { label: 'Corporate',     color: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-300/40' },
  { label: 'Birthday 🎂',   color: 'bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-300/40' },
  { label: 'Anniversary',   color: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-300/40' },
  { label: 'High Spender',  color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300/40' },
  { label: 'Vegetarian',    color: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-300/40' },
  { label: 'Outdoor Pref',  color: 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-300/40' },
  { label: 'Needs Attention',color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-300/40' },
];

function tagColor(label: string): string {
  return PRESET_TAGS.find(t => t.label === label)?.color ?? 'bg-muted text-muted-foreground border-border';
}

export function GuestProfilePanel({ profile, loading, onClose, onProfileUpdate }: Props) {
  const [tags, setTags] = useState<string[]>(profile?.tags ?? []);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [savingTags, setSavingTags] = useState(false);

  // Sync tags when profile changes
  if (profile && profile.tags.join(',') !== tags.join(',') && !savingTags) {
    setTags(profile.tags);
  }

  const saveTags = async (newTags: string[]) => {
    if (!profile) return;
    setSavingTags(true);
    try {
      const res = await fetch('/api/restaurant/guests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: profile.phone, tags: newTags, customer_name: profile.name }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setTags(newTags);
      onProfileUpdate?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingTags(false);
    }
  };

  const toggleTag = (label: string) => {
    const next = tags.includes(label) ? tags.filter(t => t !== label) : [...tags, label];
    saveTags(next);
  };

  const isVIP = profile?.vip_status || tags.includes('VIP');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[51] w-full max-w-sm overflow-y-auto flex flex-col
          bg-background border-l border-border shadow-[-8px_0_40px_rgba(0,0,0,0.18)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-border sticky top-0 bg-background z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold truncate">{profile?.name ?? '…'}</h3>
              {isVIP && <Star className="size-4 text-amber-500 fill-amber-500 shrink-0" />}
            </div>
            {profile?.phone && (
              <a href={`tel:+${profile.phone.replace(/\D/g,'')}`} className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                <Phone className="size-3" />{formatPhoneDisplay(profile.phone)}
              </a>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:bg-muted rounded-md ml-3 shrink-0">
            <X className="size-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">{[0,1,2,3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
        ) : profile ? (
          <div className="flex-1 p-6 space-y-6">

            {/* Quick actions */}
            <div className="flex gap-2">
              <a href={`tel:+${profile.phone.replace(/\D/g,'')}`} className="flex-1">
                <Button size="sm" variant="outline" className="w-full">
                  <Phone className="size-3.5 mr-1.5" /> Call
                </Button>
              </a>
              <a href={`https://wa.me/${profile.phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button size="sm" variant="outline" className="w-full">
                  <MessageCircle className="size-3.5 mr-1.5" /> WhatsApp
                </Button>
              </a>
            </div>

            {/* Tags */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Tag className="size-3" /> Guest Tags
                </h4>
                <button
                  onClick={() => setShowTagPicker(!showTagPicker)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="size-3" /> Add
                </button>
              </div>

              {/* Active tags */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tags yet.</p>
                ) : tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-opacity hover:opacity-70 ${tagColor(tag)}`}
                  >
                    {tag} <X className="size-2.5" />
                  </button>
                ))}
              </div>

              {/* Tag picker */}
              {showTagPicker && (
                <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-muted/40 border border-border">
                  {PRESET_TAGS.filter(t => !tags.includes(t.label)).map(t => (
                    <button
                      key={t.label}
                      onClick={() => { toggleTag(t.label); }}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border transition-opacity hover:opacity-80 ${t.color}`}
                    >
                      + {t.label}
                    </button>
                  ))}
                  {PRESET_TAGS.every(t => tags.includes(t.label)) && (
                    <p className="text-xs text-muted-foreground">All tags applied.</p>
                  )}
                </div>
              )}
            </div>

            {/* Visit history */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Visit History</h4>
              <div>
                {profile.bookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No past visits found.</p>
                ) : profile.bookings.map((b, i) => {
                  const statusColor: Record<string, string> = {
                    confirmed: 'bg-emerald-500',
                    completed: 'bg-primary',
                    no_show:   'bg-amber-500',
                    cancelled: 'bg-muted-foreground/40',
                  };
                  const statusText: Record<string, string> = {
                    confirmed: 'Confirmed',
                    completed: 'Completed',
                    no_show:   'No-show',
                    cancelled: 'Cancelled',
                  };
                  const isLast = i === profile.bookings.length - 1;
                  return (
                    <div key={b.id} className="flex gap-3">
                      {/* Timeline rail */}
                      <div className="flex flex-col items-center pt-1.5">
                        <span className={`size-2 rounded-full shrink-0 ${statusColor[b.booking_status] ?? 'bg-muted-foreground'}`} />
                        {!isLast && <span className="w-px flex-1 bg-border mt-1" />}
                      </div>
                      {/* Content */}
                      <div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-3'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {new Date(b.booking_date+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                          </p>
                          <span className={`text-[11px] font-medium shrink-0 ${
                            b.booking_status === 'cancelled' ? 'text-muted-foreground'
                            : b.booking_status === 'no_show' ? 'text-amber-600 dark:text-amber-500'
                            : 'text-muted-foreground'
                          }`}>
                            {statusText[b.booking_status] ?? b.booking_status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {b.slot_time ? formatSlotTime(b.slot_time) : '—'} · {b.party_size} cover{b.party_size !== 1 ? 's' : ''}
                        </p>
                        {b.special_request && (
                          <p className="text-xs text-muted-foreground/80 italic truncate mt-0.5">{b.special_request}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        ) : null}
      </div>
    </>
  );
}
