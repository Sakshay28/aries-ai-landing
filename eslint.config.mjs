import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vercel build output — auto-generated, must not be linted
    ".vercel/**",
    // BullMQ worker bundle — CommonJS output, has require() calls
    "worker.ts",
  ]),
  // ── Contact-name safeguard ────────────────────────────────────────────────
  // Ban hardcoded placeholder display-name fallbacks. Display names must come
  // from the shared helper (src/lib/utils/contact-name.ts: contactDisplayName /
  // greetingName / greetingFirstName). The neutral greeting word lives ONLY in
  // that module (as NEUTRAL_GREETING), which is exempted below.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/utils/contact-name.ts"],
    rules: {
      // Ban the literal 'there' outright (it has no legitimate use outside the
      // shared helper). The broader `someName || 'Unknown'` class is enforced
      // precisely by tests/no-placeholder-name-regression.test.ts, which only
      // flags name fields (so legitimate `connectedEmail || 'Unknown'` etc. are
      // not false-positived).
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value='there']",
          message:
            "Do not hardcode 'there'. Use greetingName()/greetingFirstName() from @/lib/utils/contact-name (it owns the neutral greeting), or contactDisplayName() for UI identity.",
        },
      ],
    },
  },
]);

export default eslintConfig;
