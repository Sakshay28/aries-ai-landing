import { cleanPhone } from '@/lib/meta/service';
import { cleanContactName } from '@/lib/utils/contact-name';

interface CSVRowPreview {
  name: string | null;
  phone: string;
  isValid: boolean;
  reason?: string;
}

interface CSVImportResult {
  totalRows: number;
  validCount: number;
  duplicatesRemoved: number;
  invalidRemoved: number;
  previewRows: CSVRowPreview[];
}

export class CSVImportService {
  /**
   * Parses raw CSV comma-delimited strings, normalizes phone numbers to E.164,
   * performs strict deduplication, and returns validation metrics before saving.
   */
  static parseAndValidate(csvText: string, defaultCountryCode = '91'): CSVImportResult {
    const lines = csvText.split(/\r?\n/).filter(line => !!line.trim());
    if (lines.length <= 1) {
      return { totalRows: 0, validCount: 0, duplicatesRemoved: 0, invalidRemoved: 0, previewRows: [] };
    }

    // 1. Determine column mappings from header row
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    let nameIdx = headers.findIndex(h => h.includes('name') || h.includes('first'));
    let phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('number') || h.includes('mobile'));

    // Fallbacks if no clear headers exist
    if (nameIdx === -1) nameIdx = 0;
    if (phoneIdx === -1) phoneIdx = 1;

    const dataLines = lines.slice(1);
    const seenPhones = new Set<string>();
    
    let duplicatesRemoved = 0;
    let invalidRemoved = 0;
    let validCount = 0;
    
    const previewRows: CSVRowPreview[] = [];

    for (const line of dataLines) {
      // Basic comma split (handles simple double quotes if any)
      const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length <= Math.max(nameIdx, phoneIdx)) {
        invalidRemoved++;
        continue;
      }

      // Clean human name or null — never a placeholder. Display layers fall back
      // to the phone number via contactDisplayName.
      const nameVal = cleanContactName(cols[nameIdx]);
      const rawPhone = cols[phoneIdx] || '';

      if (!rawPhone) {
        invalidRemoved++;
        previewRows.push({ name: nameVal, phone: '', isValid: false, reason: 'Phone number missing' });
        continue;
      }

      // E.164 Clean & Format normalization. cleanPhone THROWS on garbage input
      // (shape guard added 2026-06-09) — treat a throw as an invalid row instead
      // of letting one bad number kill the whole import.
      let phoneCleaned: string;
      try {
        phoneCleaned = cleanPhone(rawPhone);
      } catch {
        invalidRemoved++;
        previewRows.push({ name: nameVal, phone: rawPhone, isValid: false, reason: 'Invalid phone number format' });
        continue;
      }
      
      // Auto-append country code if phone number is local (e.g. 10 digits in India / US)
      if (phoneCleaned.length === 10) {
        phoneCleaned = defaultCountryCode + phoneCleaned;
      }

      // Basic E.164 checks (length between 10 and 15 digits)
      if (phoneCleaned.length < 10 || phoneCleaned.length > 15 || /\D/.test(phoneCleaned)) {
        invalidRemoved++;
        previewRows.push({ name: nameVal, phone: rawPhone, isValid: false, reason: 'Invalid E.164 number format' });
        continue;
      }

      // Deduplication check
      if (seenPhones.has(phoneCleaned)) {
        duplicatesRemoved++;
        previewRows.push({ name: nameVal, phone: phoneCleaned, isValid: false, reason: 'Duplicate row removed' });
        continue;
      }

      seenPhones.add(phoneCleaned);
      validCount++;

      previewRows.push({
        name: nameVal,
        phone: phoneCleaned,
        isValid: true
      });
    }

    return {
      totalRows: dataLines.length,
      validCount,
      duplicatesRemoved,
      invalidRemoved,
      previewRows: previewRows.slice(0, 100) // Caps preview size to avoid context spikes
    };
  }
}
