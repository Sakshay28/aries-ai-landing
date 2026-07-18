"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Sparkles, MessageSquare, Loader2, AlertCircle, Save, CheckCircle2,
  X, RefreshCw, UploadCloud, Library, Plus, Trash2, HelpCircle,
  Clock, HardDrive, FileText, Check, AlertTriangle, Send, ShieldAlert,
  ArrowRight, Sparkle, UserCheck, Play, RotateCcw, Image
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

interface ScriptedReply {
  id: string;
  keywords: string[];
  reply: string;
  media_url?: string | null;
  media_urls?: string[] | null;
  is_active: boolean;
  created_at: string;
}

interface KnowledgeDoc {
  id: string;
  filename: string;
  file_type: string;
  content_text: string;
  created_at: string;
  file_url?: string | null;
  embedding?: string | null;
  title?: string | null;
  description?: string | null;
  ai_description?: string | null;
  tags?: string[] | null;
  category?: string | null;
  processing_status?: 'pending' | 'processing' | 'ready' | 'failed' | null;
  processing_error?: string | null;
  usage_count?: number | null;
  manually_edited?: boolean | null;
}

const MEDIA_CATEGORIES = [
  'Food', 'Drinks', 'Decor', 'Rooms', 'Banquet', 'Wedding', 'Birthday',
  'Corporate', 'Offers', 'Menus', 'Policies', 'Events', 'Gallery', 'Products', 'Services',
];

interface DraftConfig {
  bot_name: string;
  bot_personality: string;
  welcome_message: string;
  welcome_image_url: string;
  welcome_offer: string;
  usps: string[];
  system_prompt: string;
  custom_faqs: FAQ[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'document' | null;
  timestamp: Date;
  isError?: boolean;
  buttons?: Array<{ type?: 'quick_reply' | 'url' | 'call'; id?: string; title: string; url?: string; phone?: string }>;
}

function mediaTypeFromUrl(url: string): 'image' | 'video' | 'document' {
  const lower = url.toLowerCase().split('?')[0];
  if (/\.(mp4|mov|webm|m4v|avi)$/.test(lower)) return 'video';
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/.test(lower)) return 'document';
  return 'image';
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
    },
    sample_chat: [
      { role: 'user', content: 'Do you have valet parking?' },
      { role: 'assistant', content: 'Yes, we offer complimentary valet parking for all our dining guests right at the main entrance. 🍷' },
      { role: 'user', content: 'Can I book a table for 4 tonight?' },
      { role: 'assistant', content: 'Certainly! I would be delighted to assist. May I know your preferred dining time?' }
    ] as const
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
    },
    sample_chat: [
      { role: 'user', content: 'Do you have oat milk?' },
      { role: 'assistant', content: 'Absolutely! We offer Oat, Almond, and Soy milk for all our coffee beverages at no extra charge. ☕' },
      { role: 'user', content: 'Is there seating for work?' },
      { role: 'assistant', content: 'Yes! We have high-speed Wi-Fi and plenty of power outlets throughout the cafe, perfect for working.' }
    ] as const
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
        { question: 'Do you deliver directly?', answer: 'Yes! We deliver directly within a 5km radius when ordered via our website, or you can find us on Zomato and Swiggy.' },
        { question: 'What are your popular dishes?', answer: 'Our absolute bestsellers are the Classic Flame-Grilled Cheeseburger and the Spicy Buffalo Wings!' }
      ]
    },
    sample_chat: [
      { role: 'user', content: 'What are your popular dishes?' },
      { role: 'assistant', content: 'Our absolute bestsellers are the Classic Flame-Grilled Cheeseburger and the Spicy Buffalo Wings! 🍔' },
      { role: 'user', content: 'Do you deliver directly?' },
      { role: 'assistant', content: 'Yes, we deliver directly within a 5km radius via our website! You can also find us on Zomato and Swiggy.' }
    ] as const
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
    },
    sample_chat: [
      { role: 'user', content: 'How do I book a private event?' },
      { role: 'assistant', content: 'Simply share your preferred date, time, and guest count, and our dedicated VIP concierge manager will contact you directly to curate the experience. ✨' },
      { role: 'user', content: 'Is there a dress code?' },
      { role: 'assistant', content: 'We maintain a smart casual dress code to ensure an elegant and premium atmosphere for all of our lounge guests.' }
    ] as const
  }
];

// ────────────────────────────────────────────────────────────
// Persona Helper Texts
// ────────────────────────────────────────────────────────────
const PERSONA_HELPERS: Record<string, string> = {
  'Premium Fine Dining': 'Elegant, polite, formal tone optimized for reservations and premium dining.',
  'Lounge & Club': 'Warm, emoji-rich, energetic host vibe — celebratory, respectful, and genuinely exciting for guests. Best for clubs, lounges, and bars.',
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
    welcome_image_url: '',
    welcome_offer: '',
    usps: [],
    system_prompt: '',
    custom_faqs: []
  });
  
  const [original, setOriginal] = useState<DraftConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showSimulatorTrainedFiles, setShowSimulatorTrainedFiles] = useState(false);
  
  // Knowledge docs & stats state
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [newFaqQuestion, setNewFaqQuestion] = useState('');
  const [newFaqAnswer, setNewFaqAnswer] = useState('');

  // Knowledge Media Library UI state
  const [mediaCategoryFilter, setMediaCategoryFilter] = useState<string | null>(null);
  const [mediaSearch, setMediaSearch] = useState('');
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editTags, setEditTags] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [dragOverKnowledge, setDragOverKnowledge] = useState(false);

  // Welcome image upload state
  const [uploadingWelcomeImage, setUploadingWelcomeImage] = useState(false);
  const welcomeImageInputRef = useRef<HTMLInputElement>(null);

  // Scripted replies state
  const [scriptedReplies, setScriptedReplies] = useState<ScriptedReply[]>([]);
  const [newSrKeywords, setNewSrKeywords] = useState('');
  const [newSrReply, setNewSrReply] = useState('');
  const [newSrMediaUrls, setNewSrMediaUrls] = useState<string[]>([]);
  const [uploadingSrMedia, setUploadingSrMedia] = useState(false);
  const [addingSr, setAddingSr] = useState(false);
  const srMediaInputRef = useRef<HTMLInputElement>(null);
  
  // Playground Chat Simulator States
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspacePanelRef = useRef<HTMLDivElement>(null);

  // Demo play queue state
  const [demoQueue, setDemoQueue] = useState<string[]>([]);

  // Provider health status from API responses
  const [providerDown, setProviderDown] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);

  // Name of the AI Flows agent currently overriding the base config (null = none).
  // Shown so the user knows when a flow agent — not the AI Assistant config — is replying.
  const [activeAgent, setActiveAgent] = useState<string | null>(null);

  // User-customizable sample simulator questions
  const [sampleQuestions, setSampleQuestions] = useState<string[]>([
    "How can you help me?",
    "Tell me more",
    "What services do you provide?"
  ]);
  const [newQuestionInput, setNewQuestionInput] = useState('');
  const [uspInput, setUspInput] = useState('');

  // Load custom sample questions from localStorage on data mount/change
  useEffect(() => {
    if (loading || !draft.bot_name) return;
    const key = `aries_sample_questions_${draft.bot_name}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setSampleQuestions(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved sample questions', e);
      }
    } else {
      // Set initial defaults based on the loaded welcome message/persona
      const name = draft.bot_name.toLowerCase();
      const welcome = draft.welcome_message.toLowerCase();
      const personality = draft.bot_personality.toLowerCase();
      
      if (name.includes('aries') || welcome.includes('aries') || welcome.includes('software') || welcome.includes('automation') || personality.includes('saas')) {
        setSampleQuestions([
          "What is Aries AI?",
          "Can Aries automate bookings?",
          "How much does Aries cost?",
          "We already have staff, why do we need Aries?"
        ]);
      } else if (welcome.includes('trek') || welcome.includes('hike') || welcome.includes('camp') || personality.includes('trekking')) {
        setSampleQuestions([
          "Is Kedarkantha beginner friendly?",
          "What gear should I carry?",
          "Do you provide guides?"
        ]);
      } else if (welcome.includes('room') || welcome.includes('hotel') || welcome.includes('stay') || personality.includes('hospitality')) {
        setSampleQuestions([
          "Do you have airport pickup?",
          "What time is check-in?",
          "Is breakfast included?"
        ]);
      } else if (welcome.includes('table') || welcome.includes('restaurant') || welcome.includes('menu') || welcome.includes('dining') || personality.includes('dining') || personality.includes('casual')) {
        setSampleQuestions([
          "Do you have valet parking?",
          "Can I reserve a table for 4?",
          "What time do you close?"
        ]);
      } else {
        setSampleQuestions([
          "How can you help me?",
          "Tell me more",
          "What services do you provide?"
        ]);
      }
    }
  }, [loading, draft.bot_name]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load scripted replies separately (defined after this block)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetch('/api/dashboard/scripted-replies').then(r => r.json()).then(j => { if (j.data) setScriptedReplies(j.data); }).catch(() => {}); }, []);

  // Listen for scroll in workspace panel to collapse header
  useEffect(() => {
    const panel = workspacePanelRef.current;
    if (!panel) return;
    const handleScroll = () => {
      if (panel.scrollTop > 30) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    panel.addEventListener('scroll', handleScroll);
    return () => panel.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll chat simulator — trigger on message changes AND typing indicator
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatHistory, sendingMsg]);

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
          welcome_image_url: settingsData.data.welcome_image_url || '',
          welcome_offer: settingsData.data.welcome_offer || '',
          usps: settingsData.data.usps || [],
          system_prompt: settingsData.data.system_prompt || '',
          custom_faqs: settingsData.data.custom_faqs || []
        };
        setDraft(d);
        setOriginal(JSON.parse(JSON.stringify(d)));
        
        // Show Onboarding Setup if no custom rules exist
        if (!d.welcome_message && !d.system_prompt && d.custom_faqs.length === 0) {
          setShowOnboarding(true);
        }
      } else {
        toast.error('Failed to load AI configuration');
      }

      if (docsData.success) {
        setDocs(docsData.data || docsData.docs || []);
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

  const handleApplyTemplate = (tpl: typeof STARTER_TEMPLATES[number]) => {
    setDraft(prev => ({
      ...prev,
      ...tpl.config
    }));
    if (tpl.sample_chat) {
      setChatHistory(
        tpl.sample_chat.map((chat, i) => ({
          id: `tpl-${tpl.id}-${i}-${Date.now()}`,
          role: chat.role,
          content: chat.content,
          timestamp: new Date()
        }))
      );
    } else {
      setChatHistory([]);
    }
    
    // Set matching sample questions for templates
    if (tpl.id === 'premium_fine_dining' || tpl.id === 'fast_casual' || tpl.id === 'luxury_hospitality') {
      setSampleQuestions([
        "Do you have valet parking?",
        "Can I reserve a table for 4?",
        "What time do you close?"
      ]);
    } else if (tpl.id === 'cafe_setup') {
      setSampleQuestions([
        "Do you have oat milk?",
        "Is there seating for work?",
        "What daily specials do you have?"
      ]);
    }
    
    setShowOnboarding(false);
    toast.success(`${tpl.label} template loaded! Try testing in the simulator.`);
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

  // ── Scripted Replies Management ──
  const loadScriptedReplies = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/scripted-replies');
      const json = await res.json();
      if (json.data) setScriptedReplies(json.data);
    } catch { /* non-fatal */ }
  }, []);

  const handleAddScriptedReply = async () => {
    const keywords = newSrKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const reply = newSrReply.trim();
    if (keywords.length === 0) { toast.error('Add at least one trigger keyword'); return; }
    if (!reply && newSrMediaUrls.length === 0) { toast.error('Reply text or at least one attachment is required'); return; }
    setAddingSr(true);
    try {
      const res = await fetch('/api/dashboard/scripted-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, reply, media_urls: newSrMediaUrls }),
      });
      const json = await res.json();
      if (json.data) {
        setScriptedReplies(prev => [...prev, json.data]);
        setNewSrKeywords('');
        setNewSrReply('');
        setNewSrMediaUrls([]);
        toast.success('Scripted reply added!');
      } else {
        toast.error(json.error || 'Failed to add');
      }
    } catch { toast.error('Network error'); }
    setAddingSr(false);
  };

  const handleToggleScriptedReply = async (id: string, is_active: boolean) => {
    setScriptedReplies(prev => prev.map(r => r.id === id ? { ...r, is_active } : r));
    await fetch(`/api/dashboard/scripted-replies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    }).catch(() => {});
  };

  const handleDeleteScriptedReply = async (id: string) => {
    setScriptedReplies(prev => prev.filter(r => r.id !== id));
    await fetch(`/api/dashboard/scripted-replies/${id}`, { method: 'DELETE' }).catch(() => {});
    toast.success('Scripted reply deleted');
  };

  const uploadViaPresignedUrl = async (file: File): Promise<{ url: string; mediaType: 'image' | 'video' | 'document' } | null> => {
    const presignRes = await fetch('/api/dashboard/scripted-replies/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
    });
    const presignJson = await presignRes.json();
    if (!presignRes.ok || !presignJson.signedUrl) {
      throw new Error(presignJson.error || 'Failed to get upload URL');
    }

    const uploadRes = await fetch(presignJson.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': presignJson.contentType },
      body: file,
    });
    if (!uploadRes.ok) {
      throw new Error(`Storage upload failed (${uploadRes.status})`);
    }

    return { url: presignJson.publicUrl, mediaType: presignJson.mediaType };
  };

  const handleSrMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSrMedia(true);
    try {
      const result = await uploadViaPresignedUrl(file);
      if (result) {
        setNewSrMediaUrls(prev => [...prev, result.url]);
        const label = result.mediaType === 'video' ? 'Video' : result.mediaType === 'document' ? 'Document' : 'Image';
        toast.success(`${label} uploaded!`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
    setUploadingSrMedia(false);
    if (srMediaInputRef.current) srMediaInputRef.current.value = '';
  };

  const handleWelcomeImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingWelcomeImage(true);
    try {
      const result = await uploadViaPresignedUrl(file);
      if (result) {
        update('welcome_image_url', result.url);
        toast.success(`Welcome ${result.mediaType === 'video' ? 'video' : 'image'} uploaded!`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
    setUploadingWelcomeImage(false);
    if (welcomeImageInputRef.current) welcomeImageInputRef.current.value = '';
  };

  // ── RAG Knowledge File Uploader ──
  const pollDocStatus = (docId: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 30) { // 60 seconds max poll
        clearInterval(interval);
        return;
      }
      try {
        const res = await fetch('/api/dashboard/knowledge');
        const json = await res.json();
        if (json.success && (json.data || json.docs)) {
          const docsList = json.data || json.docs || [];
          const doc = docsList.find((d: any) => d.id === docId);
          if (!doc) return;
          const done = doc.processing_status === 'ready' || doc.processing_status === 'failed' || (!doc.processing_status && doc.embedding);
          if (done) {
            setDocs(prev => prev.map(d => d.id === docId ? doc : d));
            if (doc.processing_status === 'failed') {
              toast.error(`AI couldn't analyze "${doc.filename}"${doc.processing_error ? `: ${doc.processing_error}` : ''}`, { duration: 5000 });
            } else {
              toast.success(
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-emerald-500">✅ AI Finished Learning</span>
                  <span className="text-xs text-muted-foreground">AI finished learning from "{doc.filename}"</span>
                </div>,
                { duration: 4000 }
              );
            }
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error('Polling status error:', err);
      }
    }, 2000);
  };

  const handleMultipleFileUpload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const CONCURRENCY = 3;
    for (let i = 0; i < list.length; i += CONCURRENCY) {
      await Promise.all(list.slice(i, i + CONCURRENCY).map(f => handleFileUpload(f)));
    }
  };

  const handleFileUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const textExts = ['txt', 'md', 'csv', 'json'];
    const presignExts = ['pdf', 'mp4', 'mov', 'webm', 'jpg', 'jpeg', 'png', 'webp'];
    const accepted = [...textExts, ...presignExts];
    if (!ext || !accepted.includes(ext)) {
      toast.error(`Unsupported file type. Accepted: ${accepted.map(a => `.${a}`).join(', ')}`);
      return;
    }

    const usePresign = presignExts.includes(ext);
    const videoExts = ['mp4', 'mov', 'webm'];
    const imageExts = ['jpg', 'jpeg', 'png', 'webp'];
    const maxMB = videoExts.includes(ext) ? 16 : imageExts.includes(ext) ? 5 : ext === 'pdf' ? 100 : 5;
    if (file.size > maxMB * 1024 * 1024) {
      toast.error(`File must be under ${maxMB} MB`);
      return;
    }

    const isMedia = videoExts.includes(ext) || imageExts.includes(ext);
    const tempId = `temp-${Date.now()}`;
    const optimisticDoc = {
      id: tempId,
      filename: file.name,
      file_type: ext,
      file_url: null,
      content_text: '',
      created_at: new Date().toISOString(),
      embedding: null,
      isOptimistic: true
    };

    setDocs(prev => [optimisticDoc, ...prev]);

    const uploadLabel = isMedia ? 'media' : ext === 'pdf' ? 'document' : 'knowledge';
    const uploadToastId = toast.loading(`Uploading ${uploadLabel}...`);
    setUploading(true);

    try {
      let resultData: any;

      if (usePresign) {
        // Presigned URL upload: browser → Supabase Storage directly (bypasses Vercel body limit)
        const presignRes = await fetch('/api/dashboard/knowledge/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, size: file.size, contentType: file.type }),
        });
        const presignJson = await presignRes.json();
        if (!presignRes.ok) throw new Error(presignJson.error || 'Failed to get upload URL');

        const uploadRes = await fetch(presignJson.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': presignJson.contentType },
          body: file,
        });
        if (!uploadRes.ok) throw new Error(`Storage upload failed (${uploadRes.status})`);

        const regRes = await fetch('/api/dashboard/knowledge/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath: presignJson.storagePath, filename: file.name, ext: presignJson.ext }),
        });
        const regJson = await regRes.json();
        if (!regRes.ok) throw new Error(regJson.error || 'Failed to register file');
        if (regJson.duplicate) {
          toast.warning(`"${file.name}" looks identical to already-uploaded "${regJson.existingDoc?.filename}" — skipped`, { id: uploadToastId, duration: 5000 });
          setDocs(prev => prev.filter(d => d.id !== tempId));
          return;
        }
        resultData = regJson.data;
      } else {
        // Direct upload for small text files
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/dashboard/knowledge', { method: 'POST', body: formData });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Upload failed');
        if (json.duplicate) {
          toast.warning(`"${file.name}" looks identical to already-uploaded "${json.existingDoc?.filename}" — skipped`, { id: uploadToastId, duration: 5000 });
          setDocs(prev => prev.filter(d => d.id !== tempId));
          return;
        }
        resultData = json.data;
      }

      toast.success(`${isMedia ? 'Media' : ext === 'pdf' ? 'Document' : 'Knowledge'} uploaded — AI is analyzing it now`, { id: uploadToastId });
      setDocs(prev => prev.map(d => d.id === tempId ? resultData : d));
      pollDocStatus(resultData.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed. Please try again.', { id: uploadToastId });
      setDocs(prev => prev.filter(d => d.id !== tempId));
      console.error('Upload error:', e);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDocEditSave = async (docId: string) => {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/dashboard/knowledge?id=${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
          category: editCategory.trim(),
          tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save');
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, ...json.data } : d));
      toast.success('Details updated — the AI will use this going forward');
      setEditingDocId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save changes');
    } finally {
      setSavingEdit(false);
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

    if (e || !customMsg) {
      setDemoQueue([]);
    }

    if (!customMsg) setInputValue('');
    const newMsg: ChatMessage = { id: `u-${Date.now()}-${Math.random().toString(36).slice(2)}`, role: 'user', content: msg, timestamp: new Date() };
    setChatHistory(prev => [...prev, newMsg]);
    setSendingMsg(true);

    // Prepare draft chat history payload format
    const historyPayload = chatHistory.map(m => ({
      role: m.role,
      content: m.content
    }));

    try {
      const start = Date.now();
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

      // Track provider health from API response
      if (json.providerStatus) {
        setProviderDown(!json.providerStatus.available);
        setProviderError(json.providerStatus.lastError || null);
      } else {
        setProviderDown(false);
        setProviderError(null);
      }

      // Surface AI Flows agent overrides — matches live WhatsApp behaviour.
      setActiveAgent(json.activeAgent || null);
      // Surface scripted reply intercepts so user sees "⚡ Scripted Reply" in simulator
      if (json.scriptedReply) {
        setActiveAgent('⚡ Scripted Reply — AI bypassed');
      }

      const elapsed = Date.now() - start;
      const delay = Math.max(800 - elapsed, 0); // Guarantee 800ms minimum typing animation delay

      setTimeout(() => {
        if (json.success && json.data) {
          const newMessages: ChatMessage[] = [];
          if (json.data.mediaUrls && json.data.mediaUrls.length > 1) {
            if (json.data.reply) {
              newMessages.push({
                id: `a-text-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                role: 'assistant',
                content: json.data.reply,
                timestamp: new Date()
              });
            }
            json.data.mediaUrls.forEach((url: string, index: number) => {
              const isLast = index === json.data.mediaUrls.length - 1;
              newMessages.push({
                id: `a-media-${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                role: 'assistant',
                content: '',
                mediaUrl: url,
                mediaType: mediaTypeFromUrl(url),
                timestamp: new Date(),
                buttons: isLast ? (json.data.buttons || undefined) : undefined
              });
            });
          } else {
            const replyMediaUrl = json.data.mediaUrl || (json.data.mediaUrls && json.data.mediaUrls[0]) || null;
            const replyMsg: ChatMessage = {
              id: `a-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              role: 'assistant',
              content: json.data.reply,
              mediaUrl: replyMediaUrl,
              mediaType: json.data.mediaType || (replyMediaUrl ? mediaTypeFromUrl(replyMediaUrl) : null),
              timestamp: new Date(),
              buttons: json.data.buttons || undefined
            };
            newMessages.push(replyMsg);
          }

          // If the AI provider is down, display the warning/error in the chat as well
          if (json.providerStatus && !json.providerStatus.available && json.providerStatus.lastError) {
            const providerErr: ChatMessage = {
              id: `prov-err-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              role: 'assistant',
              content: `AI Provider Down: ${json.providerStatus.lastError}`,
              isError: true,
              timestamp: new Date()
            };
            newMessages.push(providerErr);
          }

          setChatHistory(prev => [...prev, ...newMessages]);
        } else {
          const errorMsg: ChatMessage = {
            id: `err-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            role: 'assistant',
            content: json.error || 'Failed to simulate response',
            isError: true,
            timestamp: new Date()
          };
          setChatHistory(prev => [...prev, errorMsg]);
          toast.error(json.error || 'Failed to simulate response');
        }
        setSendingMsg(false);
      }, delay);

    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: 'assistant',
        content: err?.message || 'Network error contacting playground',
        isError: true,
        timestamp: new Date()
      };
      setChatHistory(prev => [...prev, errorMsg]);
      toast.error('Network error contacting playground');
      setSendingMsg(false);
    }
  };

  // Ref to hold the handleSendMessage callback securely
  const handleSendMessageRef = useRef<((e?: React.FormEvent, customMsg?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  });

  // Auto-play the next prompt in the demo queue
  useEffect(() => {
    if (demoQueue.length === 0 || sendingMsg) return;

    // Check if the last message is from the assistant
    const lastMsg = chatHistory[chatHistory.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    // Simulate natural read/type delay (2.5 seconds)
    const timer = setTimeout(() => {
      const nextPrompt = demoQueue[0];
      setDemoQueue(prev => prev.slice(1));
      if (handleSendMessageRef.current) {
        handleSendMessageRef.current(undefined, nextPrompt);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [demoQueue, chatHistory, sendingMsg]);

  const handleTrySampleConversation = () => {
    if (sampleQuestions.length === 0) return;

    setChatHistory([]);
    const firstPrompt = sampleQuestions[0];
    const remaining = sampleQuestions.slice(1);
    setDemoQueue(remaining);
    handleSendMessage(undefined, firstPrompt);
  };

  const handleResetChat = async () => {
    setChatHistory([]);
    setDemoQueue([]);
    setActiveAgent(null);
    // Scroll back to top of message list after state clears
    requestAnimationFrame(() => {
      if (chatEndRef.current) {
        const scrollEl = chatEndRef.current.closest('[data-chat-scroll]');
        if (scrollEl) scrollEl.scrollTop = 0;
      }
    });

    // Also flush server-side AI caches so the next message uses the latest published config
    try {
      await fetch('/api/dashboard/playground/reset', { method: 'DELETE' });
    } catch {
      // Non-fatal — local state is already cleared
    }

    toast.success('Simulation chat reset ✅');
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

        // Save custom sample questions to localStorage securely
        if (draft.bot_name) {
          const key = `aries_sample_questions_${draft.bot_name}`;
          localStorage.setItem(key, JSON.stringify(sampleQuestions));
        }

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

  return (
    <FeaturePageGate feature="AI Agents" allowedPlans={["growth", "pro", "enterprise"]}>
      <div className="absolute inset-0 flex flex-col lg:flex-row bg-background text-foreground overflow-hidden font-sans">
        
        {/* Workspace Panel (Left 65%) */}
        <div className="flex-1 flex flex-col h-full lg:max-w-[65%] border-r border-border/60 relative overflow-hidden bg-background">
          
          {/* Sticky Header with vibrant Publish button */}
          <header className={cn(
            "z-30 transition-all duration-300 px-6 lg:px-8 flex items-center justify-between gap-4 border-b border-border/30 backdrop-filter backdrop-blur-md shrink-0 bg-background/95",
            scrolled 
              ? "py-2.5 shadow-sm shadow-black/5" 
              : "py-5"
          )}>
            <div>
              {scrolled ? (
                <motion.div 
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-xs font-medium"
                >
                  <h2 className="text-sm font-semibold text-foreground tracking-tight">AI Assistant</h2>
                  <span className="text-muted-foreground/30 select-none">•</span>
                  <span className="text-emerald-500 dark:text-emerald-400 font-medium select-none">Live</span>
                  <span className="text-muted-foreground/30 select-none">•</span>
                  <span className={cn(
                    "transition-all duration-300 flex items-center gap-1 font-semibold shrink-0",
                    dirty ? "text-amber-500 dark:text-amber-400 animate-pulse" : "text-emerald-500 dark:text-emerald-400"
                  )}>
                    {dirty ? "⚡ Unsaved changes" : "✅ All changes published"}
                  </span>
                </motion.div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2.5">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">AI Assistant</h1>
                    <span className="text-xs font-medium text-emerald-500 dark:text-emerald-400 select-none tracking-wide">
                      Live
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">
                    Manage your autonomous AI assistant
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide mt-0.5">
                    <span className="text-muted-foreground/50">Status:</span>
                    <span className={cn(
                      "transition-all duration-300 flex items-center gap-1",
                      dirty ? "text-amber-500 dark:text-amber-400 font-semibold" : "text-emerald-500 dark:text-emerald-400 font-semibold"
                    )}>
                      {dirty ? "⚡ Unsaved changes" : "✅ All changes published"}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Publish button */}
            <motion.button
              whileHover={dirty ? { scale: 1.02, boxShadow: '0 0 18px rgba(16,185,129,0.45)' } : {}}
              whileTap={dirty ? { scale: 0.98 } : {}}
              onClick={handlePublish}
              disabled={publishing || !dirty}
              className={cn(
                "flex items-center justify-center gap-2 font-extrabold transition-all shadow-lg focus:outline-none shrink-0 border",
                scrolled 
                  ? "h-8 px-4 rounded-lg text-xs" 
                  : "h-11 px-6 rounded-xl text-sm",
                dirty 
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.3)]" 
                  : "bg-secondary text-muted-foreground border-border cursor-not-allowed shadow-none"
              )}
            >
              {publishing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : dirty ? (
                <Sparkles className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground/60" />
              )}
              {publishing ? 'Publishing...' : dirty ? '⚡ Publish AI Changes' : '✅ All changes published'}
            </motion.button>
          </header>

          {/* Scrollable Content Area */}
          <div 
            ref={workspacePanelRef} 
            className={cn(
              "flex-1 overflow-y-auto p-6 lg:p-8 pb-24",
              showOnboarding 
                ? "flex flex-col" 
                : "space-y-6"
            )}
          >

          {/* ONBOARDING QUICK START WIZARD */}
          {showOnboarding ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col items-center text-center max-w-4xl mx-auto w-full my-auto py-6 px-4 md:px-6 gap-8"
            >
              <section className="flex flex-col items-center text-center pt-12 pb-12 gap-4 w-full">
                <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <Sparkles className="w-8 h-8 animate-pulse" />
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                  Meet Your New AI Staff Member
                </h2>
                <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
                  Aries AI operates 24/7 over WhatsApp to greet guests, handle reservations, and answer menu questions. Let's pre-fill its instructions in 15 seconds.
                </p>
              </section>

              <div className="w-full space-y-6">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/60 text-center block">
                  Select your establishment type
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {STARTER_TEMPLATES.map(tpl => (
                    <motion.button
                      key={tpl.id}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleApplyTemplate(tpl)}
                      className="p-6 rounded-2xl border border-border bg-card hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.05)] text-left transition-all group duration-200 cursor-pointer flex flex-col justify-between min-h-[160px] h-full"
                    >
                      <div className="space-y-2">
                        <div className="font-extrabold text-base text-foreground flex items-center justify-between">
                          <span>{tpl.label}</span>
                          <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all text-emerald-500 translate-x-[-4px] group-hover:translate-x-0" />
                        </div>
                        <p className="text-xs text-muted-foreground/90 leading-relaxed font-medium">
                          {tpl.description}
                        </p>
                      </div>
                      <div className="text-[10px] text-emerald-500 font-extrabold uppercase tracking-wider mt-4">
                        Instant 1-Click Setup
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <>
              {/* SECTION 1: PERSONALITY & BRAND */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <Bot className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-bold text-foreground uppercase tracking-wider">Personality & Brand</span>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Reset current configuration and show preset templates? This will overwrite your unsaved changes.")) {
                        setShowOnboarding(true);
                      }
                    }}
                    className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-500 hover:text-emerald-400 transition-colors cursor-pointer select-none"
                  >
                    <RotateCcw className="w-3 h-3" /> Quick Start Presets
                  </button>
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
                        <option value="Lounge &amp; Club">🎉 Lounge &amp; Club</option>
                        <option value="Fast Casual">Fast Casual</option>
                        <option value="Luxury Hospitality">Luxury Hospitality</option>
                        <option value="Cafe Friendly">Cafe Friendly</option>
                        <option value="Reservations First">Reservations First</option>
                        <option value="Upsell Specialist">Upsell Specialist</option>
                      </select>
                      <p className="text-[11.5px] text-foreground/75 font-medium mt-1.5 pl-1 leading-normal">
                        ✨ {PERSONA_HELPERS[draft.bot_personality] || PERSONA_HELPERS['Premium Fine Dining']}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Welcome Message</label>

                    {/* Welcome Media Upload (image or video) */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Image className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Welcome Media <span className="normal-case font-normal text-muted-foreground/50">(optional — sends before the text)</span></span>
                      </div>
                      {draft.welcome_image_url ? (
                        <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-background/50">
                          {mediaTypeFromUrl(draft.welcome_image_url) === 'video' ? (
                            <video src={draft.welcome_image_url} className="h-20 w-28 object-cover rounded-lg border border-border" muted />
                          ) : (
                            <img src={draft.welcome_image_url} alt="Welcome" className="h-20 w-28 object-cover rounded-lg border border-border" />
                          )}
                          <div className="flex flex-col gap-1.5 pt-1">
                            <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              {mediaTypeFromUrl(draft.welcome_image_url) === 'video' ? 'Video ready — sends first' : 'Image ready — sends first'}
                            </span>
                            <button
                              type="button"
                              onClick={() => update('welcome_image_url', '')}
                              className="text-[10px] text-muted-foreground hover:text-red-500 flex items-center gap-1 transition-colors"
                            >
                              <X className="w-3 h-3" /> Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => welcomeImageInputRef.current?.click()}
                          disabled={uploadingWelcomeImage}
                          className="flex items-center gap-2 h-9 px-4 rounded-xl text-xs font-bold border border-dashed border-border bg-secondary/30 hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50 w-full justify-center"
                        >
                          {uploadingWelcomeImage
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                            : <><UploadCloud className="w-3.5 h-3.5" /> Upload Image or Video</>
                          }
                        </button>
                      )}
                      <input ref={welcomeImageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm" className="hidden" onChange={handleWelcomeImageUpload} />
                      <p className="text-[10px] text-muted-foreground/50">Image: JPEG/PNG/WebP · max <strong>5 MB</strong> · Video: MP4/MOV/WebM · max <strong>16 MB</strong> · Sends before the text</p>
                    </div>

                    {/* Welcome Text Message */}
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
                        value={uspInput}
                        onChange={e => setUspInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = uspInput.trim();
                            if (val && !draft.usps.includes(val)) {
                              update('usps', [...draft.usps, val]);
                              setUspInput('');
                            }
                          }
                        }}
                        placeholder="Type USP (e.g. Free Valet Parking) and press Enter"
                        className="flex-1 h-9 px-3 rounded-xl text-sm border border-border bg-background outline-none transition-all focus:border-foreground/30"
                      />
                      <button
                        onClick={() => {
                          const val = uspInput.trim();
                          if (val && !draft.usps.includes(val)) {
                            update('usps', [...draft.usps, val]);
                            setUspInput('');
                          }
                        }}
                        className="h-9 px-3 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors"
                        style={{ background: 'var(--secondary)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 1.5: SIMULATOR DEMO QUESTIONS */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-secondary/30">
                  <Play className="w-4 h-4 text-muted-foreground fill-current animate-pulse" />
                  <span className="text-sm font-bold text-foreground uppercase tracking-wider">Simulator Demo Questions</span>
                </div>
                
                <div className="p-6 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1">
                      Choose what visitors should test in the simulator
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Customizing these questions dynamically updates the demo play menu inside the playground simulator. Visitors can sequentially autoplay them.
                    </p>
                  </div>

                  {/* Chips for sample questions */}
                  <div className="flex flex-wrap gap-2">
                    {sampleQuestions.map((q, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-secondary text-foreground text-xs border border-border"
                      >
                        <span>{q}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = sampleQuestions.filter((_, i) => i !== idx);
                            setSampleQuestions(updated);
                            setDirty(true);
                          }}
                          className="hover:text-red-500 transition-colors text-muted-foreground select-none cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                    {sampleQuestions.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">No sample questions added. The simulator will use default fallbacks.</span>
                    )}
                  </div>

                  {/* Input field to add a new question */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newQuestionInput}
                      onChange={e => setNewQuestionInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = newQuestionInput.trim();
                          if (val && !sampleQuestions.includes(val)) {
                            setSampleQuestions([...sampleQuestions, val]);
                            setNewQuestionInput('');
                            setDirty(true);
                          }
                        }
                      }}
                      placeholder="Add a sample question and press Enter..."
                      className="flex-1 h-9 px-3 rounded-xl text-sm border border-border bg-background outline-none transition-all focus:border-foreground/30"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newQuestionInput.trim();
                        if (val && !sampleQuestions.includes(val)) {
                          setSampleQuestions([...sampleQuestions, val]);
                          setNewQuestionInput('');
                          setDirty(true);
                        }
                      }}
                      className="h-9 px-4 rounded-xl text-xs font-bold bg-secondary hover:bg-secondary/80 border border-border text-foreground transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
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
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                        Quick suggestions commonly used by restaurants:
                      </span>
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
                    
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                      {draft.custom_faqs.map((faq, i) => (
                        <div key={i} className="p-3.5 rounded-xl border border-border bg-background/50 flex justify-between gap-3 text-xs leading-relaxed relative group">
                          <div className="space-y-2">
                            <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                              👤 Customer asks
                            </div>
                            <div className="font-semibold text-foreground bg-secondary/30 px-2.5 py-1.5 rounded-lg border border-border/40 pl-3">
                              “{faq.question}”
                            </div>
                            
                            <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-widest pt-1">
                              🤖 Assistant replies
                            </div>
                            <div className="text-muted-foreground bg-emerald-500/[0.02] px-2.5 py-1.5 rounded-lg border border-emerald-500/10 pl-3">
                              “{faq.answer}”
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => handleRemoveFaq(i)} 
                            className="text-muted-foreground hover:text-red-500 p-1.5 absolute top-2 right-2 rounded-lg hover:bg-red-500/5 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {draft.custom_faqs.length === 0 && (
                        <div className="p-4 rounded-xl border border-dashed border-border/60 bg-secondary/10 space-y-3">
                          <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/60 text-center select-none">
                            💡 Example FAQ (Add yours below to teach the AI)
                          </div>
                          <div className="p-3.5 rounded-xl border border-border bg-background/50 flex justify-between gap-3 text-xs leading-relaxed opacity-65 select-none select-text">
                            <div className="space-y-2 w-full">
                              <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                👤 Customer asks
                              </div>
                              <div className="font-semibold text-foreground bg-secondary/30 px-2.5 py-1.5 rounded-lg border border-border/40 pl-3">
                                “Do you have valet parking?”
                              </div>
                              
                              <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase tracking-widest pt-1">
                                🤖 Assistant replies
                              </div>
                              <div className="text-muted-foreground bg-emerald-500/[0.02] px-2.5 py-1.5 rounded-lg border border-emerald-500/10 pl-3">
                                “Yes, complimentary valet parking is available for all our dining guests at the main entrance.”
                              </div>
                            </div>
                          </div>
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

                  {/* ── Scripted Replies ── */}
                  <div className="space-y-4 pt-4 border-t border-border">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <label className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground block">
                          ⚡ Scripted Replies
                        </label>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                          When a message contains any trigger keyword, this exact reply is sent — AI is bypassed entirely.
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        {scriptedReplies.filter(r => r.is_active).length} active
                      </span>
                    </div>

                    {/* Existing scripted replies list */}
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {scriptedReplies.map((sr) => (
                        <div key={sr.id} className={cn(
                          "p-3.5 rounded-xl border bg-background/50 text-xs leading-relaxed relative group transition-opacity",
                          sr.is_active ? "border-border" : "border-border/40 opacity-50"
                        )}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-2 flex-1 min-w-0">
                              <div className="flex flex-wrap gap-1">
                                {sr.keywords.map((kw, ki) => (
                                  <span key={ki} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                              {(() => {
                                const urls = sr.media_urls && sr.media_urls.length > 0
                                  ? sr.media_urls
                                  : (sr.media_url ? [sr.media_url] : []);
                                if (urls.length === 0) return null;
                                return (
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {urls.map((url, ui) => {
                                      const mt = mediaTypeFromUrl(url);
                                      return (
                                        <div key={ui} className="flex items-center gap-2 bg-secondary/30 p-1.5 rounded-lg border border-border/40 max-w-[200px]">
                                          {mt === 'video' ? (
                                            <video src={url} className="h-10 w-14 object-cover rounded border border-border shrink-0" muted />
                                          ) : mt === 'document' ? (
                                            <div className="h-10 w-14 rounded border border-border bg-secondary/50 flex flex-col items-center justify-center shrink-0">
                                              <span className="text-base">📄</span>
                                              <span className="text-[7px] text-muted-foreground font-semibold uppercase">{url.split('.').pop()?.slice(0, 3)}</span>
                                            </div>
                                          ) : (
                                            <img src={url} alt="scripted reply" className="h-10 w-14 object-cover rounded border border-border shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                          )}
                                          <div className="min-w-0 flex-1">
                                            <p className="text-[9px] font-bold text-foreground capitalize truncate">{mt}</p>
                                            <p className="text-[8px] text-muted-foreground truncate">{url.split('/').pop()?.split('-').slice(1).join('-') || 'file'}</p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                              {sr.reply && (
                                <div className="text-muted-foreground bg-emerald-500/[0.03] px-2.5 py-1.5 rounded-lg border border-emerald-500/10 break-words">
                                  "{sr.reply.length > 120 ? sr.reply.slice(0, 120) + '…' : sr.reply}"
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <button
                                onClick={() => handleDeleteScriptedReply(sr.id)}
                                className="text-muted-foreground hover:text-red-500 p-1 rounded-lg hover:bg-red-500/5 transition-all opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleToggleScriptedReply(sr.id, !sr.is_active)}
                                className={cn(
                                  "text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all",
                                  sr.is_active
                                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20"
                                    : "bg-secondary text-muted-foreground border-border hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/20"
                                )}
                              >
                                {sr.is_active ? 'ON' : 'OFF'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {scriptedReplies.length === 0 && (
                        <div className="p-4 rounded-xl border border-dashed border-border/60 bg-secondary/10 text-center">
                          <p className="text-[11px] text-muted-foreground/60 font-medium">No scripted replies yet.</p>
                          <p className="text-[10px] text-muted-foreground/40 mt-0.5">Example: keywords "price, cost" → "Our plans start at ₹999/mo."</p>
                        </div>
                      )}
                    </div>

                    {/* Add new scripted reply */}
                    <div className="p-3.5 rounded-xl border border-border bg-secondary/20 space-y-3">
                      <div className="text-xs font-bold text-foreground">Add New Scripted Reply</div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                          Trigger keywords (comma-separated)
                        </label>
                        <input
                          value={newSrKeywords}
                          onChange={e => setNewSrKeywords(e.target.value)}
                          placeholder="e.g. price, cost, how much, rates"
                          className="w-full h-9 px-3 rounded-xl text-xs border border-border bg-background outline-none focus:ring-1 focus:ring-primary/30"
                        />
                        <p className="text-[10px] text-muted-foreground/50 mt-1">Reply sends when the customer's message contains ANY of these words</p>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                          Exact reply to send
                        </label>
                        <textarea
                          value={newSrReply}
                          onChange={e => setNewSrReply(e.target.value)}
                          placeholder="Type the exact message the customer will receive..."
                          rows={3}
                          className="w-full px-3 py-2 rounded-xl text-xs border border-border bg-background outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                          Attachments <span className="normal-case font-normal text-muted-foreground/50">(optional — images, videos, or documents)</span>
                        </label>
                        {newSrMediaUrls.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            {newSrMediaUrls.map((url, index) => {
                              const mt = mediaTypeFromUrl(url);
                              return (
                                <div key={index} className="flex items-start gap-2 p-2 rounded-lg border border-border bg-background relative group">
                                  {mt === 'video' ? (
                                    <video src={url} className="h-10 w-14 object-cover rounded border border-border shrink-0" muted />
                                  ) : mt === 'document' ? (
                                    <div className="h-10 w-14 rounded border border-border bg-secondary/50 flex flex-col items-center justify-center shrink-0">
                                      <span className="text-base">📄</span>
                                      <span className="text-[7px] text-muted-foreground font-bold uppercase">{url.split('.').pop()?.slice(0, 3)}</span>
                                    </div>
                                  ) : (
                                    <img src={url} alt="preview" className="h-10 w-14 object-cover rounded border border-border shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                                    <span className="text-[9px] text-emerald-600 font-bold truncate">✓ Ready</span>
                                    <span className="text-[7px] text-muted-foreground truncate">{url.split('/').pop()?.split('-').slice(1).join('-') || 'file'}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setNewSrMediaUrls(prev => prev.filter((_, i) => i !== index))}
                                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => srMediaInputRef.current?.click()}
                          disabled={uploadingSrMedia}
                          className="flex items-center gap-2 h-9 px-4 rounded-xl text-xs font-bold border border-dashed border-border bg-secondary/30 hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
                        >
                          {uploadingSrMedia
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                            : <><UploadCloud className="w-3.5 h-3.5" /> Upload Image / Video / Document</>
                          }
                        </button>
                        <input
                          ref={srMediaInputRef}
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm,.m4v,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,application/pdf"
                          className="hidden"
                          onChange={handleSrMediaUpload}
                        />
                        <div className="text-[10px] text-muted-foreground/50 mt-1.5 space-y-0.5">
                          <p>📷 Images (JPEG/PNG/WebP/GIF) · max <strong>5 MB</strong></p>
                          <p>🎬 Videos (MP4/MOV/WebM) · max <strong>16 MB</strong></p>
                          <p>📄 Documents (PDF/DOC/DOCX/XLS/XLSX/PPT) · max <strong>100 MB</strong></p>
                        </div>
                      </div>
                      <button
                        onClick={handleAddScriptedReply}
                        disabled={addingSr || !newSrKeywords.trim() || (!newSrReply.trim() && newSrMediaUrls.length === 0)}
                        className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-bold bg-foreground text-background hover:opacity-90 disabled:opacity-40 transition-all ml-auto"
                      >
                        {addingSr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        {addingSr ? 'Adding…' : 'Add Reply'}
                      </button>
                    </div>
                  </div>

                  {/* Knowledge Base Health Card */}
                  <div
                    className={cn(
                      "space-y-4 pt-4 border-t border-border rounded-b-2xl transition-colors",
                      dragOverKnowledge && "bg-emerald-500/5 ring-2 ring-emerald-500/40 ring-inset"
                    )}
                    onDragOver={e => { e.preventDefault(); setDragOverKnowledge(true); }}
                    onDragLeave={() => setDragOverKnowledge(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverKnowledge(false);
                      if (e.dataTransfer.files?.length) handleMultipleFileUpload(e.dataTransfer.files);
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">
                        Knowledge Media Library
                      </label>

                      {/* File Upload action trigger — bulk, drag & drop supported */}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold bg-foreground text-background hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
                      >
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                        {uploading ? 'Uploading...' : 'Upload Files'}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={e => { if (e.target.files?.length) handleMultipleFileUpload(e.target.files); }}
                        accept=".txt,.md,.csv,.json,.pdf,.mp4,.mov,.webm,.jpg,.jpeg,.png,.webp"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 -mt-2">
                      Drag & drop or select multiple files at once — menus, brochures, photos, videos. The AI analyzes and tags each one automatically.
                    </p>

                    {/* Health Signals */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl border bg-background/30 text-center">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Knowledge Status</div>
                        <div className={cn(
                          "text-xs font-bold mt-1",
                          docs.some(d => d.processing_status === 'pending' || d.processing_status === 'processing' || (!d.processing_status && !d.embedding))
                            ? "text-amber-500 animate-pulse"
                            : docs.length > 0
                              ? "text-emerald-500"
                              : "text-muted-foreground"
                        )}>
                          {docs.some(d => d.processing_status === 'pending' || d.processing_status === 'processing' || (!d.processing_status && !d.embedding))
                            ? 'Processing'
                            : docs.length > 0
                              ? 'Active'
                              : 'Not Added'}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl border bg-background/30 text-center">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Files Indexed</div>
                        <div className="text-xs font-bold mt-1 text-foreground">
                          {docs.filter(d => d.processing_status === 'ready' || (!d.processing_status && d.embedding)).length} of {docs.length}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl border bg-background/30 text-center">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">FAQ Coverage</div>
                        <div className="text-xs font-bold mt-1 text-foreground">{draft.custom_faqs.length} Items</div>
                      </div>
                      <div className="p-3 rounded-xl border bg-background/30 text-center">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">AI Readiness</div>
                        <div className="text-[11px] font-bold mt-1 text-foreground truncate">
                          {docs.some(d => d.processing_status === 'pending' || d.processing_status === 'processing') ? 'Learning...' : 'Ready to Answer'}
                        </div>
                      </div>
                    </div>

                    {/* Uploaded Knowledge Documents Section */}
                    <div className="flex items-center justify-between mt-4 gap-2">
                      <div className="text-xs font-bold text-foreground">
                        Uploaded Knowledge ({docs.length})
                      </div>
                      {docs.length > 0 && (
                        <input
                          type="text"
                          value={mediaSearch}
                          onChange={e => setMediaSearch(e.target.value)}
                          placeholder="Search files, tags, descriptions..."
                          className="h-7 px-2.5 rounded-lg text-[11px] bg-background border border-border/80 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 w-48"
                        />
                      )}
                    </div>

                    {/* Category filter chips */}
                    {docs.some(d => d.category) && (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setMediaCategoryFilter(null)}
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors",
                            !mediaCategoryFilter ? "bg-foreground text-background border-foreground" : "bg-background border-border/80 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          All
                        </button>
                        {Array.from(new Set(docs.map(d => d.category).filter(Boolean) as string[])).map(cat => (
                          <button
                            key={cat}
                            onClick={() => setMediaCategoryFilter(prev => prev === cat ? null : cat)}
                            className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors",
                              mediaCategoryFilter === cat ? "bg-emerald-500 text-white border-emerald-500" : "bg-background border-border/80 text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Docs list */}
                    <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                      {docs
                        .filter(d => !mediaCategoryFilter || d.category === mediaCategoryFilter)
                        .filter(d => {
                          if (!mediaSearch.trim()) return true;
                          const q = mediaSearch.trim().toLowerCase();
                          return d.filename.toLowerCase().includes(q)
                            || d.title?.toLowerCase().includes(q)
                            || d.description?.toLowerCase().includes(q)
                            || d.category?.toLowerCase().includes(q)
                            || d.tags?.some(t => t.toLowerCase().includes(q));
                        })
                        .map(doc => {
                        const status = doc.processing_status || (doc.embedding ? 'ready' : 'pending');
                        const isReady = status === 'ready';
                        const isFailed = status === 'failed';
                        const isOptimistic = (doc as any).isOptimistic;
                        const ext = (doc.file_type || doc.filename.split('.').pop() || 'txt').toLowerCase();
                        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
                        const isVideo = ['mp4', 'mov', 'webm'].includes(ext);
                        const isEditing = editingDocId === doc.id;
                        const displayTitle = doc.title || doc.filename;

                        return (
                          <div key={doc.id} className="p-3.5 bg-background border border-border/80 rounded-xl hover:border-border transition-colors text-xs relative group">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={cn(
                                  "shrink-0 rounded-lg overflow-hidden flex items-center justify-center",
                                  isImage && doc.file_url ? "w-9 h-9" : "p-2.5",
                                  !(isImage && doc.file_url) && (isFailed ? "bg-red-500/10 text-red-500" : isReady ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500 animate-pulse")
                                )}>
                                  {isImage && doc.file_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={doc.file_url} alt={displayTitle} className="w-9 h-9 object-cover" />
                                  ) : isVideo ? (
                                    <Play className="w-4 h-4" />
                                  ) : (
                                    <FileText className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-foreground truncate">{displayTitle}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                                    <span className="uppercase tracking-wider font-semibold">{ext}</span>
                                    <span>•</span>
                                    <span className={cn(
                                      "font-bold flex items-center gap-1",
                                      isFailed ? "text-red-500" : isReady ? "text-emerald-500" : "text-amber-500"
                                    )}>
                                      {isFailed ? (
                                        <><AlertTriangle className="w-3 h-3" /> Failed</>
                                      ) : isReady ? (
                                        <><Check className="w-3 h-3 text-emerald-500" /> Ready</>
                                      ) : (
                                        <><Loader2 className="w-3 h-3 animate-spin" /> AI analyzing...</>
                                      )}
                                    </span>
                                    {doc.category && <><span>•</span><span className="px-1.5 py-0.5 rounded bg-secondary/60 font-semibold">{doc.category}</span></>}
                                    {!!doc.usage_count && <><span>•</span><span>Sent {doc.usage_count}×</span></>}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {doc.file_url && (
                                  <a
                                    href={doc.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                                    title="Preview"
                                  >
                                    <Library className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                {(isImage || isVideo || ext === 'pdf') && (
                                  <button
                                    onClick={() => {
                                      if (isEditing) { setEditingDocId(null); return; }
                                      setEditingDocId(doc.id);
                                      setEditTitle(doc.title || '');
                                      setEditDescription(doc.description || '');
                                      setEditCategory(doc.category || '');
                                      setEditTags((doc.tags || []).join(', '));
                                    }}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                                    title="Edit details"
                                  >
                                    <Sparkle className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDocDelete(doc.id, doc.filename)}
                                  disabled={isOptimistic}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-30 cursor-pointer"
                                  title="Delete Document"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {!isEditing && doc.description && (
                              <p className="text-[11px] text-muted-foreground mt-2 pl-11 line-clamp-2">{doc.description}</p>
                            )}
                            {!isEditing && !!doc.tags?.length && (
                              <div className="flex flex-wrap gap-1 mt-1.5 pl-11">
                                {doc.tags.slice(0, 8).map(tag => (
                                  <span key={tag} className="px-1.5 py-0.5 rounded bg-secondary/50 text-[9px] text-muted-foreground font-medium">{tag}</span>
                                ))}
                              </div>
                            )}
                            {isFailed && doc.processing_error && (
                              <p className="text-[10px] text-red-500 mt-2 pl-11">{doc.processing_error}</p>
                            )}

                            {isEditing && (
                              <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                                <input
                                  type="text"
                                  value={editTitle}
                                  onChange={e => setEditTitle(e.target.value)}
                                  placeholder="Title (e.g. Birthday Decoration Setup)"
                                  className="w-full h-8 px-2.5 rounded-lg text-[11px] bg-secondary/30 border border-border/80 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                                />
                                <textarea
                                  value={editDescription}
                                  onChange={e => setEditDescription(e.target.value)}
                                  placeholder="Description — what a customer would see/ask about"
                                  rows={2}
                                  className="w-full px-2.5 py-2 rounded-lg text-[11px] bg-secondary/30 border border-border/80 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-none"
                                />
                                <div className="flex gap-2">
                                  <select
                                    value={editCategory}
                                    onChange={e => setEditCategory(e.target.value)}
                                    className="flex-1 h-8 px-2 rounded-lg text-[11px] bg-secondary/30 border border-border/80 focus:outline-none"
                                  >
                                    <option value="">No category</option>
                                    {MEDIA_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                  <input
                                    type="text"
                                    value={editTags}
                                    onChange={e => setEditTags(e.target.value)}
                                    placeholder="tags, comma, separated"
                                    className="flex-[1.5] h-8 px-2.5 rounded-lg text-[11px] bg-secondary/30 border border-border/80 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                                  />
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                  <button
                                    onClick={() => setEditingDocId(null)}
                                    className="h-7 px-3 rounded-lg text-[10px] font-bold text-muted-foreground hover:bg-secondary/60"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleDocEditSave(doc.id)}
                                    disabled={savingEdit}
                                    className="h-7 px-3 rounded-lg text-[10px] font-bold bg-foreground text-background hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                                  >
                                    {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    Save
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {docs.length === 0 && (
                        <div className="p-6 rounded-2xl border border-dashed border-border bg-secondary/10 flex flex-col items-center justify-center text-center space-y-2">
                          <HardDrive className="w-8 h-8 text-muted-foreground/50" />
                          <div className="text-xs font-bold text-foreground">No menu, photos, videos or documents uploaded yet</div>
                          <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
                            Upload menus, brochures, photos and videos — the AI understands each one and sends the right file when a customer asks.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

        {/* Live Simulator Preview Panel (Right 35%) */}
        <div className="w-full lg:w-[35%] bg-gray-50 flex flex-col p-6 lg:p-8 shrink-0 overflow-y-auto max-h-screen border-l border-border/40">
          {/*
            Phone frame: fixed clamp height so the flex-1 scroll area has a concrete
            boundary. Without a concrete height, flex-1 + overflow-y-auto cannot scroll.
          */}
          <div
            className="w-full max-w-sm mx-auto flex flex-col bg-white rounded-[32px] border border-gray-200 shadow-[0_8px_40px_rgba(0,0,0,0.10)] overflow-hidden"
            style={{ height: 'clamp(600px, 78vh, 760px)' }}
          >
            {/* ── Phone Notch (absolute, does not participate in flex layout) ── */}
            <div className="absolute top-0 left-0 right-0 h-6 bg-gray-100 flex items-center justify-center z-10 rounded-t-[32px] pointer-events-none">
              <div className="w-16 h-4 rounded-full bg-gray-200 flex items-center justify-center">
                <div className="w-8 h-1 rounded-full bg-gray-300" />
              </div>
            </div>

            {/* ── Chat Header (shrink-0, never scrolls away) ── */}
            <div className="pt-9 px-4 pb-3 bg-white flex items-center gap-3 shrink-0 border-b border-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)] relative z-[5]">
              <div className="w-9 h-9 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold text-xs text-gray-900 leading-tight">{draft.bot_name || 'Assistant'}</h4>
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold bg-gray-100 px-2 py-0.5 rounded-full text-gray-500 mt-0.5">
                  👤 Customer Simulation
                </span>
              </div>
            </div>

            {/* ── Mode Banner (shrink-0) ── */}
            <div className={cn(
              "px-4 py-1.5 flex items-center justify-center shrink-0 border-b",
              dirty ? "bg-amber-50 border-amber-100" : "bg-emerald-50 border-emerald-100"
            )}>
              {dirty ? (
                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-600">
                  <AlertTriangle className="w-3 h-3 animate-pulse" /> Draft Mode • Unsaved changes testing
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600">
                  <Check className="w-3 h-3" /> Live Mode • Testing published config
                </span>
              )}
            </div>

            {/* ── Provider Health Banner (shrink-0) ── */}
            {providerDown && (
              <div className="px-4 py-1.5 flex items-center justify-center shrink-0 border-b bg-red-50 border-red-100">
                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-red-600">
                  <AlertCircle className="w-3 h-3 animate-pulse" /> AI Provider Down • Offline fallback active
                </span>
              </div>
            )}

            {/* ── AI Flows Agent Override Banner (shrink-0) ── */}
            {/* Warns when an AI Flows agent — not the AI Assistant config above — is generating
                the reply. This is exactly what happens on live WhatsApp, so it must be visible. */}
            {activeAgent && (
              <div className="px-4 py-1.5 flex items-center justify-center shrink-0 border-b bg-amber-50 border-amber-100">
                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
                  <AlertTriangle className="w-3 h-3" /> AI Flow Agent “{activeAgent}” is replying — overrides this config
                </span>
              </div>
            )}

            {/* ── Knowledge Banner (shrink-0, animated expand/collapse) ── */}
            {docs.length > 0 && (
              <div className="border-b border-gray-100 bg-white shrink-0 select-none">
                <button
                  type="button"
                  onClick={() => setShowSimulatorTrainedFiles(prev => !prev)}
                  className="w-full py-1.5 px-4 flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  {docs.some(d => !d.embedding) ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-amber-500 animate-pulse">
                      ⏳ AI learning...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-emerald-600">
                      ✅ AI knowledge active
                    </span>
                  )}
                  <span className="text-[8px] text-gray-400 font-bold uppercase ml-0.5">
                    ({docs.length} {docs.length === 1 ? 'source' : 'sources'} • {showSimulatorTrainedFiles ? 'Hide' : 'View'})
                  </span>
                </button>
                <AnimatePresence>
                  {showSimulatorTrainedFiles && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="overflow-hidden bg-gray-50 px-5 py-2.5 border-t border-gray-100"
                    >
                      <div className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                        Trained Knowledge Sources:
                      </div>
                      <div className="flex flex-col gap-1 max-h-20 overflow-y-auto">
                        {docs.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between text-[9px]">
                            <span className="text-gray-600 truncate max-w-[180px]">📄 {doc.filename}</span>
                            <span className={cn(
                              "font-bold text-[8px] uppercase shrink-0 ml-2",
                              doc.embedding ? "text-emerald-600" : "text-amber-500 animate-pulse"
                            )}>
                              {doc.embedding ? 'Indexed' : 'Learning...'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/*
              ── Scroll Container (flex-1 + min-h-0) ──────────────────────────
              ARCHITECTURE:
                ScrollContainer  → overflow-y-auto, NO flex itself
                └ MessagesColumn → flex flex-col, gap for spacing
                  ├ MessageRow   → flex justify-start | justify-end
                  │ └ Bubble     → max-w-[80%], width:fit-content, height:auto
                  └ …

              KEY RULES:
              • min-h-0 is mandatory: without it flex items default to
                min-height:auto and the container never shrinks → no scroll.
              • The scroll container must NOT be the flex column. Keep those roles
                separate so overflow math is predictable.
              • Bubbles use `justify-start`/`justify-end` on a row wrapper — this
                is more reliable than align-self on a column item.
              • Never set explicit heights on bubbles; height:auto everywhere.
            */}
            <div
              data-chat-scroll="true"
              className="flex-1 min-h-0 overflow-y-auto bg-gray-50/60"
              style={{ overscrollBehavior: 'contain' }}
            >
              {/* Inner column: natural vertical flow, no position tricks */}
              <div className="flex flex-col gap-3 px-4 py-4">

                {/* Welcome media — always assistant-side, before text */}
                {draft.welcome_image_url && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl rounded-tl-sm overflow-hidden shadow-sm border border-gray-100 bg-white">
                      {mediaTypeFromUrl(draft.welcome_image_url) === 'video' ? (
                        <video src={draft.welcome_image_url} controls className="w-full max-h-40 object-cover" />
                      ) : (
                        <img src={draft.welcome_image_url} alt="Welcome" className="w-full max-h-40 object-cover" />
                      )}
                    </div>
                  </div>
                )}

                {/* Welcome message — always assistant-side */}
                <div className="flex justify-start">
                  <div
                    className="max-w-[80%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-xs bg-white text-gray-800 leading-relaxed shadow-sm border border-gray-100"
                    style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                  >
                    {draft.welcome_message || 'Hi! Welcome to our restaurant. How can I help you today?'}
                  </div>
                </div>

                {/*
                  Each message uses a ROW wrapper with justify-start|end.
                  The bubble itself has max-w-[80%] and height:auto (default).
                  Stable key via message.id — never use array index.
                */}
                {chatHistory.map((m) => (
                  <div key={m.id} className={cn("flex", m.role === 'user' ? "justify-end" : "justify-start")}>
                    <div className="max-w-[80%] flex flex-col gap-1">
                      {/* Media bubble for assistant scripted replies */}
                      {m.mediaUrl && m.role === 'assistant' && (
                        <div className="rounded-2xl rounded-tl-sm overflow-hidden shadow-sm border border-gray-100 bg-white">
                          {m.mediaType === 'video' ? (
                            <video
                              src={m.mediaUrl}
                              controls
                              className="w-full max-h-48 object-cover"
                            />
                          ) : m.mediaType === 'document' ? (
                            <a
                              href={m.mediaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                            >
                              <span className="text-2xl">📄</span>
                              <div>
                                <div className="text-xs font-semibold text-gray-800">Document</div>
                                <div className="text-[10px] text-blue-500 truncate max-w-[160px]">{m.mediaUrl.split('/').pop()?.slice(0, 30)}</div>
                              </div>
                            </a>
                          ) : (
                            <img
                              src={m.mediaUrl}
                              alt="scripted reply"
                              className="w-full max-h-48 object-cover"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                      )}
                      {/* Error bubble or Text bubble */}
                      {m.isError ? (
                        <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-xs bg-red-50 text-red-700 border border-red-100 flex items-start gap-2 shadow-sm">
                          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5 animate-pulse" />
                          <div className="flex flex-col gap-1">
                            <span className="font-extrabold uppercase tracking-wider text-[9px] text-red-600 block">Simulation Error</span>
                            <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                              {m.content}
                            </span>
                          </div>
                        </div>
                      ) : m.content && (
                        <div
                          className={cn(
                            "rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm",
                            m.role === 'user'
                              ? "bg-emerald-600 text-white rounded-tr-sm"
                              : "bg-white text-gray-800 rounded-tl-sm border border-gray-100"
                          )}
                          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                        >
                          {m.content}
                        </div>
                      )}

                      {/* Render dynamic quick-reply, URL, and call buttons in simulator */}
                      {m.role === 'assistant' && m.buttons && m.buttons.length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-1 max-w-[280px]">
                          {m.buttons.map((btn, idx) => {
                            const isUrl = btn.type === 'url';
                            const isCall = btn.type === 'call';
                            const key = btn.id || `sim_btn_${idx}`;

                            const className = "text-center py-2 px-3 text-xs font-semibold rounded-xl transition-colors border border-emerald-600/25 bg-emerald-50/30 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm block w-full";

                            if (isUrl && btn.url) {
                              return (
                                <a
                                  key={key}
                                  href={btn.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={className}
                                >
                                  🔗 {btn.title}
                                </a>
                              );
                            } else if (isCall && btn.phone) {
                              return (
                                <a
                                  key={key}
                                  href={`tel:${btn.phone}`}
                                  className={className}
                                >
                                  📞 {btn.title}
                                </a>
                              );
                            } else {
                              return (
                                <button
                                  key={key}
                                  disabled={sendingMsg}
                                  onClick={() => handleSendMessage(undefined, btn.title)}
                                  className={className}
                                >
                                  {btn.title}
                                </button>
                              );
                            }
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Typing indicator — assistant side */}
                {sendingMsg && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-white border border-gray-100 shadow-sm flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-500 shrink-0" />
                      <span className="text-[10px] text-gray-400 font-medium">Typing...</span>
                    </div>
                  </div>
                )}

                {/* Scroll anchor — 1px so scrollIntoView(block:'end') lands correctly */}
                <div ref={chatEndRef} style={{ height: 1, flexShrink: 0 }} />
              </div>
            </div>

            {/* ── Play / Reset pill (shrink-0) ── */}
            <div className="px-4 py-2.5 bg-white border-t border-gray-100 flex justify-center shrink-0">
              {chatHistory.length === 0 ? (
                <button
                  type="button"
                  onClick={handleTrySampleConversation}
                  disabled={sendingMsg || demoQueue.length > 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3 h-3 fill-current" /> Try Sample Conversation
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleResetChat}
                  disabled={sendingMsg}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Conversation
                </button>
              )}
            </div>

            {/* ── Input (shrink-0) ── */}
            <form
              onSubmit={handleSendMessage}
              className="px-3 py-3 bg-white border-t border-gray-100 flex gap-2 shrink-0"
            >
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                disabled={sendingMsg}
                placeholder="Type a mock message..."
                className="flex-1 h-9 px-3 text-xs rounded-xl bg-gray-50 border border-gray-200 outline-none text-gray-900 placeholder:text-gray-400 focus:border-emerald-400 focus:bg-white transition-colors"
              />
              <button
                type="submit"
                disabled={sendingMsg || !inputValue.trim()}
                className="h-9 w-9 flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors shrink-0"
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
