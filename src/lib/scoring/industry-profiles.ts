// Industry-specific scoring patterns that overlay the base engine.
// Each profile adds domain-specific buying signals on top of the universal set.
// Industry is read from business_profiles.industry for the tenant.

export type IndustryProfile =
  | 'travel'
  | 'restaurant'
  | 'hotel'
  | 'clinic'
  | 'real_estate'
  | 'retail'
  | 'general';

export interface IndustryPattern {
  key: string;
  label: string;
  points: number;
  patterns: RegExp[];
}

export const INDUSTRY_PATTERNS: Record<IndustryProfile, IndustryPattern[]> = {
  travel: [
    {
      key: 'ind_altitude',
      label: 'Asked about difficulty/fitness',
      points: 8,
      patterns: [/\b(altitude|elevation|difficult|fitness|beginner|expert|experience.required|level)\b/i],
    },
    {
      key: 'ind_permits',
      label: 'Asked about permits/visa',
      points: 10,
      patterns: [/\b(permit|permissions?|visa|inner.line|restricted.area|pass|icp)\b/i],
    },
    {
      key: 'ind_guide',
      label: 'Asked about guide/team',
      points: 8,
      patterns: [/\b(guide|leader|team size|instructor|porter|support staff)\b/i],
    },
    {
      key: 'ind_expedition_named',
      label: 'Mentioned specific trek/expedition',
      points: 20,
      patterns: [
        /\b(zanskar|ladakh|spiti|manali|kedarkantha|roopkund|chadar|valley of flowers|sar pass|hampta|goecha|sandakphu|brahmatal|kedarnath|markha|pin parvati)\b/i,
      ],
    },
    {
      key: 'ind_group_type',
      label: 'Asked about group/private option',
      points: 8,
      patterns: [/\b(group (trek|expedition|tour)|private (tour|trek)|solo|batch|team)\b/i],
    },
  ],

  restaurant: [
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
      label: 'Asked about dietary options',
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
      label: 'Asked about private dining',
      points: 20,
      patterns: [/\b(private (room|dining|area|space)|exclusive|buyout|event space|banquet)\b/i],
    },
  ],

  hotel: [
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
      label: 'Asked about room type',
      points: 10,
      patterns: [/\b(suite|deluxe|standard|sea.?view|mountain.?view|twin|double|king|queen|connecting|room type)\b/i],
    },
    {
      key: 'ind_early_services',
      label: 'Asked about early check-in/late checkout',
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

  clinic: [
    {
      key: 'ind_appointment',
      label: 'Requested appointment',
      points: 25,
      patterns: [/\b(appointment|consult(ation)?|book (a |an )?appointment|see (the |a |dr\.?)doctor|schedule|slot available)\b/i],
    },
    {
      key: 'ind_specialist',
      label: 'Asked about specific doctor/specialist',
      points: 12,
      patterns: [/\b(dr\.|doctor|specialist|surgeon|physician|dermatologist|cardiologist|orthopedic|pediatrician|gynecologist|therapist)\b/i],
    },
    {
      key: 'ind_insurance',
      label: 'Asked about insurance',
      points: 10,
      patterns: [/\b(insurance|cashless|mediclaim|tpa|empanelled|coverage|health (plan|policy))\b/i],
    },
    {
      key: 'ind_urgency',
      label: 'Expressed urgency',
      points: 20,
      patterns: [/\b(urgent|emergency|immediately|asap|today itself|severe pain|critical|can.t wait)\b/i],
    },
    {
      key: 'ind_reports',
      label: 'Mentioned diagnostic tests/reports',
      points: 10,
      patterns: [/\b(reports?|tests?|blood test|x.?ray|mri|ct.?scan|ultrasound|pathology|biopsy)\b/i],
    },
  ],

  real_estate: [
    {
      key: 'ind_budget',
      label: 'Mentioned budget',
      points: 15,
      patterns: [/\b(budget|crores?|lakhs?|\bcr\b|afford|price range|what.s my limit|investment)\b/i],
    },
    {
      key: 'ind_site_visit',
      label: 'Requested site visit',
      points: 30,
      patterns: [/\b(site visit|property (visit|tour|viewing)|can i (see|visit)|show me|physical visit|walkthrough)\b/i],
    },
    {
      key: 'ind_loan',
      label: 'Asked about home loan/financing',
      points: 12,
      patterns: [/\b(home loan|loan|mortgage|emi|financer|bank finance|down.?payment|pre.?approved)\b/i],
    },
    {
      key: 'ind_property_type',
      label: 'Specified property type',
      points: 10,
      patterns: [/\b(\d\s?bhk|studio apartment|villa|plot|flat|apartment|penthouse|duplex|row.?house)\b/i],
    },
    {
      key: 'ind_timeline',
      label: 'Asked about possession/timeline',
      points: 15,
      patterns: [/\b(possession|handover|when (ready|complete)|move.?in|rera|completion|ready to (move|possess))\b/i],
    },
  ],

  retail: [
    {
      key: 'ind_product_specific',
      label: 'Asked about specific product',
      points: 10,
      patterns: [/\b(product|item|model|variant|sku|size|color|colour|stock)\b/i],
    },
    {
      key: 'ind_delivery',
      label: 'Asked about delivery',
      points: 12,
      patterns: [/\b(deliver|delivery|shipping|dispatch|courier|cod|cash on delivery|track (order|shipment))\b/i],
    },
    {
      key: 'ind_discount',
      label: 'Asked about offers/discount',
      points: 8,
      patterns: [/\b(offer|discount|deal|sale|promo|coupon|cashback|best price)\b/i],
    },
    {
      key: 'ind_bulk',
      label: 'Wholesale/bulk inquiry',
      points: 20,
      patterns: [/\b(bulk|wholesale|trade (price|enquiry)|reseller|distributor|quantity discount)\b/i],
    },
    {
      key: 'ind_return_policy',
      label: 'Asked about return/warranty',
      points: 5,
      patterns: [/\b(return (policy|process)|exchange|warranty|guarantee|replace)\b/i],
    },
  ],

  general: [],
};

// Normalize an industry string from the business_profiles table to a valid profile key.
export function normalizeIndustry(raw: string | null | undefined): IndustryProfile {
  const s = (raw ?? '').toLowerCase().trim();
  if (/travel|trek|tour|expedition|adventure|tourism/.test(s)) return 'travel';
  if (/restaurant|food|dine|cafe|bistro|dhaba|eatery/.test(s)) return 'restaurant';
  if (/hotel|resort|lodge|hostel|stay|accommodation/.test(s)) return 'hotel';
  if (/clinic|hospital|health|medical|doctor|dental|pharmacy/.test(s)) return 'clinic';
  if (/real estate|property|realty|housing|builder|developer/.test(s)) return 'real_estate';
  if (/retail|shop|store|ecommerce|e-commerce|fashion|apparel/.test(s)) return 'retail';
  return 'general';
}
