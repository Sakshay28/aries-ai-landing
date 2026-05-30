// ═══════════════════════════════════════════════════════════
// 🏗️  Core TypeScript Types — Multi-Tenant SaaS
// ═══════════════════════════════════════════════════════════

// ── Tenant (Client Business) ──
export interface Tenant {
  id: string;
  business_name: string;
  business_type: string;
  business_phone: string | null;
  business_address: string | null;
  business_website: string | null;
  business_email: string | null;
  logo_url: string | null;

  // Bot
  bot_name: string;
  bot_personality: string;
  welcome_message: string | null;
  welcome_offer: string | null;
  usps: string[];
  working_hours: Record<string, string>;

  // WhatsApp
  wa_phone_number_id: string | null;
  wa_access_token: string | null;
  wa_business_account_id: string | null;
  wa_app_secret: string | null;
  wa_verify_token: string;
  wa_webhook_verified: boolean;
  wa_token_expired: boolean;

  // Instagram
  ig_access_token: string | null;
  ig_page_id: string | null;

  // Shopify
  shopify_store_url: string | null;
  shopify_access_token: string | null;
  shopify_webhook_secret: string | null;

  // Billing
  plan: Plan;
  plan_status: PlanStatus;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  trial_ends_at: string;

  // Usage
  messages_used_this_month: number;
  ai_conversations_this_month: number;
  message_limit: number;
  ai_conversation_limit: number;
  current_billing_period_start: string;

  // Staff
  staff_phone: string | null;
  staff_name: string | null;
  manager_phone: string | null;

  // Follow-up Config
  followup_30min: boolean;
  followup_3hr: boolean;
  followup_24hr: boolean;
  followup_7day: boolean;
  escalation_timeout_mins: number;

  // Lead Scoring
  hot_keywords: string[];
  warm_keywords: string[];

  // Custom FAQs (Fix #7)
  custom_faqs: Array<{ question: string; answer: string }>;

  // Off-Hours Config (Fix #8)
  off_hours_message: string | null;
  off_hours_capture_lead: boolean;

  // Meta
  is_active: boolean;
  onboarding_completed: boolean;
  lead_assignment_counter?: number | null;
  outbound_webhook_url?: string | null;
  short_code?: string | null;
  created_at: string;
  updated_at: string;
}

export type Plan = 'starter' | 'growth' | 'pro' | 'enterprise';
export type PlanStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';

// ── User (Dashboard login) ──
export interface User {
  id: string;
  tenant_id: string;
  auth_id: string | null;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_platform_admin: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'owner' | 'admin' | 'staff' | 'viewer';

// ── Lead (Customer contact) ──
export interface Lead {
  id: string;
  tenant_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  channel: Channel;
  source_detail: string | null;
  enquiry_type: string | null;
  guest_count: string | null;
  date_requested: string | null;
  occasion: string | null;
  lead_status: LeadStatus;
  lead_score: number;
  staff_assigned: string | null;
  notes: string | null;
  shopify_customer_id: string | null;
  total_order_value: number;
  first_message_at: string;
  last_message_at: string;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Channel = 'whatsapp' | 'instagram_dm' | 'instagram_comment' | 'shopify' | 'website' | 'manual';
export type LeadStatus = 'new' | 'hot' | 'warm' | 'cold' | 'converted' | 'lost';

// ── Conversation ──
export interface Conversation {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  channel: string;
  sender_id: string;
  sender_name: string | null;
  current_step: string;
  flow_type: string | null;
  context: ConversationContext;
  is_active: boolean;
  bot_paused: boolean;
  escalated: boolean;
  escalated_at: string | null;
  escalation_reason: string | null;
  ai_model_used: string;
  ai_tokens_used: number;
  message_count: number;
  last_message_at: string;
  created_at: string;
}

export interface ConversationContext {
  name?: string;
  phone?: string;
  email?: string;
  enquiry_type?: string;
  guest_count?: string;
  date_requested?: string;
  occasion?: string;
  event_type?: string;
  company_name?: string;
  lead_status?: string;
  notes?: string;
  channel?: string;
  instagram_id?: string;
  from_comment?: boolean;
  [key: string]: unknown;
}

// ── Message ──
export interface Message {
  id: string;
  tenant_id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  message_type: MessageType;
  wa_message_id: string | null;
  channel: string;
  sender_id: string | null;
  status: MessageStatus;
  error_message: string | null;
  ai_generated: boolean;
  ai_latency_ms: number | null;
  created_at: string;
  // Media / Attachment fields (nullable — only set for media messages)
  media_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  media_caption?: string | null;
  reply_to_message_id?: string | null;
  reaction?: string | null;
}

export type MessageType = 'text' | 'interactive' | 'template' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'reaction';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

// ── Follow-Up ──
export interface FollowUp {
  id: string;
  tenant_id: string;
  lead_id: string;
  conversation_id: string | null;
  follow_up_type: FollowUpType;
  scheduled_at: string;
  message: string | null;
  ai_generated: boolean;
  status: FollowUpStatus;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export type FollowUpType = '30min' | '3hr' | '24hr' | '7day' | 'custom';
export type FollowUpStatus = 'pending' | 'sent' | 'cancelled' | 'failed';

// ── Booking ──
export interface Booking {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  booking_date: string | null;
  booking_time: string | null;
  guest_count: string | null;
  occasion: string | null;
  special_requests: string | null;
  status: BookingStatus;
  staff_assigned: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

// ── Shopify Event ──
export interface ShopifyEvent {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  event_type: ShopifyEventType;
  shopify_order_id: string | null;
  order_value: number | null;
  currency: string;
  cart_recovery_sent: boolean;
  cart_recovered: boolean;
  payload: Record<string, unknown>;
  created_at: string;
}

export type ShopifyEventType = 'order_created' | 'order_fulfilled' | 'order_cancelled' | 'cart_abandoned' | 'checkout_started';

// ── Analytics Event ──
export interface AnalyticsEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  channel: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ═══════════════════════════════════════
// API Request/Response Types
// ═══════════════════════════════════════

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ── Dashboard Stats ──
export interface DashboardStats {
  totalLeads: number;
  newLeadsToday: number;
  activeConversations: number;
  confirmedBookings: number;
  conversionRate: string;
  messagesThisMonth: number;
  messageLimit: number;
  topChannel: string;
  peakHour: string;
  leadsByStatus: { status: string; count: number }[];
  leadsByChannel: { channel: string; count: number }[];
  dailyLeads: { date: string; count: number }[];
}

// ── Admin Stats ──
export interface AdminStats {
  totalTenants: number;
  activeTenants: number;
  totalLeads: number;
  totalMessages: number;
  mrr: number;
  trialConversions: number;
  churnRate: string;
  tenantsByPlan: { plan: string; count: number }[];
  revenueByMonth: { month: string; revenue: number }[];
}

// ── Plan Details ──
export const PLAN_DETAILS: Record<Plan, {
  name: string;
  price: number;
  messageLimit: number;
  aiConversationLimit: number;
  features: string[];
}> = {
  starter: {
    name: 'Starter',
    price: 2499,
    messageLimit: 1000,
    aiConversationLimit: 1000,
    features: ['1 WhatsApp number', 'AI-powered bot', 'Basic dashboard', 'Email support'],
  },
  growth: {
    name: 'Growth',
    price: 4999,
    messageLimit: 5000,
    aiConversationLimit: 5000,
    features: ['Everything in Starter', 'Shopify integration', 'Smart follow-ups', 'Advanced analytics', 'Priority support'],
  },
  pro: {
    name: 'Pro',
    price: 9999,
    messageLimit: 999999,
    aiConversationLimit: 999999,
    features: ['Everything in Growth', 'Unlimited conversations', 'Custom AI personality', 'Green tick assistance', 'Instagram automation', 'Dedicated support'],
  },
  enterprise: {
    name: 'Enterprise',
    price: 0, // Custom
    messageLimit: 999999,
    aiConversationLimit: 999999,
    features: ['Everything in Pro', 'Multi-location', 'Custom integrations', 'Dedicated account manager', 'SLA guarantee'],
  },
};

// ═══════════════════════════════════════
// Restaurant Manager Panel Types
// ═══════════════════════════════════════

export type RestaurantDayType = 'weekday' | 'weekend' | 'both';
export type RestaurantBookingStatus = 'confirmed' | 'cancelled' | 'no_show' | 'completed';
export type RestaurantPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface RestaurantSlot {
  id: string;
  restaurant_id: string;
  slot_time: string;          // e.g. "19:00:00"
  day_type: RestaurantDayType;
  total_capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Computed on GET /api/restaurant/slots
  remaining_capacity?: number;
}

export interface RestaurantBooking {
  id: string;
  restaurant_id: string;
  slot_id: string;
  booking_date: string;        // YYYY-MM-DD
  customer_name: string;
  customer_phone: string;
  party_size: number;
  payment_amount: number;      // paise
  payment_status: RestaurantPaymentStatus;
  razorpay_payment_id: string | null;
  booking_status: RestaurantBookingStatus;
  reservation_id: string;      // e.g. CT-20240528-0042
  created_at: string;
  updated_at: string;
  // Joined
  slot_time?: string;
}

export interface RestaurantBlockedDate {
  id: string;
  restaurant_id: string;
  blocked_date: string;        // YYYY-MM-DD
  reason: string | null;
  specific_slot_id: string | null;  // null = entire day blocked
  created_at: string;
}

export interface SeatLock {
  id: string;
  slot_id: string;
  booking_date: string;
  locked_seats: number;
  session_token: string;
  expires_at: string;
  created_at: string;
}

export interface RestaurantStats {
  bookings_today: number;
  bookings_this_week: number;
  no_show_rate: number;               // percentage, last 30 days
  total_deposit_collected_this_month: number;  // rupees (payment_amount / 100)
  most_popular_slot: string | null;   // slot_time string
  upcoming_bookings_today: RestaurantBooking[];
}

export interface SlotAvailabilityResult {
  available: boolean;
  remaining_seats: number;
  error?: string;
}

export interface SeatLockResult {
  locked: boolean;
  expires_at?: string;
  reason?: string;
}

export interface BookingConfirmResult {
  success: boolean;
  reservation_id?: string;
  booking_id?: string;
  idempotent?: boolean;
  reason?: string;
  slot_time?: string;
}
