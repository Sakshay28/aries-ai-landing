// ═══════════════════════════════════════════════════════════
// Media Analysis stuck-job reconciler.
//
// enqueueMediaAnalysis() is fire-and-forget on the serverless request path —
// if the function is killed mid-flight, the row is left in 'pending' or
// 'processing' forever. This sweeps rows stale past a threshold and
// re-enqueues them. Mirrors the GoogleSheetsWorkerService.processQueue
// shape already used by worker.ts's tick loop.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { enqueueMediaAnalysis } from '@/lib/ai/media-queue';

const STALE_MINUTES = 10;
const MEDIA_FILE_TYPES = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm', 'pdf'];
const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf',
};

export class MediaAnalysisWorkerService {
  public static async processQueue(workerId: string, limit: number = 20): Promise<number> {
    const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

    const { data: stuck, error } = await supabaseAdmin
      .from('knowledge_docs')
      .select('id, filename, file_type, file_url, content_text')
      .in('processing_status', ['pending', 'processing'])
      .in('file_type', MEDIA_FILE_TYPES)
      .lt('updated_at', staleBefore)
      .limit(limit);

    if (error) {
      console.error(`❌ [media-analysis worker:${workerId}] failed to query stuck jobs:`, error.message);
      return 0;
    }
    if (!stuck || stuck.length === 0) return 0;

    console.log(`🔁 [media-analysis worker:${workerId}] re-enqueuing ${stuck.length} stuck media job(s)`);

    for (const doc of stuck as Array<{ id: string; filename: string; file_type: string; file_url: string | null; content_text: string | null }>) {
      if (!doc.file_url) continue;
      enqueueMediaAnalysis({
        docId:       doc.id,
        storagePath: doc.file_url,
        bucket:      'knowledge-docs',
        mimeType:    MIME_BY_EXT[doc.file_type] || 'application/octet-stream',
        fileType:    doc.file_type,
        filename:    doc.filename,
        contentText: doc.file_type === 'pdf' ? (doc.content_text || undefined) : undefined,
      });
    }

    return stuck.length;
  }
}
