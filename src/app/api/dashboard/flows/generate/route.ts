import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env, isSupabaseConfigured } from '@/lib/env';

// ── Deterministic flow templates keyed by intent keyword ─────────────────────
// The AI layer normalises the prompt into an intent, then we return a
// structured graph. This avoids hallucinated invalid node configs.

type NodeDef = { id: string; type: string; label: string; x: number; y: number; extra?: Record<string,unknown> };
type EdgeDef = { source: string; target: string; sourceHandle?: string; label?: string };

interface FlowBlueprint {
  name:  string;
  nodes: NodeDef[];
  edges: EdgeDef[];
}

const BLUEPRINTS: Record<string, FlowBlueprint> = {
  reservation: {
    name: 'Restaurant Reservation',
    nodes: [
      { id: 'n1', type: 'trigger',       label: 'Keyword Trigger',     x: 300, y: 40,  extra: { triggerType: 'keyword', keywords: ['reserve','book','reservation','table'] } },
      { id: 'n2', type: 'standard',      label: 'Welcome',             x: 300, y: 170, extra: { content: "Hi! I'd love to help you reserve a table. How many guests will be joining? 🍽️" } },
      { id: 'n3', type: 'intake_form',   label: 'Collect Guest Info',  x: 300, y: 320, extra: { fields: [{ id: 'f1', name: 'Number of guests', type: 'text', required: true, saveAs: 'guests', placeholder: 'e.g. 4' },{ id: 'f2', name: 'Preferred date', type: 'text', required: true, saveAs: 'date', placeholder: 'e.g. 28 May, 8pm' },{ id: 'f3', name: 'Special occasion?', type: 'text', required: false, saveAs: 'occasion', placeholder: 'e.g. Birthday' }] } },
      { id: 'n4', type: 'standard',      label: 'Confirm Reservation', x: 300, y: 500, extra: { content: "Perfect! I've noted your reservation for {{guests}} guests on {{date}}. We'll confirm via WhatsApp shortly. 🎉" } },
      { id: 'n5', type: 'end',           label: 'End',                 x: 300, y: 640 },
    ],
    edges: [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
      { source: 'n3', target: 'n4' },
      { source: 'n4', target: 'n5' },
    ],
  },
  lead: {
    name: 'Lead Capture Flow',
    nodes: [
      { id: 'n1', type: 'trigger',     label: 'Any Message Trigger', x: 300, y: 40,  extra: { triggerType: 'any_message' } },
      { id: 'n2', type: 'standard',    label: 'Greeting',            x: 300, y: 170, extra: { content: "Hi! 👋 Thanks for reaching out. I'll help you get started. May I have your name?" } },
      { id: 'n3', type: 'intake_form', label: 'Collect Lead Info',   x: 300, y: 320, extra: { fields: [{ id: 'f1', name: 'Your name', type: 'text', required: true, saveAs: 'name', placeholder: 'Full name' },{ id: 'f2', name: 'Email address', type: 'email', required: true, saveAs: 'email', placeholder: 'email@example.com' },{ id: 'f3', name: 'What are you interested in?', type: 'text', required: false, saveAs: 'interest', placeholder: 'e.g. Premium plan' }] } },
      { id: 'n4', type: 'standard',    label: 'Qualify',             x: 300, y: 500, extra: { content: "Thanks {{name}}! Our team will reach out to {{email}} within 24 hours. 🚀" } },
      { id: 'n5', type: 'handoff',     label: 'Notify Team',         x: 300, y: 640, extra: { message: 'New lead: {{name}} ({{email}}) — {{interest}}' } },
      { id: 'n6', type: 'end',         label: 'End',                 x: 300, y: 780 },
    ],
    edges: [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
      { source: 'n3', target: 'n4' },
      { source: 'n4', target: 'n5' },
      { source: 'n5', target: 'n6' },
    ],
  },
  support: {
    name: 'Customer Support Flow',
    nodes: [
      { id: 'n1', type: 'trigger',       label: 'Keyword Trigger',    x: 300, y: 40,  extra: { triggerType: 'keyword', keywords: ['help','support','issue','problem','complaint'] } },
      { id: 'n2', type: 'interruption',  label: 'Classify Issue',     x: 300, y: 170, extra: { userQuery: 'What is your issue?', threshold: '70' } },
      { id: 'n3', type: 'condition',     label: 'Urgent?',            x: 300, y: 320, extra: { field: 'ai_confidence', operator: '>', value: '80' } },
      { id: 'n4', type: 'handoff',       label: 'Escalate to Agent',  x: 100, y: 480, extra: { message: 'Urgent customer issue — needs immediate attention.' } },
      { id: 'n5', type: 'knowledge',     label: 'Search KB',          x: 500, y: 480, extra: { query: '{{user_message}}' } },
      { id: 'n6', type: 'standard',      label: 'Send Solution',      x: 500, y: 630, extra: { content: "Here's what I found: {{kb_result}}. Did this help? Reply YES or NO." } },
      { id: 'n7', type: 'end',           label: 'End',                x: 300, y: 780 },
    ],
    edges: [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
      { source: 'n3', target: 'n4', sourceHandle: 'true',  label: 'URGENT' },
      { source: 'n3', target: 'n5', sourceHandle: 'false', label: 'AUTO' },
      { source: 'n4', target: 'n7' },
      { source: 'n5', target: 'n6' },
      { source: 'n6', target: 'n7' },
    ],
  },
  appointment: {
    name: 'Appointment Booking',
    nodes: [
      { id: 'n1', type: 'trigger',     label: 'Book Trigger',        x: 300, y: 40,  extra: { triggerType: 'keyword', keywords: ['book','appointment','schedule','slot'] } },
      { id: 'n2', type: 'standard',    label: 'Welcome',             x: 300, y: 170, extra: { content: "Hi! 📅 I can help you schedule an appointment. What service are you looking for?" } },
      { id: 'n3', type: 'send_buttons',label: 'Choose Service',      x: 300, y: 320, extra: { message: 'Please choose a service:', buttons: [{ id: 'btn_1', label: 'Consultation', value: 'consultation' },{ id: 'btn_2', label: 'Follow-up', value: 'followup' },{ id: 'btn_3', label: 'Emergency', value: 'emergency' }] } },
      { id: 'n4', type: 'intake_form', label: 'Collect Details',     x: 300, y: 480, extra: { fields: [{ id: 'f1', name: 'Full name', type: 'text', required: true, saveAs: 'name', placeholder: 'Your full name' },{ id: 'f2', name: 'Phone number', type: 'phone', required: true, saveAs: 'phone', placeholder: '+91 XXXXX XXXXX' },{ id: 'f3', name: 'Preferred date & time', type: 'text', required: true, saveAs: 'date', placeholder: 'e.g. Tomorrow 10am' }] } },
      { id: 'n5', type: 'standard',    label: 'Confirm',             x: 300, y: 650, extra: { content: "✅ Appointment confirmed for {{name}} on {{date}}. We'll send a reminder 1 hour before." } },
      { id: 'n6', type: 'end',         label: 'End',                 x: 300, y: 800 },
    ],
    edges: [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
      { source: 'n3', target: 'n4' },
      { source: 'n4', target: 'n5' },
      { source: 'n5', target: 'n6' },
    ],
  },
  faq: {
    name: 'FAQ Bot',
    nodes: [
      { id: 'n1', type: 'trigger',      label: 'Any Message',       x: 300, y: 40,  extra: { triggerType: 'any_message' } },
      { id: 'n2', type: 'knowledge',    label: 'Search FAQ',        x: 300, y: 170, extra: { query: '{{user_message}}' } },
      { id: 'n3', type: 'condition',    label: 'Answer Found?',     x: 300, y: 320, extra: { field: 'kb_confidence', operator: '>', value: '0.7' } },
      { id: 'n4', type: 'standard',     label: 'Send Answer',       x: 120, y: 480, extra: { content: '{{kb_result}}' } },
      { id: 'n5', type: 'interruption', label: 'AI Fallback',       x: 480, y: 480, extra: { userQuery: '{{user_message}}', threshold: '60' } },
      { id: 'n6', type: 'end',          label: 'End',               x: 300, y: 640 },
    ],
    edges: [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
      { source: 'n3', target: 'n4', sourceHandle: 'true',  label: 'FOUND' },
      { source: 'n3', target: 'n5', sourceHandle: 'false', label: 'FALLBACK' },
      { source: 'n4', target: 'n6' },
      { source: 'n5', target: 'n6' },
    ],
  },
  clocktower: {
    name: 'Restaurant',
    nodes: [
      { id: 'ct1',  type: 'trigger',      label: 'Inbound Message',          x: 400,  y: 50,   extra: { triggerType: 'keyword', keywords: ['hi','hello','book','table','reserve','menu','dine','lunch','dinner','hours','location','help'] } },
      { id: 'ct2',  type: 'standard',     label: 'Welcome',                  x: 400,  y: 210,  extra: { content: "Welcome to our restaurant! 👋\n\nWe're so glad you reached out. What can we help you with today?" } },
      { id: 'ct3',  type: 'send_buttons', label: 'Main Menu',                x: 400,  y: 390,  extra: { message: 'Choose an option below:', buttons: [{ id: 'b1', label: '📅 Book a Table', value: 'book_table' },{ id: 'b2', label: '🍽️ View Menu', value: 'view_menu' },{ id: 'b3', label: '⏰ Hours & Location', value: 'hours_info' }] } },
      { id: 'ct4',  type: 'condition',    label: 'Booking?',                 x: 400,  y: 570,  extra: { field: 'button_value', operator: '==', value: 'book_table' } },
      { id: 'ct5',  type: 'intake_form',  label: 'Collect Booking Details',  x: 80,   y: 750,  extra: { fields: [{ id: 'f1', name: 'Your Name', type: 'text', required: true, saveAs: 'guest_name', placeholder: 'Full name' },{ id: 'f2', name: 'Date & Time', type: 'text', required: true, saveAs: 'booking_datetime', placeholder: 'e.g. 30 May, 8:00 PM' },{ id: 'f3', name: 'Number of Guests', type: 'text', required: true, saveAs: 'party_size', placeholder: 'e.g. 4' },{ id: 'f4', name: 'Special Request', type: 'text', required: false, saveAs: 'special_request', placeholder: 'Birthday, anniversary, dietary needs…' }] } },
      { id: 'ct6',  type: 'standard',     label: 'Reservation Confirmed ✅', x: 80,   y: 970,  extra: { content: "✅ Your table is confirmed!\n\n👤 Name: {{guest_name}}\n📅 When: {{booking_datetime}}\n👥 Guests: {{party_size}}\n\nWe look forward to welcoming you! A reminder will be sent before your booking." } },
      { id: 'ct7',  type: 'handoff',      label: 'Notify Restaurant Team',   x: 80,   y: 1140, extra: { message: '🔔 New Reservation\nGuest: {{guest_name}}\nDate/Time: {{booking_datetime}}\nParty Size: {{party_size}} guests\nSpecial: {{special_request}}' } },
      { id: 'ct8',  type: 'end',          label: 'End',                      x: 80,   y: 1290 },
      { id: 'ct9',  type: 'condition',    label: 'View Menu?',               x: 780,  y: 570,  extra: { field: 'button_value', operator: '==', value: 'view_menu' } },
      { id: 'ct10', type: 'standard',     label: 'Our Menu 🍽️',             x: 580,  y: 750,  extra: { content: "Our Signature Dishes 🍽️\n\n🥗 *Starters*\nGarden Mezze Platter ₹320 | Crispy Calamari ₹280\n\n🍖 *Mains*\nSlow-Roasted Lamb Chops ₹780\nMushroom Risotto ₹520\nGrilled Sea Bass ₹680\n\n🍰 *Desserts*\nSticky Toffee Pudding ₹220\nChocolate Lava Cake ₹240\n\n🍷 Bar open till midnight. To book your table, just reply *Book*!" } },
      { id: 'ct11', type: 'end',          label: 'End',                      x: 580,  y: 960 },
      { id: 'ct12', type: 'condition',    label: 'Hours & Location?',        x: 1100, y: 570,  extra: { field: 'button_value', operator: '==', value: 'hours_info' } },
      { id: 'ct13', type: 'standard',     label: 'Hours & Location',         x: 940,  y: 750,  extra: { content: "{{business_name}}\n\n📍 {{business_address}}\n\n⏰ *Opening Hours*\nMon–Thu: 12 PM – 11 PM\nFri–Sat: 12 PM – 1 AM\nSun: 11 AM – 10 PM\n\nWalk-ins welcome! We recommend booking ahead for Friday & Saturday evenings. 😊" } },
      { id: 'ct14', type: 'end',          label: 'End',                      x: 940,  y: 970 },
      { id: 'ct15', type: 'handoff',      label: 'Connect to Staff',         x: 1260, y: 750,  extra: { message: 'A customer needs assistance. Please connect them with a team member.' } },
      { id: 'ct16', type: 'end',          label: 'End',                      x: 1260, y: 940 },
    ],
    edges: [
      { source: 'ct1',  target: 'ct2' },
      { source: 'ct2',  target: 'ct3' },
      { source: 'ct3',  target: 'ct4' },
      { source: 'ct4',  target: 'ct5',  sourceHandle: 'true',  label: 'BOOK TABLE' },
      { source: 'ct4',  target: 'ct9',  sourceHandle: 'false' },
      { source: 'ct5',  target: 'ct6' },
      { source: 'ct6',  target: 'ct7' },
      { source: 'ct7',  target: 'ct8' },
      { source: 'ct9',  target: 'ct10', sourceHandle: 'true',  label: 'VIEW MENU' },
      { source: 'ct9',  target: 'ct12', sourceHandle: 'false' },
      { source: 'ct10', target: 'ct11' },
      { source: 'ct12', target: 'ct13', sourceHandle: 'true',  label: 'HOURS' },
      { source: 'ct12', target: 'ct15', sourceHandle: 'false', label: 'TALK TO US' },
      { source: 'ct13', target: 'ct14' },
      { source: 'ct15', target: 'ct16' },
    ],
  },
};

// ── Keyword → blueprint mapping ───────────────────────────────────────────────
function detectIntent(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/reserv|restaurant|table|dine|dining/.test(p)) return 'reservation';
  if (/lead|capture|prospect|contact|inquir/.test(p)) return 'lead';
  if (/support|help|complaint|issue|problem|ticket/.test(p)) return 'support';
  if (/appoint|book|schedul|slot|clinic|salon/.test(p)) return 'appointment';
  if (/faq|question|answer|info|knowledge/.test(p)) return 'faq';
  return 'lead'; // safe default
}

export async function POST(req: NextRequest) {
  try {
    // Lightweight auth check: only needs anon key + valid session cookie.
    // We do NOT need getTenantId (which requires the users table + service role
    // key) because this endpoint returns hardcoded blueprints only.
    if (isSupabaseConfigured) {
      const cookieStore = await cookies();
      const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt } = await req.json() as { prompt: string };
    if (!prompt?.trim()) return NextResponse.json({ success: false, error: 'Prompt is required' }, { status: 400 });

    const intent    = detectIntent(prompt);
    const blueprint = BLUEPRINTS[intent];

    // Convert blueprint into ReactFlow-ready nodes + edges
    const nodes = blueprint.nodes.map(n => ({
      id:       n.id,
      type:     n.type,
      position: { x: n.x, y: n.y },
      data: { label: n.label, ...(n.extra ?? {}) },
    }));

    const edges = blueprint.edges.map((e, i) => ({
      id:     `e-gen-${i}`,
      source: e.source,
      target: e.target,
      type:   'premium',
      animated: false,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
      ...(e.label        ? { label: e.label }               : {}),
    }));

    return NextResponse.json({ success: true, data: { name: blueprint.name, nodes, edges, intent } });
  } catch (err) {
    console.error('flow generate error:', err);
    return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 500 });
  }
}
