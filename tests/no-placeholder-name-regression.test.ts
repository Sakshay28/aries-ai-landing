// ═══════════════════════════════════════════════════════════════════════════
// REGRESSION GUARD (runs in CI).
// Fails the build if placeholder-name anti-patterns reappear in the source:
//   • a bare "there" / 'there' string literal in code, or
//   • a name-fallback like `xxx.name || 'Unknown'` / `xxx_name || 'there'`.
// The ONE allowed home for the neutral greeting is src/lib/utils/contact-name.ts
// (exported as NEUTRAL_GREETING). Everything else must use the shared helpers
// (contactDisplayName / greetingName / greetingFirstName).
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');

// The single sanctioned home of the neutral greeting word + this guard itself.
const ALLOWLIST = new Set<string>([
  'src/lib/utils/contact-name.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Remove line + simple block comments so matches inside comments don't count. */
function stripComments(line: string): string {
  return line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
}

const BANNED: Array<{ re: RegExp; label: string }> = [
  // Any bare "there" string literal in code.
  { re: /(['"`])there\1/i, label: `a "there" string literal` },
  // A name field falling back to a hardcoded placeholder.
  {
    re: /_?name\s*\)?\s*\|\|\s*(['"`])(there|unknown|anonymous|undefined|null)\1/i,
    label: `a name || 'placeholder' fallback`,
  },
];

describe('no placeholder-name anti-patterns in source', () => {
  it('has no banned placeholder-name literals outside the shared helper', () => {
    const files = walk(SRC);
    const violations: string[] = [];

    for (const file of files) {
      const rel = relative(process.cwd(), file).replace(/\\/g, '/');
      if (ALLOWLIST.has(rel)) continue;

      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((raw, i) => {
        const code = stripComments(raw);
        for (const { re, label } of BANNED) {
          if (re.test(code)) {
            violations.push(`${rel}:${i + 1} → ${label}\n    ${raw.trim()}`);
          }
        }
      });
    }

    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} placeholder-name anti-pattern(s). Use the shared ` +
          `helpers in src/lib/utils/contact-name.ts (contactDisplayName / greetingName / ` +
          `greetingFirstName) instead:\n\n${violations.join('\n')}\n`
      );
    }

    expect(violations).toEqual([]);
  });
});
