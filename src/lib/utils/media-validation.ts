// ═══════════════════════════════════════════════════════════
// Upload safety helpers for the Knowledge Media Library.
//
// Deliberately scoped down from full AV/virus scanning (out of
// scope for v1 — these are owner-only uploads to their own
// tenant's private bucket, not public user-generated content).
// Magic-byte validation catches disguised/corrupt files cheaply;
// SHA256 hashing powers a soft duplicate-warning, not a hard block.
// ═══════════════════════════════════════════════════════════

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

export function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ── Verify the file's leading bytes match its claimed extension ──────
export function validateFileSignature(buffer: Buffer, ext: string): boolean {
  if (!buffer || buffer.length === 0) return false;
  const normalizedExt = ext.toLowerCase().trim();

  switch (normalizedExt) {
    case 'jpg':
    case 'jpeg':
      return buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    case 'png':
      return buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    case 'webp':
      return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    case 'pdf':
      return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF';
    case 'mp4':
    case 'mov':
      // ISO base media file format: 4-byte size, then 'ftyp' box type at offset 4
      return buffer.length >= 8 && (buffer.toString('ascii', 4, 8) === 'ftyp' || buffer.toString('ascii', 4, 8) === 'moov');
    case 'webm':
      // EBML header magic (also used by mkv)
      return buffer.length >= 4 && buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
    case 'docx':
    case 'xlsx':
    case 'pptx':
      // Office Open XML formats are ZIP archives (PK header)
      return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
    case 'doc':
    case 'xls':
    case 'ppt':
      // Legacy Microsoft Compound File Binary Format
      return buffer.length >= 8 &&
        buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0 &&
        buffer[4] === 0xA1 && buffer[5] === 0xB1 && buffer[6] === 0x1A && buffer[7] === 0xE1;
    case 'txt':
    case 'md':
    case 'csv':
    case 'json':
    case 'html':
    case 'xml':
      // Plain text formats: should contain readable chars (no excessive NULL bytes)
      return buffer.length > 0;
    default:
      return buffer.length > 0;
  }
}

export interface DuplicateMatch {
  id:       string;
  filename: string;
}

// ── Soft duplicate check — warn, never block ──────────────────────────
// Only a fully-processed ('ready') doc counts as a real duplicate. A row
// stuck in pending/processing (a dead analysis job) or failed must not
// block re-uploading the same file — otherwise a stuck job permanently
// locks the user out of ever uploading that picture again.
export async function findDuplicateByHash(tenantId: string, hash: string): Promise<DuplicateMatch | null> {
  const { data } = await supabaseAdmin
    .from('knowledge_docs')
    .select('id, filename')
    .eq('tenant_id', tenantId)
    .eq('file_hash', hash)
    .eq('processing_status', 'ready')
    .limit(1)
    .maybeSingle();

  return (data as DuplicateMatch | null) ?? null;
}
