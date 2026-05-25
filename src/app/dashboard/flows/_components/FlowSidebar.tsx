"use client";

import { useState, useEffect, useMemo } from "react";
import { MessageSquare, SplitSquareVertical, Webhook, Sparkles, Clock, UserIcon, BookOpen, CircleStop, PlayCircle, Braces, Paintbrush, Database, Hourglass, FileText, Search, ChevronDown, ShoppingCart, Box, RefreshCw, ShoppingBag, ImageIcon, Mic, MapPin, List, LayoutGrid, FileQuestion, UserPlus, FileSignature, AlertCircle, Tag, GitBranch, Repeat, Globe, Phone, Mail, FileCheck, Star, ThumbsUp, CreditCard, ShieldCheck, Calendar, Building, Users, PiggyBank, Link2, Code, Terminal, X, CornerDownRight, HelpCircle, ListChecks, RefreshCcw, Edit3, Send } from "lucide-react";
import { useFlowStore } from "../store";
import { BUSINESS_TYPE_CONFIG } from "../config";

export const nodeCategories = [
  {
    id: "TRIGGERS", title: "Triggers", color: "#3B82F6",
    nodes: [
      { id: "trigger", type: "trigger", icon: PlayCircle, label: "Message Trigger", desc: "Any incoming message" },
      { id: "keyword_trigger", type: "trigger", icon: Tag, label: "Keyword Trigger", desc: "Match specific words" },
      { id: "button_trigger", type: "trigger", icon: LayoutGrid, label: "Button Click", desc: "Interactive button press" },
      { id: "webhook_trigger", type: "trigger", icon: Webhook, label: "Webhook Trigger", desc: "External HTTP event" },
      { id: "schedule_trigger", type: "trigger", icon: Clock, label: "Scheduled Time", desc: "Cron / time-based" },
      { id: "wait", type: "wait", icon: Hourglass, label: "Wait for Event", desc: "Pause until triggered" },
      { id: "resume", type: "resume", icon: AlertCircle, label: "Return to Listen", desc: "Resume main flow" },
      { id: "inactivity_trigger", type: "trigger", icon: CircleStop, label: "Inactivity Trigger", desc: "No reply timeout" },
    ]
  },
  {
    id: "MESSAGING", title: "Messaging", color: "#10B981",
    nodes: [
      { id: "standard", type: "standard", icon: MessageSquare, label: "Send Message", desc: "WhatsApp text" },
      { id: "send_media", type: "standard", icon: ImageIcon, label: "Send Media", desc: "Image / video / file" },
      { id: "send_audio", type: "standard", icon: Mic, label: "Send Audio", desc: "Voice message" },
      { id: "send_buttons", type: "standard", icon: LayoutGrid, label: "Interactive Buttons", desc: "Tap to reply" },
      { id: "send_list", type: "standard", icon: List, label: "List Menu", desc: "Scrollable options" },
      { id: "format", type: "format", icon: Paintbrush, label: "Format Response", desc: "Reshape output" },
      { id: "handoff", type: "handoff", icon: UserIcon, label: "Human Handoff", desc: "Transfer to agent" },
      { id: "assign_agent", type: "standard", icon: UserPlus, label: "Assign to Agent", desc: "Round-robin" },
    ]
  },
  {
    id: "AI_LOGIC", title: "AI & Logic", color: "#8B5CF6",
    nodes: [
      { id: "condition", type: "condition", icon: SplitSquareVertical, label: "Logic Branch", desc: "True / False split" },
      { id: "interruption", type: "interruption", icon: Sparkles, label: "AI Intent Handling", desc: "Contextual AI reply" },
      { id: "extract", type: "extract", icon: Braces, label: "Extract Entities", desc: "NLP entity pull" },
      { id: "memory", type: "memory", icon: Database, label: "Context Memory", desc: "Store session data" },
      { id: "knowledge", type: "knowledge", icon: BookOpen, label: "AI Knowledge Base", desc: "RAG-powered" },
      { id: "sentiment", type: "standard", icon: ThumbsUp, label: "Sentiment Analysis", desc: "Positive / negative" },
      { id: "intent_routing", type: "standard", icon: GitBranch, label: "Intent Routing", desc: "Route by intent" },
      { id: "end", type: "end", icon: CircleStop, label: "End Flow", desc: "Close conversation" },
    ]
  },
  {
    id: "ECOMMERCE", title: "E-Commerce", color: "#06B6D4",
    nodes: [
      { id: "show_products", type: "standard", icon: ShoppingBag, label: "Show Products", desc: "Product list" },
      { id: "add_cart", type: "standard", icon: ShoppingCart, label: "Add to Cart", desc: "Cart action" },
      { id: "checkout_link", type: "standard", icon: Link2, label: "Checkout Link", desc: "Payment URL" },
      { id: "payment_link", type: "standard", icon: CreditCard, label: "Payment Link", desc: "Razorpay / Stripe" },
      { id: "order_tracking", type: "standard", icon: Box, label: "Order Tracking", desc: "Track shipment" },
      { id: "returns_handler", type: "standard", icon: RefreshCw, label: "Returns Handler", desc: "Process return" },
    ]
  },
  {
    id: "APPOINTMENTS", title: "Appointments", color: "#F79009",
    nodes: [
      { id: "show_slots", type: "standard", icon: Calendar, label: "Show Slots", desc: "Available times" },
      { id: "book_appt", type: "standard", icon: Calendar, label: "Book Appointment", desc: "Google Calendar" },
      { id: "reschedule", type: "standard", icon: RefreshCw, label: "Reschedule", desc: "Change slot" },
      { id: "intake_form", type: "standard", icon: FileSignature, label: "Intake Form", desc: "Patient / client" },
      { id: "appt_reminder", type: "standard", icon: Clock, label: "Reminder", desc: "Pre-event alert" },
    ]
  },
  {
    id: "LEADGEN", title: "Lead Gen & CRM", color: "#F04438",
    nodes: [
      { id: "capture_lead", type: "standard", icon: UserPlus, label: "Capture Lead", desc: "Save contact" },
      { id: "collect_data", type: "collect_data", icon: ListChecks, label: "Collect Data Form", desc: "Multi-field capture" },
      { id: "lead_quiz", type: "standard", icon: FileQuestion, label: "Lead Quiz", desc: "Qualification quiz" },
      { id: "push_crm", type: "webhook", icon: Database, label: "Push to CRM", desc: "HubSpot / Zoho" },
      { id: "schedule_demo", type: "standard", icon: Calendar, label: "Schedule Demo", desc: "Book call" },
    ]
  },
  {
    id: "INTEGRATIONS", title: "Integrations", color: "#6366F1",
    nodes: [
      { id: "webhook", type: "webhook", icon: Webhook, label: "API Call", desc: "External HTTP" },
      { id: "gsheets", type: "webhook", icon: Database, label: "Google Sheets", desc: "Sync leads" },
      { id: "gcal", type: "webhook", icon: Calendar, label: "Google Calendar", desc: "Booking sync" },
      { id: "send_email", type: "standard", icon: Mail, label: "Send Email", desc: "Resend" },
      { id: "delay", type: "delay", icon: Clock, label: "Time Delay", desc: "Pause N seconds" },
      { id: "set_var", type: "standard", icon: Code, label: "Set Variable", desc: "Data mutation" },
      { id: "update_tag", type: "standard", icon: Tag, label: "Update Tag", desc: "Contact label" },
    ]
  },
  {
    id: "CUSTOM", title: "Custom", color: "#64748B",
    nodes: [
      { id: "custom_code", type: "standard", icon: Terminal, label: "Custom Code", desc: "JS / Python block" },
      { id: "custom_webhook", type: "webhook", icon: Webhook, label: "Custom Webhook", desc: "Bespoke HTTP" },
      { id: "custom_prompt", type: "interruption", icon: Sparkles, label: "Custom AI Prompt", desc: "Free-form LLM" },
      { id: "custom_cond", type: "condition", icon: SplitSquareVertical, label: "Custom Condition", desc: "Any logic" },
    ]
  }
];

export const getDefaultNodeData = (id: string) => {
  const map: Record<string, Record<string, unknown>> = {
    trigger: { label: "Incoming Message", triggerType: "Any Message" },
    extract: { label: "Extract Contact Info", entities: ["name", "email", "phone"] },
    memory: { label: "Save Context", scope: "User Session" },
    format: { label: "Clean Formatting", formatType: "Add Quick Replies" },
    standard: { label: "Send Message", content: "Type your message..." },
    interruption: { label: "Intent Handling", userQuery: "Wait, what's your pricing?", aiResponse: "Our plans start at ₹2,999/mo." },
    knowledge: { label: "AI Knowledge", source: "Help Center Docs" },
    resume: { label: "Return to Listening" },
    condition: { label: "Condition", field: "confidence", operator: ">", value: "0.7" },
    webhook: { label: "API Request", method: "POST", url: "https://api.example.com" },
    delay: { label: "Delay", duration: "2" },
    wait: { label: "Wait for Event", event: "Payment Webhook" },
    collect_data: { label: "Collect Data Form", fields: ["Name", "Email", "Phone", "Company"] },
    resume_parser: { label: "Parse Resume PDF", extracts: "Skills, Experience" },
    handoff: { label: "Human Handoff", team: "Support Team" },
    end: { label: "End Flow" },
  };
  if (map[id]) return map[id];
  for (const cat of nodeCategories) {
    const node = cat.nodes.find(n => n.id === id);
    if (node) return { label: node.label, content: `Configure ${node.label}...` };
  }
  return { label: "Custom Node", content: "Configure node..." };
};

export default function FlowSidebar({ businessType = 'blank' }: { businessType?: string }) {
  const { addNode, setSelectedNodeId } = useFlowStore();
  const [searchQuery, setSearchQuery] = useState("");
  const config = BUSINESS_TYPE_CONFIG[businessType] || BUSINESS_TYPE_CONFIG['blank'];
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const init: Record<string, boolean> = {};
    nodeCategories.forEach(cat => {
      const saved = localStorage.getItem(`flow_${businessType}_section_${cat.id}_open`);
      init[cat.id] = saved !== null ? saved === 'true' : config.openSections.includes(cat.id);
    });
    setOpenSections(init);
  }, [businessType, config]);

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(`flow_${businessType}_section_${id}_open`, String(next[id]));
      return next;
    });
  };

  const onDragStart = (event: React.DragEvent, node: any) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ type: node.type, id: node.id }));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onAddClick = (node: any) => {
    const nodeId = `node_${Math.random().toString(36).substr(2, 9)}`;
    addNode({ id: nodeId, type: node.type, x: 400, y: 300, position: { x: 400, y: 300 }, data: getDefaultNodeData(node.id) } as any);
    setTimeout(() => setSelectedNodeId(nodeId), 50);
  };

  const query = searchQuery.toLowerCase().trim();
  const isSearchActive = query.length > 0;

  const filteredCategories = useMemo(() => {
    return nodeCategories.map(cat => ({
      ...cat,
      nodes: isSearchActive
        ? cat.nodes.filter(n => n.label.toLowerCase().includes(query) || n.desc.toLowerCase().includes(query))
        : cat.nodes
    })).filter(cat => !isSearchActive || cat.nodes.length > 0);
  }, [query, isSearchActive]);

  const totalCount = filteredCategories.reduce((s, c) => s + c.nodes.length, 0);

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .sb-scroll::-webkit-scrollbar{width:3px}
        .sb-scroll::-webkit-scrollbar-track{background:transparent}
        .sb-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
      `}} />
      <div className="w-[280px] flex-shrink-0 flex flex-col h-full" style={{ background: 'rgba(13,17,23,0.85)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.05)', zIndex: 10 }}>

        {/* Header */}
        <div className="px-4 pt-5 pb-4 flex-shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-4" style={{ color: 'rgba(255,255,255,0.18)' }}>Nodes</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'rgba(255,255,255,0.22)' }} />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setSearchQuery(""); }}
              aria-label="Search nodes"
              className="w-full h-10 pl-9 pr-9 text-[13px] focus:outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '14px',
                color: 'rgba(255,255,255,0.8)',
              }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.14)'; (e.target as HTMLInputElement).style.background = 'rgba(255,255,255,0.06)'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.target as HTMLInputElement).style.background = 'rgba(255,255,255,0.04)'; }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-white/[0.08] transition-colors">
                <X className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
              </button>
            )}
          </div>
        </div>

        <div className="h-px mx-4" style={{ background: 'rgba(255,255,255,0.04)' }} />

        {/* Nodes */}
        <div className="flex-1 overflow-y-auto sb-scroll pt-2 pb-3">
          {filteredCategories.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <Search className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.15)' }} />
              <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>No nodes found</p>
            </div>
          )}
          {filteredCategories.map(cat => {
            const isOpen = isSearchActive ? true : (!mounted ? config.openSections.includes(cat.id) : !!openSections[cat.id]);
            const isHighlighted = config.highlightedSection === cat.id;
            return (
              <div key={cat.id} className="mb-0.5">
                <button
                  onClick={() => !isSearchActive && toggleSection(cat.id)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between px-4 py-2.5 transition-colors"
                  style={{ background: isHighlighted ? `${cat.color}08` : 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isHighlighted ? `${cat.color}08` : 'transparent'; }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-[5px] h-[5px] rounded-full" style={{ background: isOpen ? cat.color : 'rgba(255,255,255,0.2)' }} />
                    <span className="text-[11px] font-semibold tracking-[0.06em]" style={{ color: isOpen ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.28)' }}>
                      {cat.title.toUpperCase()}
                    </span>
                    {isHighlighted && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: `${cat.color}18`, color: cat.color }}>REC</span>
                    )}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200" style={{ color: 'rgba(255,255,255,0.18)', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
                </button>
                {isOpen && (
                  <div className="px-2.5 space-y-0.5 pb-2">
                    {cat.nodes.map(node => {
                      const Icon = node.icon;
                      return (
                        <div
                          key={node.id}
                          draggable
                          onDragStart={e => onDragStart(e, node)}
                          onClick={() => onAddClick(node)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => e.key === 'Enter' && onAddClick(node)}
                          title={`${node.label} — drag or click to add`}
                          className="flex items-center gap-3 px-2.5 py-2.5 rounded-[14px] cursor-grab active:cursor-grabbing select-none transition-all duration-150"
                          style={{ background: 'transparent' }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                            (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                          }}
                        >
                          <div
                            className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${cat.color}20 0%, ${cat.color}0a 100%)`,
                              border: `1px solid ${cat.color}28`,
                              color: cat.color,
                            }}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] font-medium leading-tight truncate" style={{ color: 'rgba(255,255,255,0.82)' }}>{node.label}</div>
                            <div className="text-[10.5px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>{(node as any).desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <p className="text-[10.5px] text-center" style={{ color: isSearchActive ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.15)' }}>
            {isSearchActive ? `${totalCount} result${totalCount !== 1 ? 's' : ''} found` : 'Drag or click to place nodes'}
          </p>
        </div>
      </div>
    </>
  );
}
