import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey && supabaseUrl !== 'https://your-project.supabase.co') {
      const cookieStore = await cookies();
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
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
