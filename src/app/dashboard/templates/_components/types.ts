// ─────────────────────────────────────────────
// WhatsApp Template Studio — Shared Types
// ─────────────────────────────────────────────

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export type TemplateStatus =
  | 'DRAFT'
  | 'READY'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED';

export type HeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';

export type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'OTP';

export type OtpMode = 'ZERO_TAP' | 'ONE_TAP' | 'COPY_CODE';

export type ValidityPeriod = 60 | 300 | 600 | 1800 | 3600 | number;

// ── Button ────────────────────────────────────
export interface TemplateButton {
  id: string;          // client-side only
  type: ButtonType;
  text: string;
  url?: string;        // URL buttons
  phoneNumber?: string; // PHONE_NUMBER buttons
  urlType?: 'STATIC' | 'DYNAMIC'; // URL buttons
}

// ── Variable mapping ─────────────────────────
// Maps friendly name → Meta positional index (1-based)
export type VariableMap = Record<string, number>; // { "customer_name": 1, "booking_date": 2 }

// ── Full template state (local draft) ────────
export interface TemplateFormState {
  // Basics
  name: string;              // raw display name
  normalizedName: string;    // lowercase_underscored
  category: TemplateCategory;
  subtype: string;           // e.g. 'Default' | 'Catalogue' | 'Flows' | ...
  language: string;          // Meta locale code e.g. 'en'

  // Header
  headerType: HeaderType;
  headerText: string;        // only if headerType === 'TEXT'
  headerMediaUrl: string;    // Supabase public URL after upload
  headerMediaFile?: File;    // client-side only (for preview before upload)

  // Body
  body: string;              // raw text with {{1}}, {{2}}
  variableMap: VariableMap;  // friendly name → positional index
  variableMode: 'NORMAL' | 'ADVANCED';

  // Footer
  footer: string;

  // Buttons
  buttons: TemplateButton[];

  // Auth-specific
  otpMode: OtpMode;
  securityRecommendation: boolean;
  validityPeriod: ValidityPeriod;

  // Variable Sample Preview Engine
  sampleValues?: Record<string, string>; // friendly name (or numeric index) -> current mock sample value

  // Meta lifecycle
  metaTemplateId?: string;
  status: TemplateStatus;
  rejectionReason?: string;
  localDraftId?: string;    // UUID from draft_templates table
}

// ── API response from Meta / our GET endpoint ─
export interface WaTemplate {
  id: string;               // Meta template ID
  localId?: string;         // Our draft_templates UUID
  name: string;
  category: TemplateCategory;
  subtype?: string;
  language: string;
  status: TemplateStatus;
  rejectionReason?: string;
  components?: MetaComponent[];
  buttons?: TemplateButton[];
  usageCount?: number;
  updatedAt?: string;
  createdAt?: string;
  headerType?: HeaderType;
  headerText?: string;
  headerMediaUrl?: string;
  body?: string;
  footer?: string;
  variableMap?: VariableMap;
  // Guaranteed-delivery binding — which system event auto-selects this
  // template as the fallback when a business-facing WhatsApp send is
  // blocked by the 24h window. Only meaningful for APPROVED templates.
  eventType?: SystemEventType | null;
}

// Mirrors src/lib/whatsapp/templateManager.ts SystemEventType — kept as a
// plain union here to avoid importing server-only code into a client component.
export type SystemEventType =
  | 'booking_confirmation'
  | 'booking_reminder'
  | 'human_assistance'
  | 'support_response'
  | 'lead_follow_up'
  | 'callback_request'
  | 'order_update'
  | 'reservation_update'
  | 'thank_you'
  | 'payment_confirmation'
  | 'staff_keepalive';

export const SYSTEM_EVENT_OPTIONS: { value: SystemEventType; label: string }[] = [
  { value: 'booking_confirmation', label: 'Booking confirmation' },
  { value: 'booking_reminder',     label: 'Booking reminder' },
  { value: 'reservation_update',   label: 'Reservation / cancellation update' },
  { value: 'human_assistance',     label: 'Human assistance / handoff' },
  { value: 'support_response',     label: 'Support response' },
  { value: 'lead_follow_up',       label: 'Lead follow-up' },
  { value: 'callback_request',     label: 'Callback request' },
  { value: 'order_update',         label: 'Order update' },
  { value: 'thank_you',            label: 'Thank you' },
  { value: 'payment_confirmation', label: 'Payment confirmation' },
  { value: 'staff_keepalive',      label: 'Staff keepalive (internal)' },
];

// ── Meta API component shape ──────────────────
export interface MetaComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: string;
  text?: string;
  url?: string;
  buttons?: MetaButtonComponent[];
  example?: {
    header_text?: string[];
    body_text?: string[][];
  };
}

export interface MetaButtonComponent {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

// ── Validation issue ──────────────────────────
export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  suggestion?: string;
  field?: string;
}

// ── Library template (prebuilt) ──────────────
export interface LibraryTemplate {
  id: string;
  title: string;
  description: string;
  industry: string;
  category: TemplateCategory;
  subtype: string;
  language: string;
  name: string;
  headerType: HeaderType;
  headerText?: string;
  body: string;
  footer?: string;
  buttons: Omit<TemplateButton, 'id'>[];
  variableMap: VariableMap;
}

// ── Autosave state ────────────────────────────
export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

// ── Media upload progress ─────────────────────
export interface MediaUploadState {
  file?: File;
  progress: number;       // 0-100
  url?: string;           // final Supabase public URL
  error?: string;
  isUploading: boolean;
}
