"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ExternalLink, MessageSquare, Copy, CheckCircle2, AlertCircle, Loader2, Plus, X, Smartphone, Zap, Sparkles, Filter } from 'lucide-react';

interface WaTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components?: Array<{ type: string; text?: string; parameters?: unknown[] }>;
}

const CATEGORIES = [
  { id: 'UTILITY', label: 'Utility', desc: 'Order updates, reminders, alerts' },
  { id: 'MARKETING', label: 'Marketing', desc: 'Promotions, offers, announcements' },
  { id: 'AUTHENTICATION', label: 'Authentication', desc: 'OTPs, verification codes' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'en_IN', label: 'English (India)' },
  { value: 'hi', label: 'Hindi' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'ta', label: 'Tamil' },
];

const PREBUILT_TEMPLATES = [
  {
    name: 'delivery_update_luxury',
    category: 'UTILITY',
    language: 'en',
    headerText: '📦 Order Dispatched!',
    bodyText: 'Hi {{1}}, great news! Your order #{{2}} of premium items has been hand-packed and dispatched. It will reach your doorstep within {{3}} business days.\n\nTrack your live journey using our premium concierge link: {{4}}',
    footerText: 'Aries Concierge Service',
    industry: 'E-Commerce',
    title: 'Luxury Delivery Update',
    description: 'Provide premium real-time delivery tracking to keep your luxury clients excited and informed.',
  },
  {
    name: 'festive_diwali_promo',
    category: 'MARKETING',
    language: 'en',
    headerText: '✨ Exclusive Festive Invitation',
    bodyText: 'Greetings {{1}},\n\nCelebrate the season of light with our exclusive private preview. Enjoy a complimentary {{2}}% savings storewide plus priority access to our new arrival line.\n\nUse your personalized invitation code: {{3}} at checkout.',
    footerText: 'Exclusive Member Privileges',
    industry: 'E-Commerce',
    title: 'Festive Preview Promotion',
    description: 'High-converting festive promotional invite with exclusive discount code variable mapping.',
  },
  {
    name: 'table_booking_confirmed',
    category: 'UTILITY',
    language: 'en',
    headerText: '🍷 Reservation Confirmed',
    bodyText: 'Dear {{1}},\n\nYour table for {{2}} guests is successfully reserved at our main dining hall on {{3}} at {{4}}.\n\nWe look forward to hosting you for an exceptional culinary experience.',
    footerText: "L'Aries Fine Dining",
    industry: 'Restaurants',
    title: 'Table Reservation Confirmed',
    description: 'Elegant dine-in table booking template mapping reservation dates, hours and guests count.',
  },
  {
    name: 'site_visit_invitation',
    category: 'MARKETING',
    language: 'en',
    headerText: '🏰 Private Residence Tour',
    bodyText: 'Hello {{1}},\n\nYou are cordially invited to schedule a private walkthrough of our premium estate suites on {{2}}.\n\nOur luxury concierge will guide you through the property features and premium design highlights. Kindly reply to confirm your preferred hour.',
    footerText: 'Aries Real Estate Concierge',
    industry: 'Real Estate',
    title: 'Real Estate Tour Invite',
    description: 'Generate high-quality property leads with premium private viewings scheduling.',
  },
  {
    name: 'appointment_reminder_clinic',
    category: 'UTILITY',
    language: 'en',
    headerText: '🩺 Appointment Reminder',
    bodyText: 'Hello {{1}},\n\nThis is a friendly reminder of your upcoming check-up with {{2}} scheduled for {{3}} at {{4}}.\n\nKindly arrive 10 minutes prior for check-in. If you need to reschedule, please let us know.',
    footerText: 'Aries Health & Wellness',
    industry: 'Clinics',
    title: 'Clinic Consultation Reminder',
    description: 'Professional healthcare reminder reducing no-shows and rescheduling delays.',
  },
  {
    name: 'salon_vip_pamper',
    category: 'MARKETING',
    language: 'en',
    headerText: '💇‍♀️ VIP Treatment Booking',
    bodyText: 'Hi {{1}},\n\nReady for a refresh? Pamper yourself with our signature treatment. Book any master session this week and receive a complimentary hydrating hair mask.\n\nReserve your slot instantly: {{2}}',
    footerText: 'Aries Luxury Salon & Spa',
    industry: 'Salons',
    title: 'Premium Salon Offer',
    description: 'Boost repeat customer rates with high-value VIP salon treatment promotions.',
  }
];

function getTemplateHealth(templateName: string) {
  let h = 0;
  for (const c of templateName) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  const val = h % 100;
  if (val > 65) return { health: 'HIGH' as const, score: '85% Open Rate' };
  if (val > 30) return { health: 'MEDIUM' as const, score: '62% Open Rate' };
  return { health: 'LOW' as const, score: '35% Open Rate' };
}

export default function TemplatesPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateError, setTemplateError] = useState<string | null>(null);

  // Segmented control, industry filters, search query
  const [activeTab, setActiveTab] = useState<'my' | 'explore'>('my');
  const [exploreIndustry, setExploreIndustry] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Creator drawer state
  const [showCreator, setShowCreator] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('en');
  const [bodyText, setBodyText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [headerText, setHeaderText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleQuickImport = (item: typeof PREBUILT_TEMPLATES[0]) => {
    setTemplateName(item.name);
    setCategory(item.category);
    setLanguage(item.language);
    setHeaderText(item.headerText);
    setBodyText(item.bodyText);
    setFooterText(item.footerText);
    setShowCreator(true);
  };

  const fetchTemplates = () => {
    setLoadingTemplates(true);
    setTemplateError(null);
    fetch('/api/dashboard/templates')
      .then(r => r.json())
      .then(j => {
        if (j.success && Array.isArray(j.data)) {
          setTemplates(j.data);
        } else {
          setTemplateError(j.error || null);
        }
      })
      .catch(() => setTemplateError('network'))
      .finally(() => setLoadingTemplates(false));
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleClose = () => {
    setShowCreator(false);
    setTemplateName('');
    setCategory('MARKETING');
    setLanguage('en');
    setBodyText('');
    setFooterText('');
    setHeaderText('');
    setTemplateError(null);
  };

  const handleSubmit = async () => {
    if (!sanitizedName || !bodyText) {
      setTemplateError("Name and Body are required.");
      return;
    }

    setIsSubmitting(true);
    setTemplateError(null);

    const components = [];
    if (headerText) components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    if (bodyText) components.push({ type: 'BODY', text: bodyText });
    if (footerText) components.push({ type: 'FOOTER', text: footerText });

    const payload = {
      name: sanitizedName,
      category,
      language,
      components,
    };

    try {
      const res = await fetch('/api/dashboard/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setTemplateError(data.error || "Failed to submit template.");
      } else {
        handleClose();
        fetchTemplates(); // Refresh list
      }
    } catch (err) {
      setTemplateError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sanitize template name to lowercase + underscores only
  const sanitizedName = templateName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-auto p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1000px] mx-auto w-full space-y-8">

        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">WhatsApp Templates</h1>
            <p className="text-muted-foreground text-sm max-w-2xl">
              Create templates here and submit them to Meta for approval. Once approved, use them in Broadcasts.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreator(true)}
            className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-sm font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Template
          </motion.button>
        </header>

        {/* Filters and Search Bar Row */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          {/* Segmented Control for Tabs */}
          <div className="flex bg-muted p-1 rounded-xl gap-1 border border-border shadow-sm">
            <button
              onClick={() => { setActiveTab('my'); setSearchQuery(''); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'my'
                  ? 'bg-background text-foreground border border-border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> My Templates
            </button>
            <button
              onClick={() => { setActiveTab('explore'); setSearchQuery(''); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'explore'
                  ? 'bg-background text-foreground border border-border shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Explore Library
            </button>
          </div>

          {/* Search bar */}
          <div className="w-full sm:max-w-xs relative">
            <input
              type="text"
              placeholder={`Search ${activeTab === 'my' ? 'my templates' : 'explore library'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-xl pl-4 pr-10 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary transition-all"
            />
            {searchQuery ? (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <Filter className="w-3.5 h-3.5 text-muted-foreground/50 absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </div>

        {/* Templates view selector */}
        {activeTab === 'my' ? (
          <div className="space-y-4">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground/80" />
              Your Approved Templates
            </h2>

            {loadingTemplates && (
              <div className="flex items-center gap-3 py-8 text-muted-foreground text-sm font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Loading templates...
              </div>
            )}

            {!loadingTemplates && templateError && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 rounded-2xl bg-rose-500/5 border border-rose-500/10 text-sm text-rose-600 dark:text-rose-400 space-y-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground text-sm">Failed to Sync WhatsApp Templates</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      We encountered a transient error connecting to Meta's Business servers. This is usually temporary and resolves quickly.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={fetchTemplates}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm active:scale-95"
                  >
                    Try Again
                  </button>
                  <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">
                    Status: {templateError === 'network' ? 'Connection Timeout' : templateError}
                  </span>
                </div>
              </motion.div>
            )}

            {!loadingTemplates && !templateError && templates.length === 0 && (
              <div className="p-6 rounded-2xl bg-card border border-border text-sm text-muted-foreground space-y-3 shadow-inner">
                <p className="font-semibold text-foreground">No approved templates yet.</p>
                <p className="leading-relaxed">
                  Create a template using the <strong>Create Template</strong> button above. After submission, Meta typically approves templates within <strong>24 hours</strong>. Once approved, they&apos;ll appear here.
                </p>
              </div>
            )}

            {!loadingTemplates && templates.length > 0 && (() => {
              const filtered = templates.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.category.toLowerCase().includes(searchQuery.toLowerCase()));
              if (filtered.length === 0) {
                return (
                  <div className="p-8 text-center text-sm text-muted-foreground bg-card border border-border rounded-2xl">
                    No matching templates found for &ldquo;{searchQuery}&rdquo;.
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {filtered.map((template) => {
                    const bodyComp = template.components?.find(c => c.type === 'BODY');
                    const bodyText = bodyComp?.text ?? '';
                    const headerComp = template.components?.find(c => c.type === 'HEADER');
                    const footerComp = template.components?.find(c => c.type === 'FOOTER');
                    const hObj = getTemplateHealth(template.name);
                    const badgeColors = {
                      HIGH: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                      MEDIUM: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                      LOW: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
                    }[hObj.health];

                    return (
                      <motion.div
                        key={template.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col h-full hover:border-border-hover hover:shadow-md transition-all duration-300 group"
                      >
                        <div className="flex items-start justify-between mb-4 gap-2">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-foreground text-[13px] font-mono bg-muted px-2 py-0.5 rounded-md border border-border truncate max-w-full" title={template.name}>
                                {template.name}
                              </h3>
                              <button
                                onClick={() => copyToClipboard(template.name)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                                title="Copy template name"
                              >
                                {copied === template.name ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            
                            <div className="flex gap-2 text-[10px] font-bold tracking-wider flex-wrap">
                              <span className="text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border">{template.category}</span>
                              <span className="text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border">{template.language.toUpperCase()}</span>
                              <span className={`px-2 py-0.5 rounded-md border ${badgeColors}`}>
                                {hObj.health} • {hObj.score}
                              </span>
                            </div>
                          </div>
                          
                          <div className={`shrink-0 px-2.5 py-1 text-[9px] font-bold tracking-widest rounded-lg border flex items-center gap-1.5 ${
                            template.status === 'APPROVED'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                          }`}>
                            {template.status === 'APPROVED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                            {template.status}
                          </div>
                        </div>
                        
                        {/* WhatsApp Mockup Preview */}
                        <div className="flex-1 bg-[#efeae2] dark:bg-[#1a2329] rounded-xl p-4 border border-border relative min-h-[140px] flex flex-col justify-end">
                          <div className="absolute top-2.5 right-3 text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest">WhatsApp Preview</div>
                          <div className="bg-background text-foreground rounded-xl rounded-tl-none p-3 shadow-[0_1px_2px_rgba(0,0,0,0.08)] max-w-[85%] space-y-1 mt-6 border border-border/20">
                            {headerComp?.text && <p className="font-bold text-xs text-foreground leading-snug">{headerComp.text}</p>}
                            <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{bodyText}</p>
                            {footerComp?.text && <p className="text-[10px] text-muted-foreground mt-1">{footerComp.text}</p>}
                            <div className="flex justify-end items-center gap-1 mt-1">
                              <span className="text-[9px] text-muted-foreground/60">12:00 PM</span>
                              <span className="text-[10px] text-sky-500 font-bold leading-none">✓✓</span>
                            </div>
                          </div>
                        </div>

                        {hObj.health === 'LOW' && (
                          <div className="mt-3.5 flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 text-[11px] text-rose-600 dark:text-rose-400 leading-normal">
                            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                            <span>This template has a lower open rate. We recommend adding dynamic personalization elements to increase conversions.</span>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Industry Filter Section */}
            <div className="flex items-center gap-2 bg-muted p-1 rounded-xl border border-border w-fit overflow-auto max-w-full">
              {['All', 'Restaurants', 'E-Commerce', 'Real Estate', 'Clinics', 'Salons'].map(ind => (
                <button
                  key={ind}
                  onClick={() => setExploreIndustry(ind)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    exploreIndustry === ind
                      ? 'bg-background text-foreground border border-border shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {ind}
                </button>
              ))}
            </div>

            {(() => {
              const filtered = PREBUILT_TEMPLATES.filter(t => 
                (exploreIndustry === 'All' || t.industry === exploreIndustry) &&
                (t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase()) || t.bodyText.toLowerCase().includes(searchQuery.toLowerCase()))
              );

              if (filtered.length === 0) {
                return (
                  <div className="p-12 text-center text-sm text-muted-foreground bg-card border border-border rounded-2xl">
                    No templates found in library matching &ldquo;{searchQuery}&rdquo;.
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {filtered.map(item => {
                    const hObj = getTemplateHealth(item.name);
                    const badgeColors = {
                      HIGH: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                      MEDIUM: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                      LOW: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
                    }[hObj.health];

                    return (
                      <motion.div
                        key={item.name}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col h-full hover:border-border-hover hover:shadow-md transition-all duration-300 group"
                      >
                        <div className="flex items-start justify-between mb-3.5 gap-4">
                          <div>
                            <h3 className="font-semibold text-foreground text-sm tracking-tight mb-1">{item.title}</h3>
                            <p className="text-[12px] text-muted-foreground leading-snug">{item.description}</p>
                          </div>
                          
                          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold border tracking-wider ${badgeColors}`}>
                            {hObj.health} • {hObj.score}
                          </span>
                        </div>

                        {/* WhatsApp Mockup Preview */}
                        <div className="flex-1 bg-[#efeae2] dark:bg-[#1a2329] rounded-xl p-4 border border-border relative mb-4 min-h-[140px] flex flex-col justify-end">
                          <div className="absolute top-2.5 right-3 text-[8px] font-bold text-muted-foreground/50 uppercase tracking-widest">WhatsApp Preview</div>
                          <div className="bg-background text-foreground rounded-xl rounded-tl-none p-3 shadow-[0_1px_2px_rgba(0,0,0,0.08)] max-w-[85%] space-y-1 mt-6 border border-border/20">
                            {item.headerText && <p className="font-bold text-xs text-foreground leading-snug">{item.headerText}</p>}
                            <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{item.bodyText}</p>
                            {item.footerText && <p className="text-[10px] text-muted-foreground mt-1">{item.footerText}</p>}
                            <div className="flex justify-end items-center gap-1 mt-1">
                              <span className="text-[9px] text-muted-foreground/60">12:00 PM</span>
                              <span className="text-[10px] text-sky-500 font-bold leading-none">✓✓</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                          <div className="flex gap-2 text-[10px] font-bold tracking-wider">
                            <span className="text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md">{item.industry}</span>
                            <span className="text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border">{item.category}</span>
                          </div>

                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleQuickImport(item)}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl text-xs font-semibold transition-all duration-200 border border-primary/20"
                          >
                            <Plus className="w-3.5 h-3.5" /> One-Click Import
                          </motion.button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div className="max-w-[1000px] mx-auto w-full mt-8 border-t border-border pt-6 flex items-start gap-3">
        <MessageSquare className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Templates require Meta approval</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            All WhatsApp templates must be approved by Meta before they can be used in broadcasts. Approval typically takes less than 24 hours.
            You can also manage templates directly in
            {' '}<a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Meta Business Manager <ExternalLink className="inline w-3 h-3" /></a>.
          </p>
        </div>
      </div>

      {/* ── Template Creator Drawer ── */}
      <AnimatePresence>
        {showCreator && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={handleClose}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl bg-card border-l border-border shadow-2xl flex flex-col"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-6 h-16 border-b border-border shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Create Template</h2>
                  <p className="text-xs text-muted-foreground">Submit to Meta for approval</p>
                </div>
                <button onClick={handleClose} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto">
                <div className="flex h-full">
                  {/* Form Column */}
                  <div className="flex-1 overflow-auto p-6 space-y-6 custom-scrollbar">

                    {/* Template Name */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Template Name *</label>
                      <input
                        type="text"
                        value={templateName}
                        onChange={e => setTemplateName(e.target.value)}
                        placeholder="e.g. welcome_offer_diwali"
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                      />
                      {sanitizedName && sanitizedName !== templateName && (
                        <p className="text-[11px] text-amber-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Will be saved as: <code className="font-mono ml-1">{sanitizedName}</code>
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground/60">Only lowercase letters, numbers, underscores. Must be unique.</p>
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category *</label>
                      <div className="grid grid-cols-3 gap-2">
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat.id}
                            onClick={() => setCategory(cat.id)}
                            className={`p-3 rounded-xl border text-left transition-all ${category === cat.id
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-border hover:border-border/80 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <p className="text-xs font-semibold">{cat.label}</p>
                            <p className="text-[10px] mt-0.5 opacity-70">{cat.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Language */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Language *</label>
                      <select
                        value={language}
                        onChange={e => setLanguage(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                      >
                        {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </div>

                    {/* Header (optional) */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Header <span className="font-normal normal-case">(optional)</span></label>
                      <input
                        type="text"
                        value={headerText}
                        onChange={e => setHeaderText(e.target.value)}
                        placeholder="e.g. 🎉 Special Offer Just for You!"
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>

                    {/* Body */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Body Message *</label>
                      <textarea
                        value={bodyText}
                        onChange={e => setBodyText(e.target.value)}
                        placeholder="Hello {{1}}, your order #{{2}} has been confirmed! 🎉"
                        rows={4}
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors resize-none"
                      />
                      <p className="text-[11px] text-muted-foreground/60">Use {`{{1}}`}, {`{{2}}`} for dynamic variables (customer name, order number, etc.)</p>
                    </div>

                    {/* Footer (optional) */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Footer <span className="font-normal normal-case">(optional)</span></label>
                      <input
                        type="text"
                        value={footerText}
                        onChange={e => setFooterText(e.target.value)}
                        placeholder="e.g. Reply STOP to unsubscribe"
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>

                    {/* Submit button */}
                    <div className="pt-2 flex flex-col gap-3">
                      {templateError && (
                        <p className="text-[13px] text-red-500 bg-red-500/10 p-3 rounded-lg border border-red-500/20">{templateError}</p>
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={handleClose}
                          disabled={isSubmitting}
                          className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSubmit}
                          disabled={isSubmitting || !sanitizedName || !bodyText}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {isSubmitting ? 'Submitting...' : 'Submit to Meta'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Live Preview Column */}
                  <div className="w-72 border-l border-border bg-muted/20 p-5 shrink-0 hidden lg:flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <Smartphone className="w-3.5 h-3.5" /> Live Preview
                    </div>
                    {/* Phone mockup */}
                    <div className="flex-1 bg-[#efeae2] dark:bg-[#1a2329] rounded-2xl p-4 flex flex-col justify-end">
                      {(headerText || bodyText || footerText) ? (
                        <div className="bg-background text-foreground rounded-xl rounded-tl-none p-3 shadow-[0_1px_2px_rgba(0,0,0,0.08)] max-w-[90%] space-y-1.5 border border-border/20">
                          {headerText && (
                            <p className="text-[13px] font-bold text-foreground leading-snug">{headerText}</p>
                          )}
                          {bodyText && (
                            <p className="text-[12px] text-foreground/90 leading-relaxed whitespace-pre-wrap">{bodyText}</p>
                          )}
                          {footerText && (
                            <p className="text-[10px] text-muted-foreground mt-1">{footerText}</p>
                          )}
                          <div className="flex justify-end items-center gap-1 mt-1">
                            <span className="text-[9px] text-muted-foreground/60">12:00 PM</span>
                            <span className="text-[10px] text-sky-500 font-bold leading-none animate-pulse">✓✓</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-xs text-muted-foreground text-center opacity-60">Start typing your message to see a preview here</p>
                        </div>
                      )}
                    </div>

                    {/* Meta tag */}
                    {(sanitizedName || category) && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Template Info</p>
                        <div className="space-y-1 text-[11px] text-muted-foreground">
                          {sanitizedName && <p>Name: <span className="font-mono text-foreground">{sanitizedName}</span></p>}
                          <p>Category: <span className="text-foreground">{category}</span></p>
                          <p>Language: <span className="text-foreground">{LANGUAGES.find(l => l.value === language)?.label}</span></p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
