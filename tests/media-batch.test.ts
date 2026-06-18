import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatBatchForAI, type BatchedMedia } from '../src/lib/webhook/media-batch';

// Redis-dependent functions (addToBatch, tryFlushBatch, forceFlushBatch) are
// integration-level and need a live Redis instance. This file tests the pure
// logic — formatBatchForAI — which is the part most likely to regress.

function media(overrides: Partial<BatchedMedia> = {}): BatchedMedia {
  return {
    url: 'https://storage.example.com/img.jpg',
    type: 'image',
    caption: null,
    mimeType: 'image/jpeg',
    messageId: 'wamid_' + Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('formatBatchForAI', () => {
  it('formats a single image', () => {
    const result = formatBatchForAI([media()]);
    expect(result).toBe('[Customer sent 1 image]');
  });

  it('formats multiple images', () => {
    const result = formatBatchForAI([media(), media(), media()]);
    expect(result).toBe('[Customer sent 3 images]');
  });

  it('formats mixed media types', () => {
    const batch = [
      media({ type: 'image' }),
      media({ type: 'image' }),
      media({ type: 'video' }),
      media({ type: 'image' }),
      media({ type: 'video' }),
    ];
    const result = formatBatchForAI(batch);
    expect(result).toContain('3 images');
    expect(result).toContain('2 videos');
  });

  it('includes captions when present', () => {
    const batch = [
      media({ caption: 'Our venue setup' }),
      media({ caption: null }),
      media({ caption: 'The garden area' }),
    ];
    const result = formatBatchForAI(batch);
    expect(result).toContain('[Customer sent 3 images]');
    expect(result).toContain('Captions: Our venue setup | The garden area');
  });

  it('omits caption line when none have captions', () => {
    const result = formatBatchForAI([media(), media()]);
    expect(result).not.toContain('Caption');
  });

  it('handles documents', () => {
    const batch = [
      media({ type: 'document' }),
      media({ type: 'image' }),
    ];
    const result = formatBatchForAI(batch);
    expect(result).toContain('1 document');
    expect(result).toContain('1 image');
  });
});
