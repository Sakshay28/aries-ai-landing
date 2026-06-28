// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Industry Modules
//
// Each industry module defines:
//   - signals:              domain-specific buying patterns
//   - qualificationGates:   signal keys that can push a lead to Qualified
//   - aiPromptContext:      added to Gemini prompt for industry-aware analysis
//   - stages:               industry-specific stage progression labels
//
// INDUSTRY_PATTERNS (legacy export) remains for backward compatibility.
// New code should use INDUSTRY_MODULES.
// ═══════════════════════════════════════════════════════════════════════════

export type IndustryProfile =
  | 'travel'
  | 'restaurant'
  | 'hotel'
  | 'clinic'
  | 'real_estate'
  | 'retail'
  | 'education'
  | 'automotive'
  | 'saas'
  | 'general';

export interface IndustryPattern {
  key: string;
  label: string;
  points: number;
  patterns: RegExp[];
}

export interface IndustryModule {
  id: IndustryProfile;
  displayName: string;
  keywords: string[];          // used by normalizeIndustry for auto-detection
  signals: IndustryPattern[];
  // Signal keys whose presence (combined with score ≥ 70) can qualify a lead.
  // These are INDUSTRY-SPECIFIC qualifiers on top of universal ones.
  qualificationGates: string[];
  // Added verbatim to the Gemini conversation intelligence prompt.
  aiPromptContext: string;
  // Ordered stage progression for this industry (forward-only).
  stages: readonly string[];
}

// ─── TRAVEL ──────────────────────────────────────────────────────────────────
const TRAVEL: IndustryModule = {
  id: 'travel',
  displayName: 'Travel, Trekking & Adventure',
  keywords: ['travel', 'trek', 'tour', 'expedition', 'adventure', 'tourism', 'hiking', 'safari'],
  qualificationGates: ['asked_payment_method', 'intent_payment_link', 'invoice_request', 'intent_confirm_booking'],
  aiPromptContext: `This is a travel/trekking company. High-value signals include:
- Asking about a specific expedition name (Zanskar, Ladakh, Kedarkantha, etc.)
- Asking about permits, altitude training, fitness requirements
- Asking what to bring / how to prepare (strong commitment signal)
- Asking about guide credentials or team composition
- Asking about group packages or negotiating for a group discount
- Confirming a meeting point or logistics (near-decision signal)
Qualification in this industry = payment requested OR booking confirmed.`,
  stages: ['Awareness', 'Interest', 'Evaluation', 'Trip Planning', 'Negotiation', 'Decision', 'Booked', 'Post-Trip', 'Advocate'],
  signals: [
    {
      key: 'ind_altitude',
      label: 'Asked about difficulty or fitness',
      points: 8,
      patterns: [/\b(altitude|elevation|difficult|fitness|beginner|expert|experience.required|level)\b/i],
    },
    {
      key: 'ind_permits',
      label: 'Asked about permits or visa',
      points: 10,
      patterns: [/\b(permit|permissions?|visa|inner.line|restricted.area|pass|icp)\b/i],
    },
    {
      key: 'ind_guide',
      label: 'Asked about guide or support team',
      points: 8,
      patterns: [/\b(guide|leader|team size|instructor|porter|support staff)\b/i],
    },
    {
      key: 'ind_expedition_named',
      label: 'Mentioned specific trek or expedition',
      points: 20,
      patterns: [
        /\b(zanskar|ladakh|spiti|manali|kedarkantha|roopkund|chadar|valley of flowers|sar pass|hampta|goecha|sandakphu|brahmatal|kedarnath|markha|pin parvati|har ki dun|rupin pass|tarsar|kuari|dayara|tungnath|pangarchulla|auden|gangotri|yamunotri|gangabal|tarsar marsar)\b/i,
        /\b(everest base camp|annapurna|langtang|manaslu|kanchenjunga|poon hill|gokyo)\b/i,
      ],
    },
    {
      key: 'ind_group_type',
      label: 'Asked about group or private trek option',
      points: 8,
      patterns: [/\b(group (trek|expedition|tour)|private (tour|trek)|solo|batch|team)\b/i],
    },
    {
      key: 'ind_gear',
      label: 'Asked about gear or equipment',
      points: 12,
      patterns: [/\b(gear|equipment|sleeping bag|jacket|boots|crampons|ice axe|trekking poles?|what to (wear|carry|bring|pack))\b/i],
    },
  ],
};

// ─── RESTAURANT ──────────────────────────────────────────────────────────────
const RESTAURANT: IndustryModule = {
  id: 'restaurant',
  displayName: 'Restaurant & Dining',
  keywords: ['restaurant', 'food', 'dine', 'cafe', 'bistro', 'dhaba', 'eatery', 'dining'],
  qualificationGates: ['ind_private_room', 'intent_reserve', 'intent_confirm_booking'],
  aiPromptContext: `This is a restaurant/dining business. High-value signals:
- Asking about private dining or event space (high-ticket lead)
- Confirming a special occasion (birthday, anniversary, corporate)
- Asking about menu, dietary restrictions, or customization
- Party size confirms real intent
- Asking about pre-payment or advance required
Qualification = seat/table reservation confirmed OR private event inquiry with date.`,
  stages: ['Awareness', 'Menu Interest', 'Date Enquiry', 'Reservation Intent', 'Confirmed', 'Post-Visit'],
  signals: [
    {
      key: 'ind_table_size',
      label: 'Specified party size',
      points: 10,
      patterns: [/\b(table for|party of|group of|\bpax\b|cover|how many people)\b/i],
    },
    {
      key: 'ind_occasion',
      label: 'Mentioned special occasion',
      points: 15,
      patterns: [/\b(birthday|anniversary|engagement|proposal|romantic|surprise|celebration|corporate (dinner|lunch)|family (dinner|gathering))\b/i],
    },
    {
      key: 'ind_dietary',
      label: 'Asked about dietary requirements',
      points: 8,
      patterns: [/\b(vegetarian|vegan|jain|halal|gluten.free|allerg|dairy.free|kosher|eggless)\b/i],
    },
    {
      key: 'ind_menu',
      label: 'Asked about menu',
      points: 8,
      patterns: [/\b(menu|dishes?|cuisine|chef|signature dish|food options?|what do you serve)\b/i],
    },
    {
      key: 'ind_private_room',
      label: 'Asked about private dining or event space',
      points: 20,
      patterns: [/\b(private (room|dining|area|space)|exclusive|buyout|event space|banquet)\b/i],
    },
  ],
};

// ─── HOTEL ───────────────────────────────────────────────────────────────────
const HOTEL: IndustryModule = {
  id: 'hotel',
  displayName: 'Hotel & Accommodation',
  keywords: ['hotel', 'resort', 'lodge', 'hostel', 'stay', 'accommodation'],
  qualificationGates: ['ind_checkin_date', 'intent_reserve', 'asked_payment_method'],
  aiPromptContext: `This is a hotel/accommodation business. High-value signals:
- Confirmed check-in and check-out dates (strong intent)
- Asked about specific room type or upgrade
- Asked about corporate or group rates
- Extended stay or long-duration booking
Qualification = dates confirmed AND room type specified.`,
  stages: ['Awareness', 'Room Enquiry', 'Dates Check', 'Rate Negotiation', 'Booking Intent', 'Confirmed', 'Checked-In', 'Post-Stay'],
  signals: [
    {
      key: 'ind_checkin_date',
      label: 'Provided check-in date',
      points: 15,
      patterns: [/\b(check.in|arrival|checking in|arrive|from [a-z]+\s\d)/i],
    },
    {
      key: 'ind_nights',
      label: 'Specified duration of stay',
      points: 12,
      patterns: [/\b(\d+\s?nights?|how long|check.out|checkout|duration of stay|leaving)\b/i],
    },
    {
      key: 'ind_room_type',
      label: 'Asked about room type or upgrade',
      points: 10,
      patterns: [/\b(suite|deluxe|standard|sea.?view|mountain.?view|twin|double|king|queen|connecting|room type|upgrade)\b/i],
    },
    {
      key: 'ind_early_services',
      label: 'Asked about early check-in or late checkout',
      points: 8,
      patterns: [/\b(early check.?in|late check.?out|early arrival|extend(ed)? stay)\b/i],
    },
    {
      key: 'ind_amenities',
      label: 'Asked about amenities',
      points: 8,
      patterns: [/\b(pool|spa|gym|breakfast included|wifi|parking|pet.friendly|airport (shuttle|pickup))\b/i],
    },
  ],
};

// ─── CLINIC ──────────────────────────────────────────────────────────────────
const CLINIC: IndustryModule = {
  id: 'clinic',
  displayName: 'Healthcare & Clinic',
  keywords: ['clinic', 'hospital', 'health', 'medical', 'doctor', 'dental', 'pharmacy'],
  qualificationGates: ['ind_appointment', 'ind_urgency'],
  aiPromptContext: `This is a healthcare/clinic business. High-value signals:
- Requested appointment or consultation (strongest signal)
- Described specific symptoms or condition
- Asked about insurance or cashless treatment
- Expressed medical urgency
Qualification = appointment requested AND availability asked.`,
  stages: ['Awareness', 'Symptom Enquiry', 'Doctor Research', 'Appointment Intent', 'Booked', 'Post-Consultation'],
  signals: [
    {
      key: 'ind_appointment',
      label: 'Requested appointment',
      points: 25,
      patterns: [/\b(appointment|consult(ation)?|book (a |an )?appointment|see (the |a |dr\.?)doctor|schedule|slot available)\b/i],
    },
    {
      key: 'ind_specialist',
      label: 'Asked about specific specialist',
      points: 12,
      patterns: [/\b(dr\.|doctor|specialist|surgeon|physician|dermatologist|cardiologist|orthopedic|pediatrician|gynecologist|therapist)\b/i],
    },
    {
      key: 'ind_insurance',
      label: 'Asked about insurance coverage',
      points: 10,
      patterns: [/\b(insurance|cashless|mediclaim|tpa|empanelled|coverage|health (plan|policy))\b/i],
    },
    {
      key: 'ind_urgency',
      label: 'Expressed medical urgency',
      points: 20,
      patterns: [/\b(urgent|emergency|immediately|asap|today itself|severe pain|critical|can.t wait)\b/i],
    },
    {
      key: 'ind_reports',
      label: 'Mentioned diagnostic tests',
      points: 10,
      patterns: [/\b(reports?|tests?|blood test|x.?ray|mri|ct.?scan|ultrasound|pathology|biopsy)\b/i],
    },
  ],
};

// ─── REAL ESTATE ─────────────────────────────────────────────────────────────
const REAL_ESTATE: IndustryModule = {
  id: 'real_estate',
  displayName: 'Real Estate & Property',
  keywords: ['real estate', 'property', 'realty', 'housing', 'builder', 'developer'],
  qualificationGates: ['ind_site_visit', 'ind_budget', 'asked_payment_method'],
  aiPromptContext: `This is a real estate business. High-value signals:
- Mentioned specific budget (strong intent signal)
- Requested site visit (very high intent)
- Asked about home loan or financing options
- Asked about possession date and RERA details
- Mentioned family decision-making (group buyer)
Qualification = budget mentioned AND site visit requested.`,
  stages: ['Awareness', 'Project Research', 'Budget Assessment', 'Site Visit', 'Negotiation', 'LOI / Booking', 'Agreement', 'Possession'],
  signals: [
    {
      key: 'ind_budget',
      label: 'Mentioned budget range',
      points: 15,
      patterns: [/\b(budget|crores?|lakhs?|\bcr\b|afford|price range|what.s my limit|investment)\b/i],
    },
    {
      key: 'ind_site_visit',
      label: 'Requested site visit or property viewing',
      points: 30,
      patterns: [/\b(site visit|property (visit|tour|viewing)|can i (see|visit)|show me|physical visit|walkthrough)\b/i],
    },
    {
      key: 'ind_loan',
      label: 'Asked about home loan or financing',
      points: 12,
      patterns: [/\b(home loan|loan|mortgage|emi|financer|bank finance|down.?payment|pre.?approved)\b/i],
    },
    {
      key: 'ind_property_type',
      label: 'Specified property type or configuration',
      points: 10,
      patterns: [/\b(\d\s?bhk|studio apartment|villa|plot|flat|apartment|penthouse|duplex|row.?house)\b/i],
    },
    {
      key: 'ind_timeline',
      label: 'Asked about possession or handover timeline',
      points: 15,
      patterns: [/\b(possession|handover|when (ready|complete)|move.?in|rera|completion|ready to (move|possess))\b/i],
    },
  ],
};

// ─── RETAIL ──────────────────────────────────────────────────────────────────
const RETAIL: IndustryModule = {
  id: 'retail',
  displayName: 'Retail & E-commerce',
  keywords: ['retail', 'shop', 'store', 'ecommerce', 'e-commerce', 'fashion', 'apparel'],
  qualificationGates: ['ind_bulk', 'asked_payment_method', 'intent_payment_link'],
  aiPromptContext: `This is a retail/e-commerce business. High-value signals:
- Asking about bulk or wholesale pricing
- Asking about delivery timeline for a specific order
- Asking about specific product availability
- Return/refund question after purchase (post-sale)
Qualification = bulk order OR payment method asked.`,
  stages: ['Awareness', 'Product Research', 'Comparison', 'Pricing Enquiry', 'Order Intent', 'Checkout', 'Delivered', 'Post-Purchase'],
  signals: [
    {
      key: 'ind_product_specific',
      label: 'Asked about specific product',
      points: 10,
      patterns: [/\b(product|item|model|variant|sku|size|color|colour|stock)\b/i],
    },
    {
      key: 'ind_delivery',
      label: 'Asked about delivery timeline',
      points: 12,
      patterns: [/\b(deliver|delivery|shipping|dispatch|courier|cod|cash on delivery|track (order|shipment))\b/i],
    },
    {
      key: 'ind_discount',
      label: 'Asked about offers or discount',
      points: 8,
      patterns: [/\b(offer|discount|deal|sale|promo|coupon|cashback|best price)\b/i],
    },
    {
      key: 'ind_bulk',
      label: 'Wholesale or bulk purchase enquiry',
      points: 20,
      patterns: [/\b(bulk|wholesale|trade (price|enquiry)|reseller|distributor|quantity discount)\b/i],
    },
    {
      key: 'ind_return_policy',
      label: 'Asked about return or warranty policy',
      points: 5,
      patterns: [/\b(return (policy|process)|exchange|warranty|guarantee|replace)\b/i],
    },
  ],
};

// ─── EDUCATION ───────────────────────────────────────────────────────────────
const EDUCATION: IndustryModule = {
  id: 'education',
  displayName: 'Education & Coaching',
  keywords: ['education', 'school', 'college', 'coaching', 'institute', 'tuition', 'course', 'training'],
  qualificationGates: ['ind_enroll_intent', 'asked_payment_method'],
  aiPromptContext: `This is an education/coaching business. High-value signals:
- Asked about admission process or enrollment
- Asked about fees or scholarship
- Asked about batch start date or schedule
- Parent calling on behalf of student (warm signal)
Qualification = enrollment intent expressed AND fees discussed.`,
  stages: ['Awareness', 'Course Enquiry', 'Fee Enquiry', 'Demo Class', 'Enrollment Intent', 'Enrolled', 'Active Student'],
  signals: [
    {
      key: 'ind_course_details',
      label: 'Asked about course or curriculum details',
      points: 10,
      patterns: [/\b(course|curriculum|syllabus|subject|modules?|topics?|what.s covered|course content)\b/i],
    },
    {
      key: 'ind_batch_dates',
      label: 'Asked about batch start date',
      points: 12,
      patterns: [/\b(batch|start (date|time)|when does.*(start|begin)|schedule|new batch|next batch|joining)\b/i],
    },
    {
      key: 'ind_fees',
      label: 'Asked about fees or scholarship',
      points: 15,
      patterns: [/\b(fees?|fee structure|scholarship|discount|emi|instalment|how much.*(course|program)|total cost)\b/i],
    },
    {
      key: 'ind_enroll_intent',
      label: 'Expressed enrollment interest',
      points: 25,
      patterns: [/\b(enroll|enrol|admission|join|register|sign up|how to (join|enroll|register)|apply)\b/i],
    },
    {
      key: 'ind_demo',
      label: 'Asked about demo or trial class',
      points: 18,
      patterns: [/\b(demo (class|session|lecture)|trial class|free (class|session)|sample (class|lecture)|attend once)\b/i],
    },
  ],
};

// ─── AUTOMOTIVE ──────────────────────────────────────────────────────────────
const AUTOMOTIVE: IndustryModule = {
  id: 'automotive',
  displayName: 'Automotive & Vehicles',
  keywords: ['car', 'vehicle', 'automobile', 'auto', 'bike', 'two-wheeler', 'dealer'],
  qualificationGates: ['ind_test_drive', 'ind_loan_enquiry', 'asked_payment_method'],
  aiPromptContext: `This is an automotive/vehicle dealership. High-value signals:
- Requested test drive (strongest buying signal)
- Asked about specific variant or color availability
- Asked about EMI, down payment, or trade-in
- Asked about delivery timeline
Qualification = test drive requested OR EMI/loan discussed.`,
  stages: ['Awareness', 'Model Research', 'Variant Shortlist', 'Test Drive', 'Finance Discussion', 'Booking', 'Delivery'],
  signals: [
    {
      key: 'ind_model_variant',
      label: 'Asked about specific model or variant',
      points: 12,
      patterns: [/\b(variant|model|version|edition|color|colour|specification|features)\b/i],
    },
    {
      key: 'ind_test_drive',
      label: 'Requested test drive',
      points: 30,
      patterns: [/\b(test drive|test (the |a )?(car|bike|vehicle)|can i (drive|try)|demo drive)\b/i],
    },
    {
      key: 'ind_loan_enquiry',
      label: 'Asked about auto loan or EMI',
      points: 20,
      patterns: [/\b(emi|loan|finance|down payment|bank (finance|loan)|monthly (payment|installment)|on (loan|finance))\b/i],
    },
    {
      key: 'ind_trade_in',
      label: 'Asked about trade-in or exchange',
      points: 15,
      patterns: [/\b(trade.in|exchange (old|existing)|sell (my|old)|exchange offer|old (car|bike) value)\b/i],
    },
    {
      key: 'ind_delivery_date',
      label: 'Asked about delivery timeline',
      points: 15,
      patterns: [/\b(delivery (date|time|when)|when (can i get|will i get|delivered)|waiting period|stock)\b/i],
    },
  ],
};

// ─── SAAS ─────────────────────────────────────────────────────────────────────
const SAAS: IndustryModule = {
  id: 'saas',
  displayName: 'SaaS & Software',
  keywords: ['saas', 'software', 'platform', 'app', 'tool', 'subscription', 'crm', 'erp'],
  qualificationGates: ['ind_demo_request', 'ind_trial', 'asked_payment_method'],
  aiPromptContext: `This is a SaaS/software company. High-value signals:
- Requested a product demo (strong intent signal)
- Asked about integration with existing tools
- Asked about pricing tiers or annual plans
- Mentioned team size (enterprise lead indicator)
- Asked about security, compliance, or SLA
Qualification = demo requested OR trial started OR pricing discussed with team size.`,
  stages: ['Awareness', 'Feature Research', 'Integration Check', 'Demo', 'Trial', 'Evaluation', 'Proposal', 'Negotiation', 'Closed'],
  signals: [
    {
      key: 'ind_demo_request',
      label: 'Requested product demo',
      points: 30,
      patterns: [/\b(demo|product demo|can (you|i) (show|demo)|book a demo|schedule a (call|demo)|live demo)\b/i],
    },
    {
      key: 'ind_trial',
      label: 'Asked about free trial',
      points: 25,
      patterns: [/\b(free trial|trial (period|version)|try (it|for free)|pilot|proof of concept|poc)\b/i],
    },
    {
      key: 'ind_integration',
      label: 'Asked about integrations',
      points: 15,
      patterns: [/\b(integrat|api|connect (with|to)|works? with|compatible|third.party|webhook|zapier|slack|crm)\b/i],
    },
    {
      key: 'ind_team_size',
      label: 'Mentioned team or user count',
      points: 12,
      patterns: [/\b(\d+\s?(users?|seats?|licenses?|team members?)|team of|how many (users?|people)|per user)\b/i],
    },
    {
      key: 'ind_compliance',
      label: 'Asked about security or compliance',
      points: 10,
      patterns: [/\b(soc2|iso|gdpr|hipaa|security|data (privacy|protection)|compliance|sla|uptime|encryption)\b/i],
    },
  ],
};

// ─── GENERAL ─────────────────────────────────────────────────────────────────
const GENERAL: IndustryModule = {
  id: 'general',
  displayName: 'General',
  keywords: [],
  qualificationGates: [],
  aiPromptContext: '',
  stages: ['Awareness', 'Interest', 'Consideration', 'Evaluation', 'Negotiation', 'Decision', 'Purchase', 'Post-Purchase'],
  signals: [],
};

// ── Module Registry ───────────────────────────────────────────────────────────

export const INDUSTRY_MODULES: Record<IndustryProfile, IndustryModule> = {
  travel:      TRAVEL,
  restaurant:  RESTAURANT,
  hotel:       HOTEL,
  clinic:      CLINIC,
  real_estate: REAL_ESTATE,
  retail:      RETAIL,
  education:   EDUCATION,
  automotive:  AUTOMOTIVE,
  saas:        SAAS,
  general:     GENERAL,
};

// ── Backward-compatible export (used by existing scoring engine imports) ──────

export const INDUSTRY_PATTERNS: Record<IndustryProfile, IndustryPattern[]> = Object.fromEntries(
  Object.entries(INDUSTRY_MODULES).map(([k, m]) => [k, m.signals])
) as Record<IndustryProfile, IndustryPattern[]>;

// ── Industry detection ────────────────────────────────────────────────────────

export function normalizeIndustry(raw: string | null | undefined): IndustryProfile {
  const s = (raw ?? '').toLowerCase().trim();
  if (!s) return 'general';
  // Check each module's keywords
  for (const [id, mod] of Object.entries(INDUSTRY_MODULES) as [IndustryProfile, IndustryModule][]) {
    if (id === 'general') continue;
    if (mod.keywords.some(kw => s.includes(kw))) return id;
  }
  // Fallback patterns for common phrasing
  if (/travel|trek|tour|expedition|adventure|tourism/.test(s)) return 'travel';
  if (/restaurant|food|dine|cafe|bistro|dhaba|eatery/.test(s))  return 'restaurant';
  if (/hotel|resort|lodge|hostel|stay|accommodation/.test(s))   return 'hotel';
  if (/clinic|hospital|health|medical|doctor|dental|pharmacy/.test(s)) return 'clinic';
  if (/real estate|property|realty|housing|builder|developer/.test(s)) return 'real_estate';
  if (/retail|shop|store|ecommerce|e-commerce|fashion|apparel/.test(s)) return 'retail';
  if (/education|school|college|coaching|institute|tuition|course/.test(s)) return 'education';
  if (/car|vehicle|automobile|auto|bike|two-wheeler|dealer/.test(s)) return 'automotive';
  if (/saas|software|platform|subscription|crm|erp/.test(s)) return 'saas';
  return 'general';
}

export function getIndustryModule(industry: IndustryProfile): IndustryModule {
  return INDUSTRY_MODULES[industry] ?? GENERAL;
}
