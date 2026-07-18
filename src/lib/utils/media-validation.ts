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
  if (buffer.length < 12) return false;

  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    case 'png':
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    case 'webp':
      return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    case 'pdf':
      return buffer.toString('ascii', 0, 4) === '%PDF';
    case 'mp4':
    case 'mov':
      // ISO base media file format: 4-byte size, then 'ftyp' box type at offset 4
      return buffer.toString('ascii', 4, 8) === 'ftyp';
    case 'webm':
      // EBML header magic (also used by mkv)
      return buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
    default:
      // Text formats (txt/md/csv/json/html/xml) have no fixed signature — skip.
      return true;
  }
}

export interface DuplicateMatch {
  id:       string;
  filename: string;
}

// ── Soft duplicate check — warn, never block ──────────────────────────
export async function findDuplicateByHash(tenantId: string, hash: string): Promise<DuplicateMatch | null> {
  const { data } = await supabaseAdmin
    .from('knowledge_docs')
    .select('id, filename')
    .eq('tenant_id', tenantId)
    .eq('file_hash', hash)
    .limit(1)
    .maybeSingle();

  return (data as DuplicateMatch | null) ?? null;
}
