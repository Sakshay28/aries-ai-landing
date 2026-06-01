// ─────────────────────────────────────────────
// WhatsApp Template Studio — Constants & Config
// ─────────────────────────────────────────────

import type {
  TemplateCategory,
  TemplateButton,
  LibraryTemplate,
  VariableMap,
  HeaderType,
  OtpMode,
  TemplateFormState,
} from './types';

// ── Default empty form state ──────────────────
export const DEFAULT_FORM_STATE: TemplateFormState = {
  name: '',
  normalizedName: '',
  category: 'MARKETING',
  subtype: 'Default',
  language: 'en',
  headerType: 'NONE',
  headerText: '',
  headerMediaUrl: '',
  body: '',
  variableMap: {},
  variableMode: 'NORMAL',
  footer: '',
  buttons: [],
  otpMode: 'COPY_CODE',
  securityRecommendation: true,
  validityPeriod: 600,
  status: 'DRAFT',
  sampleValues: {},
};

// ── Categories ────────────────────────────────
export const CATEGORIES: {
  id: TemplateCategory;
  label: string;
  icon: string;
  description: string;
  approvalTime: string;
  examples: string[];
  rejectionRisks: string[];
  subtypes: string[];
}[] = [
  {
    id: 'MARKETING',
    label: 'Marketing',
    icon: '📢',
    description: 'Promotions, offers, announcements, product launches and upsell campaigns.',
    approvalTime: 'Usually approved within 24 hours',
    examples: ['Flash Sale Offer', 'New Product Launch', 'Loyalty Reward', 'Event Invitation'],
    rejectionRisks: ['Misleading claims', 'Excessive promotions without opt-out info', 'Spam-like language'],
    subtypes: ['Default', 'Catalogue', 'Flows', 'Order Details', 'Calling Permission Request'],
  },
  {
    id: 'UTILITY',
    label: 'Utility',
    icon: '🔔',
    description: 'Transactional messages like confirmations, reminders, updates and alerts.',
    approvalTime: 'Usually approved within 24 hours',
    examples: ['Reservation Confirmed', 'Appointment Reminder', 'Order Shipped', 'Payment Receipt'],
    rejectionRisks: ['Promotional language in body', 'Marketing CTAs disguised as utility', 'Missing order/booking context'],
    subtypes: ['Default', 'Flows', 'Order Status', 'Order Details', 'Calling Permission Request'],
  },
  {
    id: 'AUTHENTICATION',
    label: 'Authentication',
    icon: '🔐',
    description: 'OTP and verification messages. Highly regulated — use this only for login codes.',
    approvalTime: 'Typically under 30 minutes',
    examples: ['Login OTP', 'Account Verification Code', 'Password Reset Code'],
    rejectionRisks: ['Any marketing content', 'Non-OTP body text', 'Custom buttons not allowed'],
    subtypes: ['One-Time Password'],
  },
];

// ── Languages ─────────────────────────────────
export const LANGUAGES = [
  { value: 'en', label: 'English', pinned: true },
  { value: 'en_IN', label: 'English (India)', pinned: true },
  { value: 'hi', label: 'Hindi', pinned: true },
  { value: 'ar', label: 'Arabic', pinned: true },
  { value: 'es', label: 'Spanish', pinned: true },
  { value: 'fr', label: 'French', pinned: true },
  { value: 'mr', label: 'Marathi', pinned: false },
  { value: 'gu', label: 'Gujarati', pinned: false },
  { value: 'ta', label: 'Tamil', pinned: false },
  { value: 'te', label: 'Telugu', pinned: false },
  { value: 'kn', label: 'Kannada', pinned: false },
  { value: 'ml', label: 'Malayalam', pinned: false },
  { value: 'bn', label: 'Bengali', pinned: false },
  { value: 'de', label: 'German', pinned: false },
  { value: 'pt_BR', label: 'Portuguese (Brazil)', pinned: false },
  { value: 'it', label: 'Italian', pinned: false },
  { value: 'ru', label: 'Russian', pinned: false },
  { value: 'ja', label: 'Japanese', pinned: false },
  { value: 'ko', label: 'Korean', pinned: false },
  { value: 'zh_CN', label: 'Chinese (Simplified)', pinned: false },
  { value: 'id', label: 'Indonesian', pinned: false },
  { value: 'tr', label: 'Turkish', pinned: false },
];

// ── Variable chips (Normal mode) ──────────────
export interface VariableChip {
  group: string;
  name: string;         // friendly name e.g. "customer_name"
  display: string;      // human label e.g. "Customer Name"
  previewValue: string; // fake value for preview e.g. "Kritika"
}

export const VARIABLE_CHIPS: VariableChip[] = [
  // Customer
  { group: 'Customer', name: 'customer_name', display: 'Customer Name', previewValue: 'Sakshay' },
  { group: 'Customer', name: 'customer_phone', display: 'Customer Phone', previewValue: '+91 98765 43210' },
  // Booking
  { group: 'Booking', name: 'booking_date', display: 'Booking Date', previewValue: 'Saturday' },
  { group: 'Booking', name: 'booking_time', display: 'Booking Time', previewValue: '8:30 PM' },
  { group: 'Booking', name: 'booking_id', display: 'Booking ID', previewValue: '#BK-20847' },
  { group: 'Booking', name: 'party_size', display: 'Party Size', previewValue: '4' },
  { group: 'Booking', name: 'guest_count', display: 'Guest Count', previewValue: '4' },
  { group: 'Booking', name: 'guide_name', display: 'Guide Name', previewValue: 'Ravi Shankar' },
  // Business
  { group: 'Business', name: 'business_name', display: 'Business Name', previewValue: 'Aries Restaurant' },
  { group: 'Business', name: 'business_phone', display: 'Business Phone', previewValue: '+91 22 1234 5678' },
  { group: 'Business', name: 'business_address', display: 'Business Address', previewValue: 'Bandra West, Mumbai' },
  // Order
  { group: 'Order', name: 'order_id', display: 'Order ID', previewValue: '#ORD-84921' },
  { group: 'Order', name: 'order_amount', display: 'Order Amount', previewValue: '₹2,450' },
  { group: 'Order', name: 'tracking_link', display: 'Tracking Link', previewValue: 'https://track.aries.ai/84921' },
  { group: 'Order', name: 'delivery_date', display: 'Delivery Date', previewValue: 'Tomorrow, by 6 PM' },
  // Auth
  { group: 'Auth', name: 'otp_code', display: 'OTP Code', previewValue: '827182' },
  { group: 'Auth', name: 'expiry_time', display: 'Expiry Time', previewValue: '10 minutes' },
  // Misc
  { group: 'Misc', name: 'amount', display: 'Amount', previewValue: '₹1,200' },
  { group: 'Misc', name: 'discount_percent', display: 'Discount %', previewValue: '20' },
  { group: 'Misc', name: 'promo_code', display: 'Promo Code', previewValue: 'ARIES20' },
  { group: 'Misc', name: 'doctor_name', display: 'Doctor Name', previewValue: 'Dr. Mehta' },
  { group: 'Misc', name: 'appointment_date', display: 'Appointment Date', previewValue: 'Monday, 9 Jun' },
];

// Preview value lookup by variable name
export const PREVIEW_VALUES: Record<string, string> = Object.fromEntries(
  VARIABLE_CHIPS.map((c) => [c.name, c.previewValue])
);

// ── Media MIME validation ─────────────────────
export const MEDIA_CONSTRAINTS: Record<Exclude<HeaderType, 'NONE' | 'TEXT'>, {
  accept: string;
  maxSizeMB: number;
  extensions: string[];
  mimes: string[];
}> = {
  IMAGE: {
    accept: 'image/jpeg,image/png',
    maxSizeMB: 5,
    extensions: ['.jpg', '.jpeg', '.png'],
    mimes: ['image/jpeg', 'image/png'],
  },
  VIDEO: {
    accept: 'video/mp4',
    maxSizeMB: 16,
    extensions: ['.mp4'],
    mimes: ['video/mp4'],
  },
  DOCUMENT: {
    accept: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    maxSizeMB: 100,
    extensions: ['.pdf', '.doc', '.docx'],
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
};

// ── OTP modes ─────────────────────────────────
export const OTP_MODES: { id: OtpMode; label: string; description: string }[] = [
  {
    id: 'ZERO_TAP',
    label: 'Zero-tap Autofill',
    description: 'OTP fills automatically — zero user action required.',
  },
  {
    id: 'ONE_TAP',
    label: 'One-tap Autofill',
    description: 'User taps one button and OTP fills automatically.',
  },
  {
    id: 'COPY_CODE',
    label: 'Copy Code',
    description: 'User copies OTP from a button inside the message.',
  },
];

// ── Validity periods (auth) ───────────────────
export const VALIDITY_PERIODS: { value: number; label: string }[] = [
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
];

// ── Template name normalizer ──────────────────
export function normalizeName(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 512);
}

// ── Utility: extract {{n}} indices from text ──
export function extractVariableIndices(text: string): number[] {
  const matches = text.match(/\{\{(\d+)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => parseInt(m.replace(/[{}]/g, ''))))]
    .sort((a, b) => a - b);
}


// ── Utility: replace {{n}} with preview values ─
export function renderPreview(
  text: string,
  variableMap: VariableMap,
  sampleValues: Record<string, string> = {}
): string {
  const inverted: Record<number, string> = {};
  for (const [name, idx] of Object.entries(variableMap)) {
    inverted[idx] = sampleValues[name] || PREVIEW_VALUES[name] || `{{${name}}}`;
  }
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const idx = parseInt(n);
    if (inverted[idx]) return inverted[idx];
    if (sampleValues[n]) return sampleValues[n];
    return `[Value ${n}]`;
  });
}

// ── Industry tags ─────────────────────────────
export const INDUSTRIES = [
  'All',
  'Restaurant',
  'Trekking',
  'Clinic',
  'Hotel',
  'SaaS',
  'Education',
  'Ecommerce',
  'Salon',
  'Generic',
];

// ── Prebuilt library templates ────────────────
export const LIBRARY_TEMPLATES: LibraryTemplate[] = [
  // ── Restaurant ──
  {
    id: 'restaurant_reservation_confirmed',
    title: 'Reservation Confirmed',
    description: 'Elegant confirmation for dine-in table bookings with date, time, and guest count.',
    industry: 'Restaurant',
    category: 'UTILITY',
    subtype: 'Default',
    language: 'en',
    name: 'reservation_confirmed',
    headerType: 'TEXT',
    headerText: '🍷 Reservation Confirmed',
    body: 'Dear {{1}},\n\nYour table for {{2}} guests is confirmed at {{3}} on {{4}}.\n\nWe look forward to an exceptional dining experience with you.',
    footer: 'Reply HELP for assistance',
    buttons: [{ type: 'PHONE_NUMBER', text: 'Call Us', phoneNumber: '' }],
    variableMap: { customer_name: 1, party_size: 2, booking_time: 3, booking_date: 4 },
  },
  {
    id: 'restaurant_booking_reminder',
    title: 'Booking Reminder',
    description: 'Day-before reminder to reduce no-shows with confirmation prompt.',
    industry: 'Restaurant',
    category: 'UTILITY',
    subtype: 'Default',
    language: 'en',
    name: 'booking_reminder',
    headerType: 'TEXT',
    headerText: '⏰ Reminder: Your Table Tonight',
    body: 'Hi {{1}}, just a friendly reminder — your table for {{2}} is reserved tonight at {{3}}.\n\nSee you soon! 🙌',
    footer: '',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Confirm ✅' },
      { type: 'QUICK_REPLY', text: 'Reschedule 📅' },
    ],
    variableMap: { customer_name: 1, party_size: 2, booking_time: 3 },
  },
  {
    id: 'restaurant_table_ready',
    title: 'Table Ready',
    description: 'Notify waiting guests when their table is ready.',
    industry: 'Restaurant',
    category: 'UTILITY',
    subtype: 'Default',
    language: 'en',
    name: 'table_ready_now',
    headerType: 'NONE',
    body: '🪑 {{1}}, your table is ready! Please head to the host stand. We\'ve been expecting you.',
    footer: '',
    buttons: [],
    variableMap: { customer_name: 1 },
  },
  {
    id: 'restaurant_feedback_request',
    title: 'Feedback Request',
    description: 'Post-visit feedback request to build ratings and improve service.',
    industry: 'Restaurant',
    category: 'MARKETING',
    subtype: 'Default',
    language: 'en',
    name: 'feedback_request',
    headerType: 'TEXT',
    headerText: '⭐ How was your experience?',
    body: 'Hi {{1}},\n\nThank you for dining with us! We\'d love to hear your thoughts. Your feedback helps us serve you better.',
    footer: 'Rate us on Google',
    buttons: [{ type: 'URL', text: 'Leave a Review', url: 'https://g.page/r/review', urlType: 'STATIC' }],
    variableMap: { customer_name: 1 },
  },

  // ── Trekking ──
  {
    id: 'trekking_trip_confirmed',
    title: 'Trip Confirmed',
    description: 'Official trek confirmation with guide details and departure info.',
    industry: 'Trekking',
    category: 'UTILITY',
    subtype: 'Default',
    language: 'en',
    name: 'trek_confirmed',
    headerType: 'TEXT',
    headerText: '🏔️ Trek Confirmed!',
    body: 'Hi {{1}},\n\nYour trek to {{2}} is confirmed for {{3}}.\n\nYour guide: {{4}} 🧭\n\nMeet point: {{5}} at 5:00 AM sharp.',
    footer: 'Adventure awaits!',
    buttons: [{ type: 'PHONE_NUMBER', text: 'Contact Guide', phoneNumber: '' }],
    variableMap: { customer_name: 1, booking_id: 2, booking_date: 3, guide_name: 4, business_address: 5 },
  },
  {
    id: 'trekking_packing_checklist',
    title: 'Packing Checklist',
    description: 'Pre-trek packing essentials for a safe, prepared adventure.',
    industry: 'Trekking',
    category: 'UTILITY',
    subtype: 'Default',
    language: 'en',
    name: 'packing_checklist',
    headerType: 'TEXT',
    headerText: '🎒 Your Packing Checklist',
    body: 'Hi {{1}}, your trek is in 2 days! Here\'s what to pack:\n\n✅ Trekking shoes\n✅ Rain jacket\n✅ Water bottle (2L)\n✅ Energy bars\n✅ Sunscreen & sunglasses\n✅ First aid kit\n✅ ID proof\n\nSee you at the base! 🏔️',
    footer: '',
    buttons: [],
    variableMap: { customer_name: 1 },
  },

  // ── Clinic ──
  {
    id: 'clinic_appointment_confirmed',
    title: 'Appointment Confirmed',
    description: 'Professional appointment confirmation reducing no-shows.',
    industry: 'Clinic',
    category: 'UTILITY',
    subtype: 'Default',
    language: 'en',
    name: 'appointment_confirmed',
    headerType: 'TEXT',
    headerText: '🩺 Appointment Confirmed',
    body: 'Hello {{1}},\n\nYour appointment with {{2}} is confirmed for {{3}} at {{4}}.\n\nPlease arrive 10 minutes early and carry a valid ID.',
    footer: 'Stay healthy!',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Confirm ✅' },
      { type: 'QUICK_REPLY', text: 'Reschedule' },
    ],
    variableMap: { customer_name: 1, doctor_name: 2, appointment_date: 3, booking_time: 4 },
  },
  {
    id: 'clinic_prescription_reminder',
    title: 'Prescription Reminder',
    description: 'Timely medication reminder to improve patient compliance.',
    industry: 'Clinic',
    category: 'UTILITY',
    subtype: 'Default',
    language: 'en',
    name: 'prescription_reminder',
    headerType: 'NONE',
    body: '💊 Hi {{1}}, this is a reminder to take your prescribed medication today.\n\nConsistency is key to recovery. If you have any concerns, contact us.',
    footer: '',
    buttons: [{ type: 'PHONE_NUMBER', text: 'Call Clinic', phoneNumber: '' }],
    variableMap: { customer_name: 1 },
  },

  // ── Hotel ──
  {
    id: 'hotel_checkin_instructions',
    title: 'Check-in Instructions',
    description: 'Pre-arrival instructions with room details for a seamless check-in.',
    industry: 'Hotel',
    category: 'UTILITY',
    subtype: 'Default',
    language: 'en',
    name: 'hotel_checkin',
    headerType: 'TEXT',
    headerText: '🏨 Your Stay Begins Tomorrow!',
    body: 'Dear {{1}},\n\nWe\'re excited to welcome you! Here are your check-in details:\n\n📍 Address: {{2}}\n🕑 Check-in: {{3}}\n🛏 Room: {{4}}\n\nPresent this message at the front desk for express check-in.',
    footer: 'Enjoy your stay!',
    buttons: [{ type: 'URL', text: 'Get Directions', url: 'https://maps.google.com', urlType: 'STATIC' }],
    variableMap: { customer_name: 1, business_address: 2, booking_time: 3, booking_id: 4 },
  },

  // ── SaaS ──
  {
    id: 'saas_welcome',
    title: 'Welcome to Platform',
    description: 'Warm onboarding welcome for new user sign-ups.',
    industry: 'SaaS',
    category: 'MARKETING',
    subtype: 'Default',
    language: 'en',
    name: 'saas_welcome',
    headerType: 'TEXT',
    headerText: '🚀 Welcome aboard!',
    body: 'Hi {{1}},\n\nThank you for joining {{2}}! Your account is ready.\n\nLet\'s get you started — click below to explore your dashboard.',
    footer: 'You\'re in good hands.',
    buttons: [{ type: 'URL', text: 'Open Dashboard', url: 'https://app.yourplatform.com', urlType: 'STATIC' }],
    variableMap: { customer_name: 1, business_name: 2 },
  },
  {
    id: 'saas_trial_ending',
    title: 'Trial Ending Soon',
    description: 'Last-chance nudge before trial expiry to drive conversions.',
    industry: 'SaaS',
    category: 'MARKETING',
    subtype: 'Default',
    language: 'en',
    name: 'trial_ending_soon',
    headerType: 'TEXT',
    headerText: '⏳ Your trial ends in 3 days',
    body: 'Hi {{1}},\n\nYour free trial of {{2}} expires soon. Don\'t lose access!\n\nUpgrade now and keep all your data, automations and conversations.',
    footer: 'Questions? Reply anytime.',
    buttons: [
      { type: 'URL', text: 'Upgrade Now', url: 'https://yourplatform.com/upgrade', urlType: 'STATIC' },
      { type: 'QUICK_REPLY', text: 'Remind me later' },
    ],
    variableMap: { customer_name: 1, business_name: 2 },
  },

  // ── Ecommerce ──
  {
    id: 'ecom_order_confirmed',
    title: 'Order Confirmed',
    description: 'Instant order confirmation with ID and delivery estimate.',
    industry: 'Ecommerce',
    category: 'UTILITY',
    subtype: 'Default',
    language: 'en',
    name: 'order_confirmed',
    headerType: 'TEXT',
    headerText: '✅ Order Confirmed!',
    body: 'Hi {{1}},\n\nYour order {{2}} has been confirmed! 🎉\n\nAmount: {{3}}\nEstimated delivery: {{4}}\n\nThank you for shopping with us.',
    footer: '',
    buttons: [{ type: 'URL', text: 'Track Order', url: 'https://track.example.com/{{1}}', urlType: 'DYNAMIC' }],
    variableMap: { customer_name: 1, order_id: 2, order_amount: 3, delivery_date: 4 },
  },
  {
    id: 'ecom_order_shipped',
    title: 'Order Shipped',
    description: 'Shipping notification with live tracking link.',
    industry: 'Ecommerce',
    category: 'UTILITY',
    subtype: 'Order Status',
    language: 'en',
    name: 'order_shipped',
    headerType: 'TEXT',
    headerText: '📦 Your order is on its way!',
    body: 'Great news, {{1}}! Your order {{2}} has been dispatched and is heading your way.\n\nTrack it live here: {{3}}',
    footer: '',
    buttons: [{ type: 'URL', text: 'Live Tracking', url: 'https://track.example.com', urlType: 'STATIC' }],
    variableMap: { customer_name: 1, order_id: 2, tracking_link: 3 },
  },

  // ── Salon ──
  {
    id: 'salon_booking_confirmed',
    title: 'Booking Confirmed',
    description: 'Sleek salon appointment confirmation for any treatment.',
    industry: 'Salon',
    category: 'UTILITY',
    subtype: 'Default',
    language: 'en',
    name: 'salon_booking_confirmed',
    headerType: 'TEXT',
    headerText: '💅 You\'re booked in!',
    body: 'Hi {{1}}, your appointment at {{2}} is confirmed for {{3}} at {{4}}.\n\nWe can\'t wait to see you! ✨',
    footer: 'See you soon',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Confirm ✅' },
      { type: 'QUICK_REPLY', text: 'Reschedule' },
    ],
    variableMap: { customer_name: 1, business_name: 2, booking_date: 3, booking_time: 4 },
  },

  // ── Education ──
  {
    id: 'edu_enrollment_confirmed',
    title: 'Enrollment Confirmed',
    description: 'Warm enrollment confirmation for students joining a course.',
    industry: 'Education',
    category: 'UTILITY',
    subtype: 'Default',
    language: 'en',
    name: 'enrollment_confirmed',
    headerType: 'TEXT',
    headerText: '🎓 Enrollment Confirmed!',
    body: 'Hi {{1}},\n\nWelcome to {{2}}! Your enrollment is confirmed.\n\nYour first class starts on {{3}}. We\'re excited to have you with us.',
    footer: 'Keep learning!',
    buttons: [{ type: 'URL', text: 'View Schedule', url: 'https://learn.example.com', urlType: 'STATIC' }],
    variableMap: { customer_name: 1, business_name: 2, booking_date: 3 },
  },
];
