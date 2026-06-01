import { parsePhoneNumberFromString } from 'libphonenumber-js';

export interface CSVProcessResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicatesRemoved: number;
  normalizedNumbers: string[];
  eligibleRecipients: number;
  contacts: Array<{ id: string; name: string; phone: string; email?: string }>;
}

export class CSVProcessorService {
  /**
   * Parses, normalizes, dedupes, and validates CSV rows for E.164 outbound compliance.
   */
  static processCSV(rawCSV: string): CSVProcessResult {
    const lines = rawCSV.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicatesRemoved: 0,
        normalizedNumbers: [],
        eligibleRecipients: 0,
        contacts: []
      };
    }

    // Attempt to detect headers: name, phone, email, tags
    const headerLine = lines[0];
    const headers = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    
    let phoneIndex = headers.findIndex(h => h.includes('phone') || h.includes('number') || h.includes('mobile') || h.includes('recipient'));
    let nameIndex = headers.findIndex(h => h.includes('name') || h.includes('customer') || h.includes('lead') || h.includes('contact'));
    let emailIndex = headers.findIndex(h => h.includes('email') || h.includes('mail'));

    // Fallbacks if no headers exist or match
    if (phoneIndex === -1) phoneIndex = 0;
    if (nameIndex === -1) nameIndex = 1;
    if (emailIndex === -1) emailIndex = 2;

    const dataLines = lines.slice(1);
    const seenPhones = new Set<string>();
    const contacts: CSVProcessResult['contacts'] = [];
    
    let duplicatesRemoved = 0;
    let invalidRows = 0;

    dataLines.forEach((line, idx) => {
      // Crude but effective CSV parser ignoring commas inside quotes
      const cells = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cells.length === 0 || !cells[phoneIndex]) {
        invalidRows++;
        return;
      }

      const rawPhone = cells[phoneIndex];
      const rawName = cells[nameIndex] || `Recipient ${idx + 1}`;
      const rawEmail = cells[emailIndex] || '';

      // Normalize phone number to E.164 using libphonenumber-js
      const normalized = this.normalizePhoneNumber(rawPhone);
      if (!normalized) {
        invalidRows++;
        return;
      }

      // Check for duplicates
      if (seenPhones.has(normalized)) {
        duplicatesRemoved++;
        return;
      }

      seenPhones.add(normalized);
      contacts.push({
        id: `csv-${idx}-${Date.now()}`,
        name: rawName,
        phone: normalized,
        email: rawEmail
      });
    });

    return {
      totalRows: dataLines.length,
      validRows: contacts.length,
      invalidRows,
      duplicatesRemoved,
      normalizedNumbers: Array.from(seenPhones),
      eligibleRecipients: contacts.length,
      contacts
    };
  }

  /**
   * Helper to normalize a phone number using libphonenumber-js.
   */
  private static normalizePhoneNumber(phone: string): string | null {
    let cleaned = phone.replace(/\D/g, '');
    if (!phone.startsWith('+')) {
      // Default to India prefix (91) if it's 10 digits
      if (cleaned.length === 10) {
        cleaned = '91' + cleaned;
      }
      cleaned = '+' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }

    const parsed = parsePhoneNumberFromString(cleaned);
    if (parsed && parsed.isValid()) {
      return parsed.format('E.164');
    }

    // Try a second loose parsing
    const simple = parsePhoneNumberFromString('+' + phone.replace(/\D/g, ''));
    if (simple && simple.isValid()) {
      return simple.format('E.164');
    }

    // Last resort loose validation (10 to 15 digits)
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) {
      return '+' + digits;
    }

    return null;
  }
}
