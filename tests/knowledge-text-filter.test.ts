// Regression: commit 114e313 filtered the webhook's text-knowledge query on
// `file_url IS NULL` to keep media assets out. Every upload path sets file_url
// (pdf/md/txt included), so for 8 days no tenant's uploaded knowledge reached
// the WhatsApp prompt while the simulator (no such filter) still looked fine.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NON_TEXT_MEDIA_TYPES, TEXT_KNOWLEDGE_DOC_FILTER } from '@/lib/ai/rag';

const webhookSrc = fs.readFileSync(
  path.resolve(__dirname, '../src/app/api/webhooks/whatsapp/route.ts'),
  'utf8',
);

// The `.from('knowledge_docs').select('filename, content_text')` chain that
// feeds knowledgeDocs into the prompt.
function textKbQuery(): string {
  const start = webhookSrc.indexOf(".select('filename, content_text')");
  expect(start).toBeGreaterThan(-1);
  return webhookSrc.slice(start, webhookSrc.indexOf('.limit(', start));
}

describe('text knowledge filter', () => {
  it('excludes every image/video upload type', () => {
    for (const t of ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm', '3gp', 'm4v']) {
      expect(NON_TEXT_MEDIA_TYPES).toContain(t);
    }
    expect(TEXT_KNOWLEDGE_DOC_FILTER).toBe(
      `file_type.is.null,file_type.not.in.(${NON_TEXT_MEDIA_TYPES.join(',')})`,
    );
  });

  it('keeps document types as knowledge', () => {
    for (const t of ['pdf', 'md', 'txt', 'doc', 'docx', 'csv', 'json', 'xlsx']) {
      expect(NON_TEXT_MEDIA_TYPES).not.toContain(t);
    }
  });

  it('webhook selects knowledge by file_type, never by file_url', () => {
    const q = textKbQuery();
    expect(q).toContain('.or(TEXT_KNOWLEDGE_DOC_FILTER)');
    expect(q).not.toMatch(/file_url/);
  });
});
