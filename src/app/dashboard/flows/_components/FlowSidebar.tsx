"use client";

import { useState, useEffect, useMemo } from "react";
import { MessageSquare, SplitSquareVertical, Webhook, HandMetal, Sparkles, Clock, UserIcon, BookOpen, CircleStop, PlayCircle, Braces, Paintbrush, Database, Hourglass, FileText, Search, ChevronRight, ShoppingCart, Box, RefreshCw, ShoppingBag, ImageIcon, Mic, MapPin, List, LayoutGrid, FileQuestion, Send, UserPlus, FileSignature, AlertCircle, RefreshCcw, Tag, GitBranch, Repeat, Globe, Phone, Mail, FileCheck, Star, ThumbsUp, CreditCard, ShieldCheck, Calendar, Building, Users, PiggyBank, Link2, Code, Terminal, Edit3, X, CornerDownRight, HelpCircle } from "lucide-react";
import { useFlowStore } from "../store";
import { useReactFlow } from "@xyflow/react";
import { BUSINESS_TYPE_CONFIG } from "../config";

export const nodeCategories = [
  {
    id: "TRIGGERS", title: "Triggers", color: "#12B76A",
    nodes: [
      { id: "trigger", type: "trigger", icon: PlayCircle, label: "Message Trigger" },
      { id: "keyword_trigger", type: "trigger", icon: Tag, label: "Keyword Trigger" },
      { id: "button_trigger", type: "trigger", icon: LayoutGrid, label: "Button Click Trigger" },
      { id: "form_trigger", type: "trigger", icon: FileSignature, label: "Form Submitted Trigger" },
      { id: "payment_trigger", type: "trigger", icon: CreditCard, label: "Payment Received Trigger" },
      { id: "appointment_trigger", type: "trigger", icon: Calendar, label: "Appointment Booked Trigger" },
      { id: "lead_trigger", type: "trigger", icon: UserPlus, label: "New Lead Trigger" },
      { id: "webhook_trigger", type: "trigger", icon: Webhook, label: "Webhook Trigger" },
      { id: "schedule_trigger", type: "trigger", icon: Clock, label: "Schedule / Time Trigger" },
      { id: "wait", type: "wait", icon: Hourglass, label: "Wait for Event" },
      { id: "resume", type: "resume", icon: HandMetal, label: "Return to Listening" },
      { id: "inactivity_trigger", type: "trigger", icon: CircleStop, label: "Inactivity Trigger" },
    ]
  },
  {
    id: "MESSAGING", title: "Messaging", color: "#3B82F6",
    nodes: [
      { id: "standard", type: "standard", icon: MessageSquare, label: "Send Message" },
      { id: "send_media", type: "standard", icon: ImageIcon, label: "Send Image / Video / File" },
      { id: "send_audio", type: "standard", icon: Mic, label: "Send Audio Message" },
      { id: "send_location", type: "standard", icon: MapPin, label: "Send Location" },
      { id: "send_buttons", type: "standard", icon: LayoutGrid, label: "Send Interactive Buttons" },
      { id: "send_list", type: "standard", icon: List, label: "Send List Menu" },
      { id: "send_catalog", type: "standard", icon: ShoppingBag, label: "Send Product Catalog" },
      { id: "send_quick_replies", type: "standard", icon: MessageSquare, label: "Send Quick Replies" },
      { id: "format", type: "format", icon: Paintbrush, label: "Format Response" },
      { id: "collect_input", type: "standard", icon: Edit3, label: "Collect User Input" },
      { id: "ask_question", type: "standard", icon: FileQuestion, label: "Ask Question" },
      { id: "multi_step_form", type: "standard", icon: FileSignature, label: "Multi-step Form" },
      { id: "handoff", type: "handoff", icon: UserIcon, label: "Human Handoff" },
      { id: "assign_agent", type: "standard", icon: UserPlus, label: "Assign to Agent" },
      { id: "transfer_dept", type: "standard", icon: Building, label: "Transfer to Department" },
    ]
  },
  {
    id: "AI & LOGIC", title: "AI & Logic", color: "#7C3AED",
    nodes: [
      { id: "condition", type: "condition", icon: SplitSquareVertical, label: "Logic Branch" },
      { id: "interruption", type: "interruption", icon: Sparkles, label: "AI Intent Handling" },
      { id: "extract", type: "extract", icon: Braces, label: "Extract Entities" },
      { id: "memory", type: "memory", icon: Database, label: "Context Memory" },
      { id: "knowledge", type: "knowledge", icon: BookOpen, label: "AI Knowledge Base" },
      { id: "sentiment", type: "standard", icon: ThumbsUp, label: "Sentiment Analysis" },
      { id: "language", type: "standard", icon: Globe, label: "Language Detection" },
      { id: "translate", type: "standard", icon: Globe, label: "Auto Translate" },
      { id: "smart_fallback", type: "standard", icon: AlertCircle, label: "Smart Fallback" },
      { id: "intent_routing", type: "standard", icon: GitBranch, label: "Intent Routing" },
      { id: "condition_check", type: "condition", icon: FileCheck, label: "Condition Check" },
      { id: "ab_test", type: "condition", icon: SplitSquareVertical, label: "A/B Split Test" },
      { id: "random_branch", type: "condition", icon: GitBranch, label: "Random Branch" },
      { id: "loop", type: "standard", icon: Repeat, label: "Loop / Repeat" },
      { id: "end", type: "end", icon: CircleStop, label: "End Flow" },
    ]
  },
  {
    id: "E-COMMERCE", title: "E-Commerce", color: "#06B6D4",
    nodes: [
      { id: "show_products", type: "standard", icon: ShoppingBag, label: "Show Products" },
      { id: "product_search", type: "standard", icon: Search, label: "Product Search" },
      { id: "product_rec", type: "standard", icon: Star, label: "Product Recommendation" },
      { id: "add_cart", type: "standard", icon: ShoppingCart, label: "Add to Cart" },
      { id: "view_cart", type: "standard", icon: ShoppingCart, label: "View Cart" },
      { id: "cart_abandonment", type: "standard", icon: ShoppingCart, label: "Cart Abandonment" },
      { id: "checkout_link", type: "standard", icon: Link2, label: "Checkout Link Sender" },
      { id: "payment_link", type: "standard", icon: CreditCard, label: "Payment Link Sender" },
      { id: "cod_confirm", type: "standard", icon: ShieldCheck, label: "COD Confirmation" },
      { id: "order_confirm", type: "standard", icon: FileCheck, label: "Order Confirmation" },
      { id: "order_tracking", type: "standard", icon: Box, label: "Order Tracking" },
      { id: "delivery_status", type: "standard", icon: Box, label: "Delivery Status Update" },
      { id: "returns_handler", type: "standard", icon: RefreshCw, label: "Returns Handler" },
      { id: "refund_status", type: "standard", icon: RefreshCcw, label: "Refund Status" },
      { id: "invoice_sender", type: "standard", icon: FileText, label: "Invoice & Receipt Sender" },
      { id: "coupon", type: "standard", icon: Tag, label: "Coupon / Discount Code" },
      { id: "out_of_stock", type: "standard", icon: AlertCircle, label: "Out of Stock Alert" },
      { id: "back_in_stock", type: "standard", icon: RefreshCw, label: "Back in Stock Notify" },
      { id: "upsell", type: "standard", icon: ShoppingBag, label: "Upsell / Cross-sell" },
      { id: "reorder", type: "standard", icon: Repeat, label: "Reorder Reminder" },
      { id: "wishlist", type: "standard", icon: Star, label: "Wishlist Nudge" },
      { id: "review_req", type: "standard", icon: Star, label: "Review Request" },
      { id: "address_col", type: "standard", icon: MapPin, label: "Address Collector" },
    ]
  },
  {
    id: "APPOINTMENTS & SERVICES", title: "Appointments & Services", color: "#F79009",
    nodes: [
      { id: "show_slots", type: "standard", icon: Calendar, label: "Show Available Slots" },
      { id: "book_appt", type: "standard", icon: Calendar, label: "Book Appointment" },
      { id: "reschedule", type: "standard", icon: RefreshCw, label: "Reschedule Appointment" },
      { id: "cancel_appt", type: "standard", icon: X, label: "Cancel Appointment" },
      { id: "appt_reminder", type: "standard", icon: Clock, label: "Appointment Reminder" },
      { id: "intake_form", type: "standard", icon: FileSignature, label: "Send Intake Form" },
      { id: "service_menu", type: "standard", icon: List, label: "Service Menu" },
      { id: "pricing_enquiry", type: "standard", icon: CreditCard, label: "Pricing Enquiry Handler" },
      { id: "staff_selector", type: "standard", icon: Users, label: "Staff / Doctor Selector" },
      { id: "location_selector", type: "standard", icon: MapPin, label: "Location Selector" },
      { id: "post_followup", type: "standard", icon: MessageSquare, label: "Post-service Follow-up" },
      { id: "sub_renewal", type: "standard", icon: Repeat, label: "Subscription Renewal Reminder" },
      { id: "membership_check", type: "standard", icon: ShieldCheck, label: "Membership Status Check" },
      { id: "waitlist", type: "standard", icon: Hourglass, label: "Waitlist Handler" },
    ]
  },
  {
    id: "LEAD GENERATION & CRM", title: "Lead Generation & CRM", color: "#F04438",
    nodes: [
      { id: "capture_lead", type: "standard", icon: UserPlus, label: "Capture Lead" },
      { id: "lead_quiz", type: "standard", icon: FileQuestion, label: "Lead Qualification Quiz" },
      { id: "lead_score", type: "standard", icon: Star, label: "Lead Score Updater" },
      { id: "push_crm", type: "webhook", icon: Database, label: "Push to CRM" },
      { id: "assign_sales", type: "standard", icon: Users, label: "Assign to Sales Rep" },
      { id: "send_proposal", type: "standard", icon: FileText, label: "Send Proposal / Brochure" },
      { id: "schedule_demo", type: "standard", icon: Calendar, label: "Schedule Demo" },
      { id: "followup_seq", type: "standard", icon: Repeat, label: "Follow-up Sequence" },
      { id: "deal_stage", type: "standard", icon: GitBranch, label: "Deal Stage Updater" },
      { id: "lost_lead", type: "standard", icon: AlertCircle, label: "Lost Lead Handler" },
      { id: "reengagement", type: "standard", icon: RefreshCw, label: "Re-engagement Flow" },
      { id: "referral", type: "standard", icon: Users, label: "Referral Collector" },
      { id: "testimonial", type: "standard", icon: Star, label: "Testimonial Request" },
      { id: "nps_survey", type: "standard", icon: ThumbsUp, label: "NPS Survey" },
    ]
  },
  {
    id: "REAL ESTATE", title: "Real Estate", color: "#8B5CF6",
    nodes: [
      { id: "prop_search", type: "standard", icon: Search, label: "Property Search" },
      { id: "show_listings", type: "standard", icon: Building, label: "Show Listings" },
      { id: "site_visit", type: "standard", icon: Calendar, label: "Schedule Site Visit" },
      { id: "floor_plan", type: "standard", icon: ImageIcon, label: "Send Floor Plan / Brochure" },
      { id: "emi_calc", type: "standard", icon: CreditCard, label: "Loan / EMI Calculator" },
      { id: "builder_info", type: "standard", icon: Building, label: "Builder Info Sender" },
      { id: "project_status", type: "standard", icon: Clock, label: "Project Status Update" },
      { id: "token_amount", type: "standard", icon: CreditCard, label: "Token Amount Collector" },
      { id: "rera_details", type: "standard", icon: FileCheck, label: "RERA Details Sender" },
      { id: "locality_info", type: "standard", icon: MapPin, label: "Locality Info Handler" },
    ]
  },
  {
    id: "EDUCATION & COACHING", title: "Education & Coaching", color: "#EAB308",
    nodes: [
      { id: "course_cat", type: "standard", icon: BookOpen, label: "Course Catalogue Sender" },
      { id: "enrolment", type: "standard", icon: UserPlus, label: "Enrolment Handler" },
      { id: "fee_reminder", type: "standard", icon: CreditCard, label: "Fee Payment Reminder" },
      { id: "study_material", type: "standard", icon: FileText, label: "Study Material Sender" },
      { id: "quiz_eval", type: "standard", icon: FileQuestion, label: "Quiz / Assessment" },
      { id: "result_notify", type: "standard", icon: Star, label: "Result Notifier" },
      { id: "batch_schedule", type: "standard", icon: Calendar, label: "Batch / Class Schedule" },
      { id: "attendance", type: "standard", icon: Users, label: "Attendance Reminder" },
      { id: "doubt_col", type: "standard", icon: HelpCircle, label: "Doubt Collector" },
      { id: "cert_sender", type: "standard", icon: FileSignature, label: "Certificate Sender" },
      { id: "parent_update", type: "standard", icon: MessageSquare, label: "Parent Update Flow" },
      { id: "demo_class", type: "standard", icon: Calendar, label: "Demo Class Booker" },
    ]
  },
  {
    id: "RECRUITMENT & HR", title: "Recruitment & HR", color: "#EC4899",
    nodes: [
      { id: "job_listing", type: "standard", icon: List, label: "Job Listing Sender" },
      { id: "app_col", type: "standard", icon: FileSignature, label: "Application Collector" },
      { id: "resume_parser", type: "resume_parser", icon: FileText, label: "Parse Resume PDF" },
      { id: "candidate_quiz", type: "standard", icon: FileQuestion, label: "Candidate Screening Quiz" },
      { id: "interview_sch", type: "standard", icon: Calendar, label: "Interview Scheduler" },
      { id: "offer_letter", type: "standard", icon: FileText, label: "Offer Letter Sender" },
      { id: "rejection", type: "standard", icon: X, label: "Rejection Handler" },
      { id: "onboarding", type: "standard", icon: Users, label: "Onboarding Flow" },
      { id: "doc_col", type: "standard", icon: FileSignature, label: "Document Collector" },
      { id: "emp_faq", type: "knowledge", icon: HelpCircle, label: "Employee FAQ Handler" },
    ]
  },
  {
    id: "RESTAURANTS & FOOD", title: "Restaurants & Food", color: "#D97706",
    nodes: [
      { id: "show_menu", type: "standard", icon: List, label: "Show Menu" },
      { id: "take_order", type: "standard", icon: ShoppingCart, label: "Take Order" },
      { id: "table_res", type: "standard", icon: Calendar, label: "Table Reservation" },
      { id: "del_pickup", type: "standard", icon: MapPin, label: "Delivery / Pickup Selector" },
      { id: "special_req", type: "standard", icon: MessageSquare, label: "Special Request Collector" },
      { id: "food_status", type: "standard", icon: Clock, label: "Order Status Update" },
      { id: "bill_sender", type: "standard", icon: CreditCard, label: "Bill Sender" },
      { id: "daily_spec", type: "standard", icon: Star, label: "Daily Special Notifier" },
      { id: "loyalty_pts", type: "standard", icon: Star, label: "Loyalty Points Checker" },
      { id: "feedback_col", type: "standard", icon: ThumbsUp, label: "Feedback Collector" },
      { id: "catering_enq", type: "standard", icon: Users, label: "Catering Enquiry Handler" },
    ]
  },
  {
    id: "FINANCE & INSURANCE", title: "Finance & Insurance", color: "#0891B2",
    nodes: [
      { id: "prem_reminder", type: "standard", icon: Clock, label: "Premium / EMI Reminder" },
      { id: "policy_det", type: "standard", icon: FileText, label: "Policy Details Sender" },
      { id: "claim_init", type: "standard", icon: ShieldCheck, label: "Claim Initiation Handler" },
      { id: "kyc_doc", type: "standard", icon: FileSignature, label: "KYC Document Collector" },
      { id: "loan_elig", type: "standard", icon: FileCheck, label: "Loan Eligibility Checker" },
      { id: "invest_info", type: "standard", icon: PiggyBank, label: "Investment Info Sender" },
      { id: "stmt_req", type: "standard", icon: FileText, label: "Statement Request Handler" },
      { id: "due_date", type: "standard", icon: AlertCircle, label: "Due Date Alert" },
      { id: "pay_conf", type: "standard", icon: ShieldCheck, label: "Payment Confirmation" },
    ]
  },
  {
    id: "INTEGRATIONS", title: "Integrations", color: "#6366F1",
    nodes: [
      { id: "webhook", type: "webhook", icon: Webhook, label: "External API Call" },
      { id: "shopify", type: "webhook", icon: ShoppingBag, label: "Shopify Connector" },
      { id: "woo", type: "webhook", icon: ShoppingCart, label: "WooCommerce Connector" },
      { id: "razorpay", type: "webhook", icon: CreditCard, label: "Razorpay / Stripe Connector" },
      { id: "gsheets", type: "webhook", icon: Database, label: "Google Sheets Sync" },
      { id: "zapier", type: "webhook", icon: Webhook, label: "Zapier Webhook" },
      { id: "crm_push", type: "webhook", icon: Database, label: "CRM Push (HubSpot / Zoho)" },
      { id: "gcal", type: "webhook", icon: Calendar, label: "Google Calendar Sync" },
      { id: "airtable", type: "webhook", icon: Database, label: "Airtable Sync" },
      { id: "notify_team", type: "standard", icon: MessageSquare, label: "Notify Team (Slack / Email)" },
      { id: "send_email", type: "standard", icon: Mail, label: "Send Email" },
      { id: "send_sms", type: "standard", icon: Phone, label: "Send SMS" },
      { id: "delay", type: "delay", icon: Clock, label: "Time Delay" },
      { id: "set_var", type: "standard", icon: Code, label: "Set Variable" },
      { id: "update_tag", type: "standard", icon: Tag, label: "Update Contact Tag" },
    ]
  },
  {
    id: "CUSTOM", title: "Custom", color: "#64748B",
    nodes: [
      { id: "custom_code", type: "standard", icon: Terminal, label: "Custom Code Block" },
      { id: "custom_webhook", type: "webhook", icon: Webhook, label: "Custom Webhook" },
      { id: "custom_var", type: "standard", icon: Code, label: "Custom Variable" },
      { id: "custom_cond", type: "condition", icon: SplitSquareVertical, label: "Custom Condition" },
      { id: "custom_prompt", type: "interruption", icon: Sparkles, label: "Custom AI Prompt" },
      { id: "custom_msg", type: "standard", icon: Edit3, label: "Custom Message Format" },
      { id: "custom_tag", type: "standard", icon: Tag, label: "Custom Tag / Label" },
      { id: "custom_notify", type: "standard", icon: AlertCircle, label: "Custom Notification" },
      { id: "custom_api", type: "standard", icon: Braces, label: "Custom API Response" },
      { id: "custom_jump", type: "standard", icon: CornerDownRight, label: "Custom Flow Jump" },
    ]
  }
];

export const getDefaultNodeData = (id: string) => {
  switch (id) {
    case 'trigger': return { label: "Incoming Message", triggerType: "Any Message" };
    case 'extract': return { label: "Extract Contact Info", entities: ["name", "email", "phone"] };
    case 'memory': return { label: "Save Context", scope: "User Session" };
    case 'format': return { label: "Clean Formatting", formatType: "Add Quick Replies" };
    case 'standard': return { label: "Send Message", content: "Type your message..." };
    case 'interruption': return { label: "Intent Handling", userQuery: "Wait, what's your pricing?", aiResponse: "Our plans start at ₹2,999/mo." };
    case 'knowledge': return { label: "AI Knowledge", source: "Help Center Docs" };
    case 'resume': return { label: "Return to Listening" };
    case 'condition': return { label: "Condition", field: "confidence", operator: ">", value: "0.7" };
    case 'webhook': return { label: "API Request", method: "POST", url: "https://api.example.com" };
    case 'delay': return { label: "Delay", duration: "2" };
    case 'wait': return { label: "Wait for Event", event: "Payment Webhook" };
    case 'resume_parser': return { label: "Parse Resume PDF", extracts: "Skills, Experience" };
    case 'handoff': return { label: "Human Handoff", team: "Support Team" };
    case 'end': return { label: "End Flow" };
  }

  for (const cat of nodeCategories) {
    const node = cat.nodes.find(n => n.id === id);
    if (node) {
      return { label: node.label, content: `Configure ${node.label}...` };
    }
  }

  return { label: "Custom Node", content: "Configure node..." };
};

export default function FlowSidebar({ businessType = 'blank' }: { businessType?: string }) {
  const { addNode, setSelectedNodeId } = useFlowStore();
  const { screenToFlowPosition } = useReactFlow();
  const [searchQuery, setSearchQuery] = useState("");
  
  const config = BUSINESS_TYPE_CONFIG[businessType] || BUSINESS_TYPE_CONFIG['blank'];
  
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const initialOpenState: Record<string, boolean> = {};
    nodeCategories.forEach(cat => {
      const saved = localStorage.getItem(`flow_${businessType}_section_${cat.id}_open`);
      if (saved !== null) {
        initialOpenState[cat.id] = saved === 'true';
      } else {
        initialOpenState[cat.id] = config.openSections.includes(cat.id);
      }
    });
    setOpenSections(initialOpenState);
  }, [businessType, config]);

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const newState = { ...prev, [id]: !prev[id] };
      localStorage.setItem(`flow_${businessType}_section_${id}_open`, String(newState[id]));
      return newState;
    });
  };

  const onDragStart = (event: React.DragEvent, node: any) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify({ type: node.type, id: node.id }));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onAddClick = (node: any) => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 100,
    });

    const nodeId = `node_${Math.random().toString(36).substr(2, 9)}`;
    addNode({
      id: nodeId,
      type: node.type,
      position,
      data: getDefaultNodeData(node.id),
    });
    setTimeout(() => setSelectedNodeId(nodeId), 50);
  };

  const query = searchQuery.toLowerCase();
  let totalNodes = 0;
  
  const isSearchActive = query.trim().length > 0;

  const filteredCategories = useMemo(() => {
    let count = 0;
    const filtered = nodeCategories.map(cat => {
      const catMatches = cat.title.toLowerCase().includes(query);
      const filteredNodes = cat.nodes.filter(n => 
        catMatches || n.label.toLowerCase().includes(query)
      );
      count += filteredNodes.length;
      return { ...cat, nodes: filteredNodes };
    }).filter(cat => cat.nodes.length > 0);
    totalNodes = count;
    return { filtered, count };
  }, [query]);

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .sidebar-scroll::-webkit-scrollbar { width: 6px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; transition: background-color 150ms ease; }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .node-hover-group:hover span { color: rgba(255,255,255,0.95) !important; }
        .node-hover-group:hover svg { opacity: 1 !important; }
      `}} />

      <div className="w-[220px] flex-shrink-0 bg-[#1A1A1A] border-r border-[rgba(255,255,255,0.08)] flex flex-col z-10 relative h-full pt-3 pb-4">
        
        <div className="px-3 mb-4 flex-shrink-0">
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[rgba(255,255,255,0.4)] pointer-events-none" />
            <input 
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchQuery("");
                if (e.key === 'Backspace' && !searchQuery) setSearchQuery("");
              }}
              aria-label="Search nodes"
              className="w-full h-10 bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] rounded-lg pl-9 pr-3 py-2 text-[13px] text-gray-300 placeholder:text-[rgba(255,255,255,0.4)] focus:outline-none focus:bg-[rgba(255,255,255,0.1)] focus:border-[rgba(255,255,255,0.2)] focus:shadow-[0_0_0_2px_rgba(18,183,106,0.1)] hover:bg-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] transition-all duration-150 font-mono"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto sidebar-scroll">
          {filteredCategories.filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-gray-500 italic text-sm">No nodes found</p>
            </div>
          ) : (
            filteredCategories.filtered.map((cat) => {
              // Open by default if not mounted (fallback), or if searched, or if saved in localStorage
              const isOpen = isSearchActive ? true : (!mounted ? config.openSections.includes(cat.id) : openSections[cat.id]);
              const isHighlighted = config.highlightedSection === cat.id;
              const activeColor = isHighlighted ? '#06B6D4' : 'rgba(255,255,255,0.4)';
              const hoverColor = isHighlighted ? '#06B6D4' : 'rgba(255,255,255,0.6)';
              
              return (
                <div key={cat.id} className="mb-0">
                  <button 
                    onClick={() => !isSearchActive && toggleSection(cat.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between px-3 py-3 group border-none transition-colors duration-150 ease-out outline-none focus:border-[1px] focus:border-dashed focus:border-[rgba(255,255,255,0.3)] relative"
                    style={{
                      backgroundColor: isHighlighted ? `rgba(6, 182, 212, 0.05)` : 'transparent',
                      borderLeft: isHighlighted ? `2px solid ${activeColor}` : '2px solid transparent',
                      boxShadow: isHighlighted ? `inset 1px 0 0 rgba(6, 182, 212, 0.1)` : 'none',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span 
                        className="text-[10px] uppercase font-semibold tracking-[0.1em] font-mono leading-none transition-colors"
                        style={{ color: isHighlighted ? activeColor : hoverColor }}
                      >
                        {cat.title}
                      </span>
                      {isHighlighted && (
                        <span 
                          className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded-[4px]"
                          style={{ backgroundColor: `rgba(6, 182, 212, 0.1)`, color: activeColor }}
                        >
                          RECOMMENDED
                        </span>
                      )}
                    </div>
                    <ChevronRight 
                      className="w-4 h-4 ml-auto transition-transform" 
                      style={{ 
                        color: activeColor,
                        transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                        transitionDuration: '200ms',
                        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
                      }} 
                    />
                  </button>
                  
                  <div 
                    className="overflow-hidden"
                    style={{ 
                      maxHeight: isOpen ? '2000px' : '0px',
                      transitionProperty: 'max-height',
                      transitionDuration: '200ms',
                      transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                      display: !isOpen && mounted && !isSearchActive ? 'none' : 'block' // Ensure display none when closed to fix layout overlap if any
                    }}
                  >
                    <div className="pb-2 pt-1">
                      {cat.nodes.map((node, i) => {
                        const Icon = node.icon;
                        return (
                          <div 
                            key={node.id}
                            draggable
                            onDragStart={(e) => onDragStart(e, node)}
                            onClick={() => onAddClick(node)}
                            role="button"
                            title={node.label}
                            style={{
                              transitionProperty: 'all',
                              transitionDuration: '150ms',
                              transitionTimingFunction: 'ease',
                              opacity: isOpen ? 1 : 0,
                              animationDelay: isOpen ? `${i * 30}ms` : '0ms'
                            }}
                            className="flex items-center gap-2 px-3 py-[8px] h-[32px] rounded-md cursor-grab active:cursor-grabbing hover:bg-[rgba(255,255,255,0.04)] active:bg-[rgba(255,255,255,0.06)] active:scale-[0.98] group node-hover-group select-none outline-none focus:bg-[rgba(255,255,255,0.06)]"
                          >
                            <Icon 
                              className="w-[14px] h-[14px] flex-shrink-0 mr-1 transition-all duration-150 ease" 
                              style={{ color: isHighlighted ? activeColor : 'rgba(255,255,255,0.4)' }}
                            />
                            <span className="text-[12px] font-sans font-medium truncate flex-1 leading-[1.4]" style={{ color: 'rgba(255,255,255,0.5)', transition: 'color 150ms ease' }}>
                              {node.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {filteredCategories.count > 0 && (
          <div className="sticky bottom-0 h-10 px-3 py-3 border-t border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.2)] flex items-center justify-center">
            <p className={`text-[11px] font-mono text-center ${isSearchActive ? 'text-[#12B76A]' : 'text-[rgba(255,255,255,0.5)]'}`}>
              {isSearchActive ? `${filteredCategories.count} results` : `150+ nodes available`}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
