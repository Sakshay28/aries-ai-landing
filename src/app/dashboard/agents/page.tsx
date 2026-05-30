"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Sparkles, MessageSquare, Loader2, AlertCircle, Save, CheckCircle2,
  X, RefreshCw, UploadCloud, Library, Plus, Trash2, HelpCircle,
  Clock, HardDrive, FileText, Check, AlertTriangle, Send, ShieldAlert,
  ArrowRight, Sparkle, UserCheck, Play, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FeaturePageGate } from '../_layout/FeaturePageGate';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────
interface FAQ {
  question: string;
  answer: string;
}

interface KnowledgeDoc {
  id: string;
  filename: string;
  file_type: string;
  content_text: string;
  created_at: string;
}

interface DraftConfig {
  bot_name: string;
  bot_personality: string;
  welcome_message: string;
  welcome_offer: string;
  usps: string[];
  system_prompt: string;
  custom_faqs: FAQ[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ────────────────────────────────────────────────────────────
// Native Starter Templates Data
// ────────────────────────────────────────────────────────────
const STARTER_TEMPLATES = [
  {
    id: 'premium_fine_dining',
    label: '🍷 Premium Fine Dining',
    description: 'Elegant, formal tone optimized for table reservations and upsells.',
    config: {
      bot_personality: 'Premium Fine Dining',
      welcome_message: 'Hi! Welcome to our restaurant. Would you like to reserve a premium table or view our chef’s specials today? 🍷',
      welcome_offer: 'Receive a complimentary chef’s dessert when you reserve a table online today!',
      usps: ['Valet Parking', 'Fine Italian Wines', 'Award-Winning Truffle Risotto', 'Private Dining Rooms'],
      system_prompt: '- Always encourage table reservations first.\n- Speak elegantly, politely, and formally.\n- Recommend premium dishes like the Truffle Risotto or Dry-Aged Ribeye.\n- Never offer discounts without manager approval.\n- Ensure diners feel pampered and highly valued.',
      custom_faqs: [
        { question: 'Do you offer valet parking?', answer: 'Yes, we offer complimentary valet parking for all our dining guests at the entrance.' },
        { question: 'What is your cancellation policy?', answer: 'Reservations can be canceled or rescheduled up to 2 hours before the booking time without any fee.' }
      ]
    }
  },
  {
    id: 'cafe_setup',
    label: '☕ Cafe Setup',
    description: 'Warm, casual neighborhood cafe vibe focusing on speed and pick-ups.',
    config: {
      bot_personality: 'Cafe Friendly',
      welcome_message: 'Hey there! Welcome to our cafe. ☕ What fresh brew or pastry can we get ready for you today?',
      welcome_offer: 'Get 10% off on your first organic espresso order! Use code BREW10',
      usps: ['Organic Coffee', 'Daily Fresh Croissants', 'High-Speed Wi-Fi', 'Pet Friendly'],
      system_prompt: '- Speak like a warm, cheerful, and casual local barista.\n- Focus on speed, convenience, and direct answers.\n- Recommend daily specials, fresh pastries, and pickup ordering links.\n- Keep responses highly personal and conversational.',
      custom_faqs: [
        { question: 'Do you have dairy-free milk options?', answer: 'Absolutely! We offer Oat, Almond, and Soy milk for all our coffee beverages at no extra charge.' },
        { question: 'Is there seating for work?', answer: 'Yes, we have high-speed Wi-Fi and plenty of power outlets, perfect for working or studying!' }
      ]
    }
  },
  {
    id: 'fast_casual',
    label: '🍔 Fast Casual',
    description: 'Quick, friendly, and highly conversational, optimized for online ordering.',
    config: {
      bot_personality: 'Fast Casual',
      welcome_message: 'Hi there! Welcome to our restaurant. Ready to place a quick order or reserve a group table today? 🍔 We’re fired up and ready to serve!',
      welcome_offer: 'Buy any burger combo and get free fries! Order online with code BURGERFEST',
      usps: ['10-Min Prep Time', 'Flame-Grilled Burgers', 'Family Meal Combos', 'Local Delivery'],
      system_prompt: '- Focus on speed, convenience, and extremely direct answers.\n- Recommend popular combos and direct delivery ordering links.\n- Keep replies extremely active, brief, and under 2 lines.\n- Always be enthusiastic and friendly.',
      custom_faqs: [
        { question: 'Do you deliver directly?', answer: 'Yes! We deliver directly within a 5km radius when ordered via our website, or you can find us on Swiggy and Zomato.' },
        { question: 'What are your popular dishes?', answer: 'Our absolute bestsellers are the Classic Flame-Grilled Cheeseburger and the Spicy Buffalo Wings!' }
      ]
    }
  },
  {
    id: 'luxury_hospitality',
    label: '🏨 Luxury Hospitality',
    description: 'Ultra-attentive, highly concierge-like tone for premium reservations.',
    config: {
      bot_personality: 'Luxury Hospitality',
      welcome_message: 'Welcome to our lounge. It is our absolute pleasure to assist you today. How may we serve you? ✨',
      welcome_offer: 'Enjoy complimentary VIP lounge access and a welcome drink with any private booking.',
      usps: ['VIP Concierge Service', 'Private Event Lounges', 'Award-Winning Mixology', 'Bespoke Menu Customization'],
      system_prompt: '- Maintain an ultra-premium, highly attentive, and proactive concierge tone.\n- Always prioritize private events and VIP lounge booking options.\n- Refer to guests by name respectfully and ensure they feel pampered.\n- Speak elegantly and handle all requests with extreme care.',
      custom_faqs: [
        { question: 'How do I book a private event?', answer: 'Simply share your preferred date, time, and guest count, and our dedicated VIP concierge manager will contact you directly to curate the experience.' },
        { question: 'Is there a dress code?', answer: 'We maintain a smart casual dress code to ensure a premium atmosphere for all our lounge guests.' }
      ]
    }
  }
];

// ────────────────────────────────────────────────────────────
// Persona Helper Texts
// ────────────────────────────────────────────────────────────
const PERSONA_HELPERS: Record<string, string> = {
  'Premium Fine Dining': 'Elegant, polite, formal tone optimized for reservations and premium dining.',
  'Fast Casual': 'High-energy, fast, friendly voice focusing on quick dining and takeaways.',
  'Luxury Hospitality': 'Attentive, concierge-style premium service for high-end lounges and VIPs.',
  'Cafe Friendly': 'Warm, casual, conversational, and approachable neighborhood barista style.',
  'Reservations First': 'Highly focused and conversion-optimized to guide diners to a booking.',
  'Upsell Specialist': 'Proactively highlights weekday promotions, specials, and premium table seating.'
};

// ────────────────────────────────────────────────────────────
// Suggested Guidelines Chips
// ────────────────────────────────────────────────────────────
const SUGGESTED_CHIPS = [
  'Ask guest count first',
  'Recommend chef specials',
  'Mention free valet parking',
  'Promote current weekday offers',
  'Upsell premium seating',
  'Never offer discounts without approval',
  'Speak in a premium but friendly tone',
  'Ask for allergy details before confirming'
];

export default function AISettingsPage() {
  const [draft, setDraft] = useState<DraftConfig>({
    bot_name: '',
    bot_personality: 'Premium Fine Dining',
    welcome_message: '',
    welcome_offer: '',
    usps: [],
    system_prompt: '',
    custom_faqs: []
  });
  
  const [original, setOriginal] = useState<DraftConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  
  // Knowledge docs & stats state
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newFaqQuestion, setNewFaqQuestion] = useState('');
  const [newFaqAnswer, setNewFaqAnswer] = useState('');
  
  // Playground Chat Simulator States
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check dirty state
  useEffect(() => {
    if (!original) return;
    const isDirty = JSON.stringify(draft) !== JSON.stringify(original);
    setDirty(isDirty);
  }, [draft, original]);

  // Prompt before unload hook
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = 'You have unpublished AI changes. Leave anyway?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  // Load configuration & documents on mount
  useEffect(() => {
    loadAllData();
  }, []);

  // Pre-populate chat simulator on mount for premium showroom experience
  useEffect(() => {
    if (chatHistory.length === 0) {
      setChatHistory([
        { role: 'user', content: 'Table for 4 tomorrow?', timestamp: new Date(Date.now() - 3 * 60 * 1000) },
        { role: 'assistant', content: 'Certainly! May I know your preferred time?', timestamp: new Date(Date.now() - 2.5 * 60 * 1000) },
        { role: 'user', content: 'Around 8 PM', timestamp: new Date(Date.now() - 2 * 60 * 1000) },
        { role: 'assistant', content: 'Great, I can help with that. May I have your name and phone number?', timestamp: new Date(Date.now() - 1.5 * 60 * 1000) }
      ]);
    }
  }, []);

  // Auto-scroll chat simulator
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      // 1. Fetch AI & Tenant settings
      const settingsRes = await fetch('/api/dashboard/settings');
      const settingsData = await settingsRes.json();
      
      // 2. Fetch Knowledge Docs
      const docsRes = await fetch('/api/dashboard/knowledge');
      const docsData = await docsRes.json();

      if (settingsData.success) {
        const d = {
          bot_name: settingsData.data.bot_name || 'Assistant',
          bot_personality: settingsData.data.bot_personality || 'Premium Fine Dining',
          welcome_message: settingsData.data.welcome_message || '',
          welcome_offer: settingsData.data.welcome_offer || '',
          usps: settingsData.data.usps || [],
          system_prompt: settingsData.data.system_prompt || '',
          custom_faqs: settingsData.data.custom_faqs || []
        };
        setDraft(d);
        setOriginal(JSON.parse(JSON.stringify(d)));
      } else {
        toast.error('Failed to load AI configuration');
      }

      if (docsData.success) {
        setDocs(docsData.docs || []);
      }
    } catch {
      toast.error('Network error loading data');
    } finally {
      setLoading(false);
    }
  };

  const update = useCallback(<K extends keyof DraftConfig>(key: K, value: DraftConfig[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleApplyTemplate = (tplConfig: Partial<DraftConfig>) => {
    setDraft(prev => ({
      ...prev,
      ...tplConfig
    }));
    toast.success('Starter template loaded! Type in the simulator to test it.');
  };

  const handleAddChip = (chipText: string) => {
    const current = draft.system_prompt.trim();
    const cleanChip = `- ${chipText}`;
    if (draft.system_prompt.includes(chipText)) {
      toast.error('Instruction already exists');
      return;
    }
    const updated = current ? `${current}\n${cleanChip}` : cleanChip;
    update('system_prompt', updated);
    toast.success('Staff guideline added!');
  };

  // ── Inline FAQ Management ──
  const handleAddFaq = () => {
    const q = newFaqQuestion.trim();
    const a = newFaqAnswer.trim();
    if (!q || !a) {
      toast.error('Both Question and Answer are required');
      return;
    }
    const updatedFaqs = [...draft.custom_faqs, { question: q, answer: a }];
    update('custom_faqs', updatedFaqs);
    setNewFaqQuestion('');
    setNewFaqAnswer('');
    toast.success('FAQ added!');
  };

  const handleRemoveFaq = (index: number) => {
    const updated = draft.custom_faqs.filter((_, i) => i !== index);
    update('custom_faqs', updated);
    toast.success('FAQ removed');
  };

  // ── RAG Knowledge File Uploader ──
  const handleFileUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const accepted = ['txt', 'md', 'csv', 'json', 'pdf'];
    if (!ext || !accepted.includes(ext)) {
      toast.error(`Unsupported file type. Accepted: ${accepted.map(a => `.${a}`).join(', ')}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10 MB');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);

    try {
      const res = await fetch('/api/dashboard/knowledge', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        toast.success(`${file.name} trained successfully!`);
        // reload knowledge list
        const docsRes = await fetch('/api/dashboard/knowledge');
        const docsData = await docsRes.json();
        if (docsData.success) setDocs(docsData.docs || []);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDocDelete = async (docId: string, filename: string) => {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/dashboard/knowledge?id=${docId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Document deleted');
        setDocs(prev => prev.filter(d => d.id !== docId));
      } else {
        toast.error('Failed to delete document');
      }
    } catch {
      toast.error('Network error');
    }
  };

  // ── Sandbox Live Simulator ──
  const handleSendMessage = async (e?: React.FormEvent, customMsg?: string) => {
    e?.preventDefault();
    const msg = customMsg || inputValue.trim();
    if (!msg || sendingMsg) return;

    if (!customMsg) setInputValue('');
    const newMsg: ChatMessage = { role: 'user', content: msg, timestamp: new Date() };
    setChatHistory(prev => [...prev, newMsg]);
    setSendingMsg(true);

    // Prepare draft chat history payload format
    const historyPayload = chatHistory.map(m => ({
      role: m.role,
      content: m.content
    }));

    try {
      const res = await fetch('/api/dashboard/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: historyPayload,
          draftConfig: draft
        })
      });
      const json = await res.json();

      if (json.success && json.data) {
        const replyMsg: ChatMessage = {
          role: 'assistant',
          content: json.data.reply,
          timestamp: new Date()
        };
        setChatHistory(prev => [...prev, replyMsg]);
      } else {
        toast.error(json.error || 'Failed to simulate response');
      }
    } catch {
      toast.error('Network error contacting playground');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleTrySampleConversation = () => {
    handleSendMessage(undefined, "Hi, I want dinner for 2 tonight");
  };

  const handleResetChat = () => {
    setChatHistory([
      { role: 'user', content: 'Table for 4 tomorrow?', timestamp: new Date() },
      { role: 'assistant', content: 'Certainly! May I know your preferred time?', timestamp: new Date() }
    ]);
    toast.success('Simulation chat reset');
  };

  // ── Publish Configuration ──
  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      });
      const data = await res.json();

      if (data.success) {
        setOriginal(JSON.parse(JSON.stringify(draft)));
        setDirty(false);
        toast.success(
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-emerald-500">✅ AI Updated Successfully</span>
            <span className="text-xs text-muted-foreground">Your WhatsApp staff member has learned the new instructions.</span>
          </div>,
          { duration: 4000 }
        );
      } else {
        toast.error(data.error || 'Failed to publish changes');
      }
    } catch {
      toast.error('Network error publishing changes');
    } finally {
      setPublishing(false);
    }
  };

  // Loading indicator
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  // Pre-fill check to render Onboarding Quick Start templates
  const showQuickStart = !draft.welcome_message && !draft.system_prompt && draft.custom_faqs.length === 0;

  return (
    <FeaturePageGate feature="AI Agents" allowedPlans={["growth", "pro", "enterprise"]}>
      <div className="flex flex-col lg:flex-row h-full bg-background text-foreground overflow-hidden font-sans relative">
        
        {/* Workspace Panel (Left 65%) */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6 lg:max-w-[65%] border-r border-border/60 pb-24">
          
          {/* Header */}
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">AI Staff Manager</h1>
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Active
                </span>
              </div>
              <p className="text-sm mt-1 text-muted-foreground leading-relaxed">
                Design the personality, instructions, and facts for your 24/7 automated WhatsApp staff member.
              </p>
            </div>
            
            {/* Publish button */}
            <motion.button
              whileHover={{ scale: 1.02, boxShadow: '0 0 15px rgba(16,185,129,0.3)' }}
              whileTap={{ scale: 0.98 }}
              onClick={handlePublish}
              disabled={publishing || !dirty}
              className="flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-bold transition-all shadow-lg focus:outline-none shrink-0"
              style={{
                background: dirty ? '#10B981' : 'var(--muted)',
                color: dirty ? 'white' : 'var(--muted-foreground)',
                cursor: dirty ? 'pointer' : 'not-allowed',
                border: dirty ? '1px solid rgba(16,185,129,0.4)' : '1px solid transparent'
              }}
            >
              {publishing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkle className="w-4 h-4" />
              )}
              {publishing ? 'Publishing...' : 'Publish AI Changes'}
            </motion.button>
          </header>

          {/* ONBOARDING QUICK START WIZARD */}
          {showQuickStart ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 rounded-3xl border bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 relative overflow-hidden"
              style={{ borderColor: 'rgba(16,185,129,0.15)' }}
            >
              <div className="flex items-start gap-4">
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-500 shrink-0">
                  <Sparkles className="w-7 h-7 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-foreground">Meet Your New AI Staff Member</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Select your restaurant style below to instantly pre-fill industry-expert personalities, guidelines, and FAQs in 15 seconds!
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                {STARTER_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => handleApplyTemplate(tpl.config)}
                    className="p-5 rounded-2xl border border-border/80 bg-card hover:border-emerald-500/50 hover:bg-emerald-500/[0.02] text-left transition-all group duration-200"
                  >
                    <div className="font-bold text-sm text-foreground flex items-center justify-between">
                      {tpl.label}
                      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{tpl.description}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <>
              {/* SECTION 1: PERSONALITY & BRAND */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-secondary/30">
                  <Bot className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground uppercase tracking-wider">Personality & Brand</span>
                </div>
                
                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Bot Name</label>
                      <input
                        value={draft.bot_name}
                        onChange={e => update('bot_name', e.target.value)}
                        placeholder="e.g. Aria"
                        className="w-full h-10 px-3 rounded-xl text-sm border border-border bg-background outline-none transition-all focus:border-foreground/30"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">AI Persona & Tone</label>
                      <select
                        value={draft.bot_personality}
                        onChange={e => update('bot_personality', e.target.value)}
                        className="w-full h-10 px-3 rounded-xl text-sm border border-border bg-background outline-none transition-all focus:border-foreground/30 text-foreground"
                      >
                        <option value="Premium Fine Dining">Premium Fine Dining</option>
                        <option value="Fast Casual">Fast Casual</option>
                        <option value="Luxury Hospitality">Luxury Hospitality</option>
                        <option value="Cafe Friendly">Cafe Friendly</option>
                        <option value="Reservations First">Reservations First</option>
                        <option value="Upsell Specialist">Upsell Specialist</option>
                      </select>
                      <p className="text-[11px] text-muted-foreground italic mt-1 pl-1">
                        * {PERSONA_HELPERS[draft.bot_personality] || PERSONA_HELPERS['Premium Fine Dining']}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Welcome Message</label>
                    <textarea
                      value={draft.welcome_message}
                      onChange={e => update('welcome_message', e.target.value)}
                      placeholder="Hi! Welcome to our restaurant. Would you like to reserve a table or view our specials?"
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl text-sm border border-border bg-background outline-none transition-all resize-none focus:border-foreground/30"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Welcome Offer / Promotion</label>
                    <input
                      value={draft.welcome_offer}
                      onChange={e => update('welcome_offer', e.target.value)}
                      placeholder="e.g. Free chef's dessert when booking online!"
                      className="w-full h-10 px-3 rounded-xl text-sm border border-border bg-background outline-none transition-all focus:border-foreground/30"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Unique Selling Points (USPs)</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {draft.usps.map((usp, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                          {usp}
                          <button onClick={() => update('usps', draft.usps.filter((_, idx) => idx !== i))}>
                            <X className="w-3 h-3 text-emerald-600" />
                          </button>
                        </span>
                      ))}
                      {draft.usps.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">Add core strengths to help AI handle objections...</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val && !draft.usps.includes(val)) {
                              update('usps', [...draft.usps, val]);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                        placeholder="Type USP (e.g. Free Valet Parking) and press Enter"
                        className="flex-1 h-9 px-3 rounded-xl text-sm border border-border bg-background outline-none transition-all focus:border-foreground/30"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: STAFF GUIDELINES & CUSTOM FAQS */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-secondary/30">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-bold text-foreground uppercase tracking-wider">Guidelines & Knowledge</span>
                </div>

                <div className="p-6 space-y-6">
                  
                  {/* Guidelines Editor */}
                  <div className="space-y-3">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground block">
                        Staff Guidelines
                      </label>
                      <span className="text-[11px] text-muted-foreground">
                        Tell your AI how staff should behave:
                      </span>
                    </div>
                    <textarea
                      value={draft.system_prompt}
                      onChange={e => update('system_prompt', e.target.value)}
                      placeholder={`- Always ask guest count before reservations\n- Recommend chef specials\n- Mention valet parking`}
                      rows={6}
                      className="w-full px-3 py-3 rounded-xl text-sm font-mono border border-border bg-background outline-none transition-all resize-none focus:border-foreground/30 leading-relaxed"
                    />
                    
                    {/* Suggested Chips */}
                    <div className="space-y-1.5 mt-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quick-Add Suggested Guidelines:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {SUGGESTED_CHIPS.map(chip => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => handleAddChip(chip)}
                            className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-border/80 bg-secondary/40 hover:border-emerald-500/30 hover:bg-emerald-500/[0.03] transition-all"
                          >
                            + {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Inline FAQ Manager */}
                  <div className="space-y-4 pt-4 border-t border-border">
                    <label className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground block">
                      Custom FAQs Q&A List
                    </label>
                    
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {draft.custom_faqs.map((faq, i) => (
                        <div key={i} className="p-3 rounded-xl border border-border bg-background/50 flex justify-between gap-3 text-xs leading-relaxed">
                          <div className="space-y-1">
                            <div className="font-bold text-foreground">Q: {faq.question}</div>
                            <div className="text-muted-foreground">A: {faq.answer}</div>
                          </div>
                          <button onClick={() => handleRemoveFaq(i)} className="text-muted-foreground hover:text-red-500 p-1 self-start transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {draft.custom_faqs.length === 0 && (
                        <div className="text-xs text-muted-foreground italic text-center py-4 border border-dashed rounded-xl">
                          No custom Q&A pairs added. Put quick questions here instead of creating whole documents.
                        </div>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl border border-border bg-secondary/20 space-y-3">
                      <div className="text-xs font-bold text-foreground">Add New FAQ Pair</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          value={newFaqQuestion}
                          onChange={e => setNewFaqQuestion(e.target.value)}
                          placeholder="e.g. Do you have outdoor seating?"
                          className="h-9 px-3 rounded-xl text-xs border border-border bg-background outline-none"
                        />
                        <input
                          value={newFaqAnswer}
                          onChange={e => setNewFaqAnswer(e.target.value)}
                          placeholder="e.g. Yes, we have a beautiful heated outdoor garden."
                          className="h-9 px-3 rounded-xl text-xs border border-border bg-background outline-none"
                        />
                      </div>
                      <button
                        onClick={handleAddFaq}
                        className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-bold bg-secondary hover:bg-secondary/80 border border-border text-foreground transition-all ml-auto"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add FAQ
                      </button>
                    </div>
                  </div>

                  {/* Knowledge Base Health Card */}
                  <div className="space-y-4 pt-4 border-t border-border">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
                        Knowledge Health & RAG Files
                      </label>
                      
                      {/* File Upload action trigger */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-foreground text-background hover:opacity-90 disabled:opacity-50 transition-all"
                      >
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                        {uploading ? 'Training...' : 'Upload File'}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                        accept=".txt,.md,.csv,.json,.pdf"
                      />
                    </div>

                    {/* Health Signals */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl border bg-background/30 text-center">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Menu Knowledge</div>
                        <div className="text-xs font-bold mt-1 text-foreground">
                          {docs.length > 0 ? `${docs.length} Active` : 'Not Added'}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl border bg-background/30 text-center">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">FAQ Coverage</div>
                        <div className="text-xs font-bold mt-1 text-foreground">{draft.custom_faqs.length} Items</div>
                      </div>
                      <div className="p-3 rounded-xl border bg-background/30 text-center">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sync Status</div>
                        <div className="text-xs font-bold mt-1 text-emerald-500">Healthy</div>
                      </div>
                      <div className="p-3 rounded-xl border bg-background/30 text-center">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">AI Status</div>
                        <div className="text-[11px] font-bold mt-1 text-foreground truncate">Ready to Answer</div>
                      </div>
                    </div>

                    {/* Docs list */}
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {docs.map(doc => {
                        const ext = doc.file_type || doc.filename.split('.').pop() || 'txt';
                        return (
                          <div key={doc.id} className="flex items-center justify-between p-3 bg-background border border-border/80 rounded-xl hover:border-border transition-colors text-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="p-2 rounded-lg bg-secondary/50">
                                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-foreground truncate">{doc.filename}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Trained successfully</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDocDelete(doc.id, doc.filename)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      {docs.length === 0 && (
                        <div className="text-xs text-muted-foreground italic text-center py-4 border border-dashed rounded-xl">
                          No menu uploaded yet. Upload PDFs or text menus in 1 click.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Live Simulator Preview Panel (Right 35%) */}
        <div className="w-full lg:w-[35%] bg-secondary/15 flex flex-col p-6 lg:p-8 shrink-0 overflow-y-auto max-h-screen">
          <div className="w-full max-w-sm mx-auto flex flex-col h-full bg-[#080F1E] rounded-[36px] border-8 border-slate-900 shadow-2xl relative overflow-hidden min-h-[560px]">
            
            {/* Phone Speaker & Notch */}
            <div className="absolute top-0 inset-x-0 h-6 bg-slate-900 flex items-center justify-center z-20">
              <div className="w-16 h-4 rounded-full bg-black flex items-center justify-center">
                <div className="w-8 h-1 rounded-full bg-slate-800" />
              </div>
            </div>

            {/* Mock Chat Header */}
            <div className="px-5 pt-8 pb-3 bg-slate-900 flex items-center justify-between shrink-0 z-10 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0">
                  <Bot className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white leading-tight">{draft.bot_name || 'Assistant'}</h4>
                  <span className="inline-flex items-center gap-1 mt-0.5 text-[9px] font-bold bg-white/10 px-2 py-0.5 rounded-full text-slate-300">
                    👤 Customer Simulation
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetChat}
                  title="Reset Conversation"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Unsaved Draft mode trust indicator banner */}
            <div className="bg-[#121E31] px-4 py-2 border-b border-white/5 flex items-center justify-center shrink-0">
              {dirty ? (
                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                  <AlertTriangle className="w-3 h-3 animate-pulse" /> Draft Mode • Unsaved changes testing
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                  <Check className="w-3 h-3" /> Live Mode • Testing published config
                </span>
              )}
            </div>

            {/* Mock messages container list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 flex flex-col">
              
              {/* Bot standard welcome intro */}
              <div className="max-w-[85%] self-start rounded-2xl px-3.5 py-2.5 text-xs bg-slate-800 text-slate-200 rounded-tl-none leading-relaxed border border-slate-700/30 shadow-sm">
                {draft.welcome_message || `Hi! Welcome to our restaurant. How can I help you today?`}
              </div>

              {chatHistory.map((m, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm",
                    m.role === 'user'
                      ? "self-end bg-emerald-600 text-white rounded-tr-none"
                      : "self-start bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700/30"
                  )}
                >
                  {m.content}
                </div>
              ))}

              {sendingMsg && (
                <div className="self-start rounded-2xl px-3.5 py-2.5 bg-slate-800 border border-slate-700/30 text-slate-400 rounded-tl-none flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                  <span className="text-[10px] tracking-wide font-medium">Assistant is thinking...</span>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Try Sample Conversation Button */}
            <div className="px-4 py-2 bg-slate-950/40 border-t border-white/5 flex justify-center shrink-0">
              <button
                type="button"
                onClick={handleTrySampleConversation}
                disabled={sendingMsg}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all"
              >
                <Play className="w-3 h-3 fill-current" /> Try Sample Conversation
              </button>
            </div>

            {/* Mock input text editor */}
            <form onSubmit={handleSendMessage} className="p-3 bg-slate-900 border-t border-white/5 flex gap-2 shrink-0 z-10">
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                disabled={sendingMsg}
                placeholder="Type a mock message..."
                className="flex-1 h-9 px-3 text-xs rounded-xl bg-slate-850 border border-slate-800 outline-none text-white placeholder:text-slate-500 focus:border-emerald-500/40"
              />
              <button
                type="submit"
                disabled={sendingMsg || !inputValue.trim()}
                className="h-9 w-9 flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

      </div>
    </FeaturePageGate>
  );
}
