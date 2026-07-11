/**
 * 🙋 Customer Name Sanitization Utility
 *
 * WhatsApp profile names (msg.contactName) are unreliable — they routinely
 * contain emojis, decorative symbols, or nicknames ("🌸Rahul🌸", "•Sky•", "❤️").
 * Using them to address a customer looks broken and confuses people.
 *
 * These helpers strip a raw name down to a plain, human-readable name — or
 * return null when there's nothing usable left (so callers fall back to a
 * neutral greeting or the phone number). We only ever *address* a customer by
 * a name that survives this cleaning.
 */

// Invisible emoji machinery that must be dropped even though Unicode classes it
// as a "mark": zero-width joiner (U+200D), variation selectors (U+FE00–U+FE0F),
// and emoji skin-tone modifiers (U+1F3FB–U+1F3FF). These would otherwise survive
// the \p{M} allowance below and leave stray artifacts (e.g. the U+FE0F left
// behind after removing ❤️).
const EMOJI_MODIFIERS = /[\u200D\uFE00-\uFE0F\u{1F3FB}-\u{1F3FF}]/gu;

// Matches emoji, pictographs, symbols, dingbats, digits, etc. — anything that
// isn't a letter, combining mark, space, or a few name punctuation chars.
// \p{L} letters, \p{M} combining marks (Indic matras, accents), then allow
// space, apostrophe, hyphen, and dot only.
const NON_NAME_CHARS = /[^\p{L}\p{M} '\-.]/gu;

/**
 * Cleans a raw name into a plain, presentable form.
 * - Strips emojis, symbols, digits, and other non-name characters.
 * - Collapses whitespace and trims stray punctuation.
 * - Title-cases each word.
 * Returns null when the input yields no usable name (empty, too short,
 * digits/phone-like, or all symbols).
 *
 * @param raw The raw name (e.g. a WhatsApp profile name or AI-extracted name)
 */
export function sanitizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Drop invisible emoji modifiers first, then everything that isn't a
  // letter/mark/space/name-punctuation.
  let cleaned = raw
    .normalize('NFC')
    .replace(EMOJI_MODIFIERS, '')
    .replace(NON_NAME_CHARS, ' ');

  // Collapse whitespace.
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Trim leading/trailing punctuation left dangling after symbol removal
  // (e.g. "-Rahul." -> "Rahul").
  cleaned = cleaned.replace(/^[\s'\-.]+|[\s'\-.]+$/g, '').trim();

  if (!cleaned) return null;

  // Must contain at least two actual letters to count as a name.
  const letters = cleaned.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return null;

  // Title-case each token; preserve intra-word hyphens/apostrophes.
  return cleaned
    .toLowerCase()
    .split(' ')
    .map(titleCaseToken)
    .join(' ');
}

/**
 * Returns the sanitized first name only, or null if unusable.
 * Used where a short, friendly address is wanted ("Hey Rahul!").
 */
export function firstName(raw: string | null | undefined): string | null {
  const full = sanitizeName(raw);
  if (!full) return null;
  return full.split(' ')[0] || null;
}

/**
 * Title-cases a single token, handling hyphenated and apostrophe names
 * (e.g. "jean-luc" -> "Jean-Luc", "o'brien" -> "O'Brien").
 */
function titleCaseToken(token: string): string {
  if (!token) return token;
  return token
    .split(/([-'])/) // keep the separators
    .map((part) =>
      part === '-' || part === "'"
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join('');
}
