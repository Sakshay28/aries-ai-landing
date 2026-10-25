// Regression: an owner/staff number that also receives platform alerts must get
// normal AI replies when it messages the bot (e.g. to test it).
// logPlatformSend used to force `bot_paused = true` on that conversation on
// EVERY alert, so the AI silently never answered; and the alerts themselves sat
// in the last-20 history the AI reads as its own previous replies.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NOT_PLATFORM_ALERT_FILTER } from '@/lib/whatsapp/platformSend';

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const platformSrc = read('src/lib/whatsapp/platformSend.ts');
const webhookSrc = read('src/app/api/webhooks/whatsapp/route.ts');

describe('staff numbers get AI replies', () => {
  it('logging a platform alert never pauses the bot', () => {
    const fn = platformSrc.slice(platformSrc.indexOf('async function logPlatformSend'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/bot_paused\s*:\s*true/);
  });

  it('alert rows are tagged so they can be excluded', () => {
    expect(platformSrc).toMatch(/platform_alert:\s*true/);
    expect(NOT_PLATFORM_ALERT_FILTER).toBe('metadata.is.null,metadata->>platform_alert.is.null');
  });

  it('AI history query excludes platform alerts', () => {
    const start = webhookSrc.indexOf(".select('direction, content, ai_generated, raw_webhook')");
    expect(start).toBeGreaterThan(-1);
    const query = webhookSrc.slice(start, webhookSrc.indexOf('.limit(20)', start));
    expect(query).toContain('.or(NOT_PLATFORM_ALERT_FILTER)');
  });

  it('only control taps are intercepted as staff messages', () => {
    // Free text from a staff number must fall through to the normal AI path.
    const block = webhookSrc.slice(webhookSrc.indexOf('const isStaffControlMessage'), webhookSrc.indexOf('let isStaffMessage'));
    expect(block).toMatch(/got_it/);
    expect(block).not.toMatch(/msg\.text\s*&&\s*!/); // no catch-all on any text
  });
});
