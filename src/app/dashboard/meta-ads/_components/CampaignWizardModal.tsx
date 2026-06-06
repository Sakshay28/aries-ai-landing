"use client";

import { useState, useEffect } from "react";
import {
  X, ChevronRight, ChevronLeft, CheckCircle,
  Megaphone, Users, DollarSign, Image, Eye, Send,
  Loader2, AlertCircle, Target, Globe, Phone, Calendar,
  Plus, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───
interface WizardData {
  // Step 1
  name: string;
  objective: "MESSAGES" | "LEADS" | "AWARENESS" | "TRAFFIC";
  ad_account_id: string;
  // Step 2
  whatsapp_number_id: string;
  page_id: string;
  // Step 3 – Targeting
  targeting: {
    locations: { key: string; name: string; type: string }[];
    age_min: number;
    age_max: number;
    genders: number[];
    interests: { id: string; name: string }[];
    behaviors: { id: string; name: string }[];
  };
  // Step 4 – Budget
  budget_type: "daily" | "lifetime";
  budget_amount: number;
  start_date: string;
  end_date: string;
  // Step 5 – Creative
  creative: {
    primary_text: string;
    headline: string;
    description: string;
    cta: string;
    media_type: "image" | "video" | "carousel";
    media_urls: string[];
  };
}

const DEFAULT_DATA: WizardData = {
  name: "",
  objective: "MESSAGES",
  ad_account_id: "",
  whatsapp_number_id: "",
  page_id: "",
  targeting: {
    locations: [],
    age_min: 18,
    age_max: 65,
    genders: [0],
    interests: [],
    behaviors: [],
  },
  budget_type: "daily",
  budget_amount: 500,
  start_date: "",
  end_date: "",
  creative: {
    primary_text: "",
    headline: "",
    description: "",
    cta: "WHATSAPP_MESSAGE",
    media_type: "image",
    media_urls: [],
  },
};

// ─── Step indicator ───
const STEPS = [
  { id: 1, label: "Campaign",  icon: Megaphone },
  { id: 2, label: "WhatsApp",  icon: Phone },
  { id: 3, label: "Audience",  icon: Users },
  { id: 4, label: "Budget",    icon: DollarSign },
  { id: 5, label: "Creative",  icon: Image },
  { id: 6, label: "Review",    icon: Eye },
];

const OBJECTIVES = [
  { value: "MESSAGES",   label: "Messages",    desc: "Drive WhatsApp conversations",      icon: "💬" },
  { value: "LEADS",      label: "Leads",       desc: "Collect contact information",        icon: "👤" },
  { value: "AWARENESS",  label: "Awareness",   desc: "Reach the maximum audience",         icon: "📢" },
  { value: "TRAFFIC",    label: "Traffic",     desc: "Send people to your website",        icon: "🌐" },
];

const PRESET_INTERESTS = [
  { id: "6003277229371", name: "Restaurants" },
  { id: "6003348604581", name: "Foodies" },
  { id: "6002868910910", name: "Fine dining" },
  { id: "6003107902433", name: "Travel" },
  { id: "6003456724289", name: "Tourism" },
  { id: "6003020834693", name: "Business travel" },
  { id: "6002991239659", name: "Luxury goods" },
  { id: "6003384041297", name: "Hotel & Resorts" },
];

const CTA_OPTIONS = [
  "WHATSAPP_MESSAGE", "LEARN_MORE", "BOOK_NOW", "CONTACT_US", "GET_OFFER", "SIGN_UP",
];

// ─── Input components ───
const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-xs font-semibold text-foreground mb-1.5">
    {children}{required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);

const TextInput = ({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className={cn("w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all", className)}
  />
);

const TextArea = ({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) => (
  <textarea
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    rows={rows}
    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none transition-all"
  />
);

// ─── Main wizard ───
export function CampaignWizardModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(DEFAULT_DATA);
  const [accounts, setAccounts] = useState<{ ad_accounts: any[]; pages: any[]; whatsapp_numbers: any[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/meta-ads/accounts")
      .then((r) => r.json())
      .then((d) => {
        setAccounts(d);
        // Auto-select defaults
        const selectedAcc = d.ad_accounts?.find((a: any) => a.is_selected);
        const selectedPage = d.pages?.find((p: any) => p.is_selected);
        const selectedWa = d.whatsapp_numbers?.find((w: any) => w.is_selected);
        setData((prev) => ({
          ...prev,
          ad_account_id: selectedAcc?.id || d.ad_accounts?.[0]?.id || "",
          page_id: selectedPage?.id || d.pages?.[0]?.id || "",
          whatsapp_number_id: selectedWa?.id || d.whatsapp_numbers?.[0]?.id || "",
        }));
      })
      .catch(() => {});
  }, []);

  const update = (patch: Partial<WizardData>) => setData((p) => ({ ...p, ...patch }));
  const updateCreative = (patch: Partial<WizardData["creative"]>) =>
    setData((p) => ({ ...p, creative: { ...p.creative, ...patch } }));
  const updateTargeting = (patch: Partial<WizardData["targeting"]>) =>
    setData((p) => ({ ...p, targeting: { ...p.targeting, ...patch } }));

  const canNext = () => {
    switch (step) {
      case 1: return data.name.trim().length > 0 && !!data.ad_account_id;
      case 2: return !!data.whatsapp_number_id;
      case 3: return true;
      case 4: return data.budget_amount > 0;
      case 5: return data.creative.primary_text.trim().length > 0 && data.creative.headline.trim().length > 0;
      default: return true;
    }
  };

  const handleSubmit = async (publish = false) => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: data.name,
        objective: data.objective,
        ad_account_id: data.ad_account_id,
        whatsapp_number_id: data.whatsapp_number_id || undefined,
        page_id: data.page_id || undefined,
        budget_type: data.budget_type,
        budget_amount: data.budget_amount,
        start_date: data.start_date || undefined,
        end_date: data.end_date || undefined,
        targeting: data.targeting,
        creative: data.creative,
      };

      const res = await fetch("/api/meta-ads/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create campaign");
      }

      const { campaign } = await res.json();
      setCreatedId(campaign.id);

      if (publish) {
        const pubRes = await fetch(`/api/meta-ads/campaigns/${campaign.id}/publish`, { method: "POST" });
        if (!pubRes.ok) {
          const e = await pubRes.json();
          throw new Error(e.error || "Publish failed");
        }
      }

      setPublished(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  };

  if (published) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-2xl">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Campaign Created!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your campaign has been saved. If you published it, it's now pending review by Meta.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button onClick={onClose} className="w-full rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background hover:bg-foreground/90">
              Back to Campaigns
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Create Campaign</h2>
            <p className="text-xs text-muted-foreground">Step {step} of {STEPS.length}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 border-b border-border px-6 py-3 shrink-0 overflow-x-auto">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className="flex items-center shrink-0">
                <div className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all",
                  active ? "bg-foreground text-background" :
                  done  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                          "text-muted-foreground"
                )}>
                  {done ? <CheckCircle className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={cn("h-px w-4 mx-1", step > s.id + 1 || (done && idx < step - 1) ? "bg-emerald-500/30" : "bg-border")} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* ── Step 1: Campaign ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <Label required>Campaign Name</Label>
                <TextInput value={data.name} onChange={(v) => update({ name: v })} placeholder="e.g. Diwali Offer 2026 — Clock Tower" />
              </div>
              <div>
                <Label>Ad Account</Label>
                <select
                  value={data.ad_account_id}
                  onChange={(e) => update({ ad_account_id: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select ad account…</option>
                  {accounts?.ad_accounts?.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.account_name || acc.account_id} ({acc.currency})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Campaign Objective</Label>
                <div className="grid grid-cols-2 gap-2.5">
                  {OBJECTIVES.map((obj) => (
                    <button
                      key={obj.value}
                      onClick={() => update({ objective: obj.value as WizardData["objective"] })}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all",
                        data.objective === obj.value
                          ? "border-foreground bg-foreground/5 dark:bg-foreground/10"
                          : "border-border hover:border-foreground/40"
                      )}
                    >
                      <span className="text-xl">{obj.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{obj.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{obj.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: WhatsApp ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <Label required>WhatsApp Business Number</Label>
                <p className="text-xs text-muted-foreground mb-2.5">All ad conversations will go to this number.</p>
                {(accounts?.whatsapp_numbers?.length || 0) === 0 ? (
                  <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-center">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">No WhatsApp numbers connected</p>
                    <a href="/dashboard/meta-ads/settings" className="mt-1 text-xs text-muted-foreground hover:text-foreground underline">Connect in Meta Ads Settings →</a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {accounts?.whatsapp_numbers?.map((wa) => (
                      <button
                        key={wa.id}
                        onClick={() => update({ whatsapp_number_id: wa.id })}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all",
                          data.whatsapp_number_id === wa.id ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/40"
                        )}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10">
                          <Phone className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{wa.verified_name || wa.display_phone}</p>
                          <p className="text-xs text-muted-foreground">{wa.display_phone}{wa.quality_rating ? ` · Quality: ${wa.quality_rating}` : ""}</p>
                        </div>
                        {data.whatsapp_number_id === wa.id && <CheckCircle className="h-4 w-4 text-emerald-500 ml-auto shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(accounts?.pages?.length || 0) > 0 && (
                <div>
                  <Label>Facebook Page (for ad creative)</Label>
                  <div className="space-y-2">
                    {accounts?.pages?.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => update({ page_id: page.id })}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all",
                          data.page_id === page.id ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/40"
                        )}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/10">
                          <Globe className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{page.page_name || page.page_id}</p>
                          <p className="text-xs text-muted-foreground">Page ID: {page.page_id}</p>
                        </div>
                        {data.page_id === page.id && <CheckCircle className="h-4 w-4 text-blue-500 ml-auto shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Audience ── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Age */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Min Age</Label>
                  <input type="number" min={13} max={65} value={data.targeting.age_min}
                    onChange={(e) => updateTargeting({ age_min: parseInt(e.target.value) || 18 })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <Label>Max Age</Label>
                  <input type="number" min={13} max={65} value={data.targeting.age_max}
                    onChange={(e) => updateTargeting({ age_max: parseInt(e.target.value) || 65 })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Gender */}
              <div>
                <Label>Gender</Label>
                <div className="flex gap-2">
                  {[{ v: 0, l: "All" }, { v: 1, l: "Male" }, { v: 2, l: "Female" }].map(({ v, l }) => (
                    <button
                      key={v}
                      onClick={() => updateTargeting({ genders: [v] })}
                      className={cn(
                        "flex-1 rounded-xl border py-2 text-sm font-medium transition-all",
                        data.targeting.genders[0] === v ? "border-foreground bg-foreground/5 text-foreground" : "border-border text-muted-foreground hover:border-foreground/40"
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interests */}
              <div>
                <Label>Interests & Behaviors</Label>
                <p className="text-xs text-muted-foreground mb-2.5">Select relevant interests to target the right audience.</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_INTERESTS.map((interest) => {
                    const selected = data.targeting.interests.some((i) => i.id === interest.id);
                    return (
                      <button
                        key={interest.id}
                        onClick={() =>
                          updateTargeting({
                            interests: selected
                              ? data.targeting.interests.filter((i) => i.id !== interest.id)
                              : [...data.targeting.interests, interest],
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                          selected ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                        )}
                      >
                        {selected && "✓ "}{interest.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Location note */}
              <div className="rounded-xl bg-muted/40 border border-border/60 p-3.5">
                <p className="text-xs font-semibold text-foreground">Location Targeting</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Defaults to India. Advanced location targeting (by city/state) will be available after publishing — you can refine it in Meta Ads Manager.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 4: Budget ── */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <Label>Budget Type</Label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { v: "daily", l: "Daily Budget", d: "Spend this amount each day" },
                    { v: "lifetime", l: "Lifetime Budget", d: "Total spend for the campaign" },
                  ].map(({ v, l, d }) => (
                    <button
                      key={v}
                      onClick={() => update({ budget_type: v as "daily" | "lifetime" })}
                      className={cn(
                        "rounded-xl border p-3.5 text-left transition-all",
                        data.budget_type === v ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/40"
                      )}
                    >
                      <p className="text-sm font-semibold text-foreground">{l}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{d}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label required>Budget Amount (₹)</Label>
                <div className="flex items-center gap-2">
                  <button onClick={() => update({ budget_amount: Math.max(100, data.budget_amount - 100) })} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-muted transition-colors">
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={100}
                    value={data.budget_amount}
                    onChange={(e) => update({ budget_amount: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-center text-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button onClick={() => update({ budget_amount: data.budget_amount + 100 })} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-muted transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  {[500, 1000, 2500, 5000].map((amt) => (
                    <button key={amt} onClick={() => update({ budget_amount: amt })} className={cn("flex-1 rounded-lg border py-1 text-xs font-semibold transition-all", data.budget_amount === amt ? "border-foreground bg-foreground/5" : "border-border text-muted-foreground hover:text-foreground")}>
                      ₹{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <input type="date" value={data.start_date} onChange={(e) => update({ start_date: e.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <input type="date" value={data.end_date} onChange={(e) => update({ end_date: e.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Budget estimate */}
              {data.budget_type === "daily" && (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5">
                  <p className="text-xs font-semibold text-foreground">Estimated Reach</p>
                  <p className="text-sm font-bold text-foreground mt-1">
                    {Math.round(data.budget_amount * 8).toLocaleString()}–{Math.round(data.budget_amount * 15).toLocaleString()} people/day
                  </p>
                  <p className="text-xs text-muted-foreground">Based on ₹{data.budget_amount}/day daily budget (estimate only)</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Creative ── */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <Label required>Primary Text</Label>
                <TextArea
                  value={data.creative.primary_text}
                  onChange={(v) => updateCreative({ primary_text: v })}
                  placeholder="Write compelling ad copy that makes people want to click…"
                  rows={4}
                />
                <p className="mt-1 text-xs text-muted-foreground text-right">{data.creative.primary_text.length}/2000</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label required>Headline</Label>
                  <TextInput value={data.creative.headline} onChange={(v) => updateCreative({ headline: v })} placeholder="Short, punchy headline" />
                </div>
                <div>
                  <Label>Description</Label>
                  <TextInput value={data.creative.description} onChange={(v) => updateCreative({ description: v })} placeholder="Optional detail line" />
                </div>
              </div>
              <div>
                <Label>Call to Action</Label>
                <select
                  value={data.creative.cta}
                  onChange={(e) => updateCreative({ cta: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {CTA_OPTIONS.map((cta) => <option key={cta} value={cta}>{cta.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <Label>Ad Image URL</Label>
                <TextInput
                  value={data.creative.media_urls[0] || ""}
                  onChange={(v) => updateCreative({ media_urls: v ? [v] : [] })}
                  placeholder="https://your-cdn.com/ad-image.jpg"
                />
                {data.creative.media_urls[0] && (
                  <div className="mt-2 rounded-xl overflow-hidden border border-border/60 max-h-40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={data.creative.media_urls[0]} alt="Ad preview" className="w-full h-40 object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                  </div>
                )}
              </div>

              {/* Live preview */}
              {data.creative.primary_text && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">AD PREVIEW</p>
                  <div className="rounded-xl overflow-hidden border border-border bg-background shadow-sm">
                    {data.creative.media_urls[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={data.creative.media_urls[0]} alt="Preview" className="w-full h-36 object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                    )}
                    <div className="p-3">
                      <p className="text-xs text-muted-foreground">Sponsored</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5">{data.creative.headline || "Your Headline"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{data.creative.primary_text}</p>
                      <button className="mt-2 w-full rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white">
                        {data.creative.cta.replace(/_/g, " ")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 6: Review ── */}
          {step === 6 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Review your campaign before publishing. You can edit it later from the dashboard.</p>
              <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
                {[
                  { label: "Campaign Name", value: data.name },
                  { label: "Objective", value: data.objective },
                  { label: "Budget", value: `₹${data.budget_amount.toLocaleString()} / ${data.budget_type}` },
                  { label: "Age Range", value: `${data.targeting.age_min}–${data.targeting.age_max}` },
                  { label: "Interests", value: data.targeting.interests.map((i) => i.name).join(", ") || "None selected" },
                  { label: "Headline", value: data.creative.headline || "—" },
                  { label: "CTA", value: data.creative.cta.replace(/_/g, " ") },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
                    <span className="text-xs font-semibold text-muted-foreground shrink-0">{label}</span>
                    <span className="text-xs text-foreground text-right">{value}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-700 dark:text-amber-400">
                <strong>Publishing to Meta:</strong> Your campaign will be submitted for Meta's ad review (typically 24–48h). It starts in "pending review" status.
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4 shrink-0">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 1 ? "Cancel" : "Back"}
          </button>

          <div className="flex items-center gap-2">
            {step === 6 ? (
              <>
                <button
                  onClick={() => handleSubmit(false)}
                  disabled={submitting}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save as Draft
                </button>
                <button
                  onClick={() => handleSubmit(true)}
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-foreground px-5 py-2 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Publish to Meta
                </button>
              </>
            ) : (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="flex items-center gap-1.5 rounded-lg bg-foreground px-5 py-2 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors disabled:opacity-40"
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
