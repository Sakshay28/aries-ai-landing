// ═══════════════════════════════════════════════════════════
// Chat media retention
// ═══════════════════════════════════════════════════════════
// Every inbound WhatsApp photo/video/voice note is copied into the
// `whatsapp-media` bucket (Meta's own URLs expire in minutes), and agent
// uploads land in `chat-attachments`. Nothing ever deleted them — the
// message-retention cron removes message rows after 90 days but not their
// files — so storage grew without bound until the free plan's 1 GB file
// quota was exceeded and Supabase restricted the whole project (402 on
// every request, logins included) on 2026-10-30.
//
// This walks the chat-media buckets and deletes objects older than the
// retention window through the Storage API (so the underlying files go too,
// not just their metadata rows). Template media and knowledge documents are
// never touched: they live in other buckets and are business assets.
// The inbox already renders a missing file as "Image unavailable".
// ═══════════════════════════════════════════════════════════

export const CHAT_MEDIA_RETENTION_BUCKETS = ['whatsapp-media', 'chat-attachments', 'voice-notes'] as const;

export const DEFAULT_MEDIA_RETENTION_DAYS = 30;
export const MIN_MEDIA_RETENTION_DAYS = 7;

const LIST_PAGE_SIZE = 1000;
const REMOVE_CHUNK_SIZE = 100;
const MAX_FOLDER_DEPTH = 4;

interface StorageListEntry {
  name: string;
  id: string | null;            // null → a folder (prefix), not an object
  created_at?: string | null;
  metadata?: { size?: number } | null;
}

export interface StorageLike {
  from(bucket: string): {
    list(prefix: string, options: { limit: number; offset: number; sortBy?: { column: string; order: string } }):
      Promise<{ data: StorageListEntry[] | null; error: { message: string } | null }>;
    remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

export interface MediaRetentionResult {
  cutoff: string;
  deletedFiles: number;
  freedBytes: number;
  scannedFiles: number;
  complete: boolean;            // false → stopped on the time budget; tomorrow's run continues
  errors: string[];
}

/** Retention days from an override (query param / env), clamped to a safe minimum. */
export function resolveRetentionDays(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MEDIA_RETENTION_DAYS;
  return Math.max(n, MIN_MEDIA_RETENTION_DAYS);
}

export async function purgeExpiredChatMedia(
  storage: StorageLike,
  { retentionDays, deadline, now = Date.now() }: { retentionDays: number; deadline: number; now?: number },
): Promise<MediaRetentionResult> {
  const cutoffMs = now - retentionDays * 24 * 60 * 60 * 1000;
  const result: MediaRetentionResult = {
    cutoff: new Date(cutoffMs).toISOString(),
    deletedFiles: 0,
    freedBytes: 0,
    scannedFiles: 0,
    complete: true,
    errors: [],
  };

  const outOfTime = () => {
    if (Date.now() >= deadline) { result.complete = false; return true; }
    return false;
  };

  const purgeFolder = async (bucket: string, prefix: string, depth: number): Promise<void> => {
    const expired: { path: string; size: number }[] = [];
    const subfolders: string[] = [];

    // List the whole folder before deleting anything, so removals can't
    // shift the offset window and skip entries.
    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      if (outOfTime()) return;
      const { data, error } = await storage.from(bucket).list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) { result.errors.push(`${bucket}/${prefix}: ${error.message}`); return; }
      const entries = data ?? [];
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) { subfolders.push(path); continue; }
        result.scannedFiles++;
        const createdMs = entry.created_at ? Date.parse(entry.created_at) : NaN;
        if (Number.isFinite(createdMs) && createdMs < cutoffMs) {
          expired.push({ path, size: entry.metadata?.size ?? 0 });
        }
      }
      if (entries.length < LIST_PAGE_SIZE) break;
    }

    for (let i = 0; i < expired.length; i += REMOVE_CHUNK_SIZE) {
      if (outOfTime()) return;
      const chunk = expired.slice(i, i + REMOVE_CHUNK_SIZE);
      const { error } = await storage.from(bucket).remove(chunk.map((f) => f.path));
      if (error) { result.errors.push(`${bucket} remove: ${error.message}`); continue; }
      result.deletedFiles += chunk.length;
      result.freedBytes += chunk.reduce((sum, f) => sum + f.size, 0);
    }

    if (depth >= MAX_FOLDER_DEPTH) return;
    for (const sub of subfolders) {
      if (outOfTime()) return;
      await purgeFolder(bucket, sub, depth + 1);
    }
  };

  for (const bucket of CHAT_MEDIA_RETENTION_BUCKETS) {
    if (outOfTime()) break;
    await purgeFolder(bucket, '', 0);
  }

  return result;
}
