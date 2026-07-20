// ═══════════════════════════════════════════════════════════
// Media Analysis Job Queue
// ═══════════════════════════════════════════════════════════
// Mirrors embedding-queue.ts's throttled fire-and-forget pattern,
// with its own small concurrency pool so a bulk photo upload can't
// starve text-doc embedding or blow through Gemini vision rate limits.
//
// Flow: upload route calls enqueueMediaAnalysis() → downloads the
// file from storage → runs vision/video analysis (or PDF text
// classification) → writes description/tags/category/processing_status
// → hands off to the existing storeDocEmbedding() for the vector index.
//
// Reliability: if the serverless function dies mid-flight, the row is
// left in 'processing' — MediaAnalysisWorkerService (worker.ts) sweeps
// stuck rows and retries them. Manual edits (manually_edited=true) are
// never overwritten by analysis, only ai_description/tags/category are
// refreshed unless the field was never touched by the owner.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { analyzeImage, analyzeVideo, classifyPdfText, extractPdfText, buildContentText } from '@/lib/ai/media-analysis';
import { storeDocEmbedding } from '@/lib/ai/rag';
import * as Sentry from '@/lib/sentry-stub';

export interface MediaAnalysisJobData {
  docId:       string;
  storagePath: string;
  bucket:      string;
  mimeType:    string;
  fileType:    string; // extension: jpg/png/webp/mp4/mov/webm/pdf
  filename:    string;
  contentText?: string; // already-extracted PDF text, if any
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm']);

// ── Simple in-process throttle: max N concurrent Gemini vision calls ──
const MAX_CONCURRENT = 2;
let _running = 0;
const _pending: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  return new Promise(resolve => {
    if (_running < MAX_CONCURRENT) { _running++; resolve(); return; }
    _pending.push(() => { _running++; resolve(); });
  });
}
function releaseSlot() {
  _running--;
  const next = _pending.shift();
  if (next) next();
}

async function runAnalysis(job: MediaAnalysisJobData): Promise<void> {
  const { docId, storagePath, bucket, mimeType, fileType, filename } = job;

  const { error: markErr } = await supabaseAdmin
    .from('knowledge_docs')
    .update({ processing_status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', docId);
  if (markErr) console.error('media-queue: failed to mark processing for', docId, markErr.message);

  try {
    let title = '';
    let description = '';
    let tags: string[] = [];
    let category = '';
    let contentText = '';

    if (IMAGE_EXTS.has(fileType) || VIDEO_EXTS.has(fileType)) {
      const { data: fileData, error: dlErr } = await supabaseAdmin.storage.from(bucket).download(storagePath);
      if (dlErr || !fileData) throw new Error(dlErr?.message || 'download failed');
      const buffer = Buffer.from(await fileData.arrayBuffer());

      const result = IMAGE_EXTS.has(fileType)
        ? await analyzeImage(buffer, mimeType)
        : await analyzeVideo(buffer, mimeType);

      title = result.title;
      description = result.description;
      tags = result.tags;
      category = result.category;
      contentText = buildContentText(filename, result);
    } else if (fileType === 'pdf') {
      // Text extraction happens here (self-contained, like image/video
      // analysis) rather than synchronously in the upload route — a large
      // PDF's Gemini extraction call could otherwise approach or exceed the
      // serverless function's request timeout before the row is even
      // inserted. The caller may still pass already-extracted text (e.g.
      // the stuck-job reconciler re-using a previously extracted value).
      let extractedText = job.contentText || '';
      if (!extractedText) {
        const { data: fileData, error: dlErr } = await supabaseAdmin.storage.from(bucket).download(storagePath);
        if (dlErr || !fileData) throw new Error(dlErr?.message || 'download failed');
        const buffer = Buffer.from(await fileData.arrayBuffer());
        extractedText = await extractPdfText(buffer);
      }
      const result = await classifyPdfText(extractedText, filename);
      title = result.title;
      description = result.description;
      tags = result.tags;
      category = result.category;
      contentText = extractedText;
    }

    // Store the embedding BEFORE flipping processing_status to 'ready' — a
    // reader that sees 'ready' must always find a non-null embedding, or
    // match_knowledge_docs (which requires embedding IS NOT NULL) would
    // silently miss a doc the UI already claims is searchable.
    if (contentText) {
      await storeDocEmbedding(docId, contentText);
    }

    // Never clobber an owner's manual edits — only refresh the raw AI fields
    // and the owner-facing fields if the owner hasn't touched them yet.
    const { data: current } = await supabaseAdmin
      .from('knowledge_docs')
      .select('manually_edited')
      .eq('id', docId)
      .single();

    const update: Record<string, unknown> = {
      content_text:      contentText,
      ai_description:    description,
      processing_status: 'ready',
      processing_error:  null,
      updated_at:        new Date().toISOString(),
    };
    if (!current?.manually_edited) {
      if (title)        update.title = title;
      if (description)  update.description = description;
      if (tags.length)  update.tags = tags;
      if (category)     update.category = category;
    }

    const { error: updateErr } = await supabaseAdmin
      .from('knowledge_docs')
      .update(update)
      .eq('id', docId);
    if (updateErr) throw new Error(updateErr.message);
  } catch (err) {
    console.error('media-queue: analysis failed for', docId, (err as Error).message);
    Sentry.captureException(err as Error);
    await supabaseAdmin
      .from('knowledge_docs')
      .update({
        processing_status: 'failed',
        processing_error:  (err as Error).message.slice(0, 500),
        updated_at:         new Date().toISOString(),
      })
      .eq('id', docId);
  }
}

// ── Called from the knowledge upload/register routes ──────────────
export async function enqueueMediaAnalysis(job: MediaAnalysisJobData): Promise<void> {
  (async () => {
    await acquireSlot();
    try {
      await runAnalysis(job);
    } finally {
      releaseSlot();
    }
  })();
}
