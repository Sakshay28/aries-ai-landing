// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Prompt Registry (REQ 3)
//
// Every industry owns its prompt. Versions evolve independently.
// Prompts are NOT hardcoded in business logic — always resolved from here.
// Tokens: {{conversation}}, {{memory}}, {{industry_context}}, {{signals}}
// ═══════════════════════════════════════════════════════════════════════════

import type { IndustryProfile } from './industry-profiles';

export interface PromptRecord {
  industry:   IndustryProfile | 'general';
  promptKey:  string;
  version:    string;
  systemPrompt:        string;
  userPromptTemplate:  string;
  isActive:   boolean;
  notes:      string;
}

// ── System Prompt (shared core, industry extends it) ─────────────────────

const CORE_SYSTEM_PROMPT = `You are a Lead Intelligence AI for a sales team. Your job is to deeply analyze a WhatsApp conversation and return structured JSON intelligence.

CRITICAL RULES:
1. Return ONLY valid JSON. No markdown, no prose, no explanation outside JSON.
2. All scores are integers 0-100. Never return null for a score — use 0.
3. All confidence values are integers 0-100.
4. Arrays must be present even if empty: [] not null.
5. salesStage must be exactly one of: Awareness, Interest, Consideration, Evaluation, Negotiation, Decision, Booked, Post-Purchase, Advocate, Unknown.
6. momentum must be exactly one of: Increasing, Stable, Declining, Spiking, Dormant.
7. negotiationState must be exactly one of: none, exploring, active, final.
8. budgetSensitivity must be: Low, Medium, High, or Unknown.
9. priority must be: critical, high, medium, or low.
10. Respond in the customer's language of communication (Hindi, English, Hinglish — match what they used).

SCORING CALIBRATION:
- buyingIntent 0-20: Browsing, no intent signals
- buyingIntent 21-40: Curious, asking general questions
- buyingIntent 41-60: Interested, asking specific questions
- buyingIntent 61-80: Strong intent, negotiating, planning logistics
- buyingIntent 81-100: Near-decision, closing signals present

QUALIFICATION GATE:
- A lead is only "Decision" stage or above if they have asked for a payment link, invoice, booking confirmation, or explicit confirmation of purchase intent. High buying intent alone does NOT qualify.`;

// ── Industry-Specific Prompt Extensions ──────────────────────────────────

const INDUSTRY_CONTEXT: Record<string, string> = {
  travel: `INDUSTRY: Travel, Trekking & Adventure
Key signals for this industry:
- Named a specific trek/destination (Zanskar, Kedarkantha, Ladakh, etc.) → very high intent
- Asked about fitness requirements or difficulty level
- Asked what to bring / how to prepare → strong commitment signal
- Mentioned group size or family → qualification information
- Asked about meeting point, pickup, transfer → near-decision
- Requested discount on group booking → price-sensitive negotiation stage
- Asked for payment link or advance payment → closing signal
QUALIFICATION: Trek/package is qualified ONLY when: payment link requested, advance payment confirmed, or booking explicitly confirmed.`,

  restaurant: `INDUSTRY: Restaurant & F&B
Key signals:
- Asked about table availability for a specific date → booking intent
- Mentioned occasion (birthday, anniversary, corporate) → high commitment
- Asked about private room or event space → very high intent
- Inquired about menu or dietary options → qualification step
- Confirmed date and party size → near Decision stage
QUALIFICATION: Qualified when: reservation confirmed, advance payment requested, or event booking confirmed.`,

  hotel: `INDUSTRY: Hotel & Hospitality
Key signals:
- Asked about check-in / check-out dates → Interest stage
- Inquired about specific room type → Consideration
- Asked about total cost for their stay → Evaluation
- Mentioned special requirements (honeymoon setup, early check-in) → high commitment
- Asked about payment / booking process → Decision stage
QUALIFICATION: Qualified when: room is specifically reserved, or payment/advance requested.`,

  clinic: `INDUSTRY: Healthcare & Clinic
Key signals:
- Described specific symptom or condition → Evaluation
- Asked for earliest available appointment → urgent, high intent
- Requested a specific doctor → committed
- Mentioned existing treatment or medication → continuity patient
QUALIFICATION: Qualified when: appointment explicitly requested or confirmed.`,

  real_estate: `INDUSTRY: Real Estate
Key signals:
- Asked about price range or square footage → Consideration
- Mentioned specific locality or property → Evaluation
- Asked about site visit → very high intent, near Decision
- Mentioned loan approval or budget ceiling → qualified buyer
- Asked about legal documents or registration → Decision stage
QUALIFICATION: Qualified when: site visit requested, or legal/payment process initiated.`,

  retail: `INDUSTRY: Retail & E-commerce
Key signals:
- Asked about product specs or variants → Interest
- Mentioned quantity or bulk purchase → high intent
- Asked about delivery timeline → Consideration
- Inquired about payment options or EMI → Evaluation
QUALIFICATION: Qualified when: specific product + quantity confirmed, or payment link requested.`,

  education: `INDUSTRY: Education & Training
Key signals:
- Asked about course content or curriculum → Interest
- Inquired about batch dates or schedule → Consideration
- Asked about fees or scholarship → Evaluation
- Mentioned intention to enroll or register → very high intent
QUALIFICATION: Qualified when: enrollment form requested, or fee payment initiated.`,

  automotive: `INDUSTRY: Automotive & Vehicles
Key signals:
- Expressed interest in a specific model or variant → Interest
- Asked about test drive → very high intent
- Inquired about loan / EMI options → Evaluation
- Asked about delivery timeline → Decision stage
QUALIFICATION: Qualified when: test drive booked, or financing/delivery process initiated.`,

  saas: `INDUSTRY: SaaS & Software
Key signals:
- Asked about a specific feature or integration → Evaluation
- Requested product demo → very high intent
- Asked about pricing plan or annual discount → Evaluation
- Mentioned team size or use case → qualification information
- Requested trial or free tier → Consideration
QUALIFICATION: Qualified when: demo scheduled, trial activated, or contract/payment initiated.`,

  general: `INDUSTRY: General Business
Analyze all standard buying signals: questions, price discussions, timeline enquiries, comparisons, and commitment signals.`,
};

// ── User Prompt Templates ─────────────────────────────────────────────────

const CONVERSATION_ANALYSIS_TEMPLATE = `{{industry_context}}

KNOWN CUSTOMER FACTS (from previous messages — do not re-infer what's already known):
{{memory}}

ACTIVE BUYING SIGNALS (detected by rule engine — consider these confirmed):
{{signals}}

CONVERSATION TO ANALYZE:
{{conversation}}

Return a JSON object with this exact schema:
{
  "buyingIntent": <0-100>,
  "urgency": <0-100>,
  "trust": <0-100>,
  "engagement": <0-100>,
  "budgetScore": <0-100>,
  "commitment": <0-100>,
  "negotiation": <0-100>,
  "conversionProbability": <0-100>,
  "conversationQuality": <0-100>,
  "confidence": <0-100>,
  "intentConfidence": <0-100>,
  "stageConfidence": <0-100>,
  "recommendationConfidence": <0-100>,
  "buyingIntentConfidence": <0-100>,
  "entityExtractionConfidence": <0-100>,
  "budgetSensitivity": "Low|Medium|High|Unknown",
  "salesStage": "Awareness|Interest|Consideration|Evaluation|Negotiation|Decision|Booked|Post-Purchase|Advocate|Unknown",
  "momentum": "Increasing|Stable|Declining|Spiking|Dormant",
  "negotiationState": "none|exploring|active|final",
  "intentHistory": ["<most_recent_intent>", "<previous_intent>"],
  "groupBooking": <true|false>,
  "groupSize": <number or null>,
  "objections": ["<objection1>"],
  "detectedSignals": ["<signal_key1>"],
  "missingSignals": ["<missing_signal_description>"],
  "keyMoments": ["<message_that_changed_intent>"],
  "explanation": "<1-2 sentence explanation of why this lead is at this stage>",
  "recommendation": "<single most important next action for the sales team>",
  "whyHot": "<why is this lead hot or not>",
  "whyNotQualified": "<what closing signal is still missing>",
  "salesSummary": "<what a salesperson needs to know in 2 sentences>",
  "recommendationPriority": "critical|high|medium|low",
  "expectedImpact": "<what happens if this recommendation is followed>",
  "recommendationReason": "<why this recommendation now>",
  "automationEligible": <true|false>,
  "estimatedCloseProbImprovement": <0-100>,
  "memoryUpdates": {
    "customerName": "<if found in conversation>",
    "language": "<en|hi|hinglish>",
    "communicationPreference": "whatsapp|call|email|any",
    "travellingWithFamily": <true|false|null>,
    "groupSize": <number|null>,
    "groupComposition": "<description or null>",
    "budgetMin": <number|null>,
    "budgetMax": <number|null>,
    "preferredDestination": "<if mentioned>",
    "preferredTravelMonth": "<if mentioned>",
    "dietaryRequirements": "<if mentioned>",
    "fitnessConcern": <true|false|null>,
    "airportPickupNeeded": <true|false|null>,
    "discountRequested": <true|false>,
    "discountAmountRequested": <percentage|null>,
    "priceSensitivity": "Low|Medium|High|Unknown",
    "knownObjections": ["<objection>"],
    "knownPreferences": ["<preference>"],
    "discoveredFacts": {}
  }
}`;

// ── Registry Implementation ───────────────────────────────────────────────

const PROMPT_STORE: Map<string, PromptRecord> = new Map();

function key(industry: string, promptKey: string, version: string): string {
  return `${industry}:${promptKey}:${version}`;
}

function seed(): void {
  const industries: Array<IndustryProfile | 'general'> = [
    'travel', 'restaurant', 'hotel', 'clinic', 'real_estate',
    'retail', 'education', 'automotive', 'saas', 'general',
  ];

  for (const industry of industries) {
    const record: PromptRecord = {
      industry,
      promptKey:           'conversation_analysis',
      version:             'v1',
      systemPrompt:        CORE_SYSTEM_PROMPT,
      userPromptTemplate:  CONVERSATION_ANALYSIS_TEMPLATE.replace('{{industry_context}}', INDUSTRY_CONTEXT[industry] ?? INDUSTRY_CONTEXT.general),
      isActive:            true,
      notes:               `Phase C v1: ${industry} conversation intelligence prompt`,
    };
    PROMPT_STORE.set(key(industry, 'conversation_analysis', 'v1'), record);
  }
}

seed();

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Get the active prompt for an industry + promptKey combination.
 * Falls back to 'general' if no industry-specific prompt exists.
 */
export function getPrompt(
  industry: IndustryProfile | 'general',
  promptKey: string,
  version?: string,
): PromptRecord {
  const ver = version ?? getLatestVersion(industry, promptKey);
  const record = PROMPT_STORE.get(key(industry, promptKey, ver))
    ?? PROMPT_STORE.get(key('general', promptKey, ver));
  if (!record) {
    throw new Error(`No prompt found for industry="${industry}" promptKey="${promptKey}" version="${ver}"`);
  }
  return record;
}

/** Returns the latest active version string for a given industry + key. */
export function getLatestVersion(industry: string, promptKey: string): string {
  const entries = [...PROMPT_STORE.values()]
    .filter(p => (p.industry === industry || p.industry === 'general') && p.promptKey === promptKey && p.isActive)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  if (!entries.length) throw new Error(`No active prompt for industry="${industry}" promptKey="${promptKey}"`);
  return entries[0].version;
}

/** List all versions for a given industry + key. */
export function listVersions(industry: string, promptKey: string): string[] {
  return [...PROMPT_STORE.values()]
    .filter(p => p.industry === industry && p.promptKey === promptKey)
    .map(p => p.version);
}

/** Register a new prompt version (can be used to hot-reload from DB). */
export function registerPrompt(record: PromptRecord): void {
  PROMPT_STORE.set(key(record.industry, record.promptKey, record.version), record);
}
