// ═══════════════════════════════════════════════════════════════════════════
// Broadcast recipient name helpers.
//
// The implementation lives in the app-wide single source of truth
// `@/lib/utils/contact-name`. This module is a thin re-export kept for the
// broadcast import paths; do NOT add fallback logic here.
// ═══════════════════════════════════════════════════════════════════════════
export {
  cleanContactName,
  hasRealName,
  isPlaceholderName,
  contactInitials,
  contactDisplayName,
  recipientDisplayName,
  formatPhoneDisplay,
  greetingName,
  greetingFirstName,
  logInvalidContactName,
  auditRecipientNames,
  NEUTRAL_GREETING,
  NEUTRAL_IDENTITY,
} from '@/lib/utils/contact-name';
export type { ContactNameSource, InvalidNameContext } from '@/lib/utils/contact-name';
