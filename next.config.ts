import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

// ═══════════════════════════════════════════════════════════
// 🔒 Build-Time & Startup Environment Validation Guard
// ═══════════════════════════════════════════════════════════
const PLACEHOLDER_URL = 'https://your-project.supabase.co';

function isPlaceholder(val: string | undefined): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  return (
    trimmed === '' ||
    trimmed === PLACEHOLDER_URL ||
    trimmed === 'placeholder-key' ||
    trimmed === 'your_supabase_anon_key' ||
    trimmed === 'your_supabase_service_role_key' ||
    trimmed.includes('your-project') ||
    trimmed.includes('[project]') ||
    trimmed.startsWith('your_')
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isUrlValid = !isPlaceholder(supabaseUrl);
const isAnonValid = !isPlaceholder(supabaseAnonKey);
const isServiceValid = !isPlaceholder(serviceRoleKey);

console.log('\n━━━━━━ Aries AI Auth Pipeline Audit ━━━━━━');
console.log(`${isUrlValid ? '✅' : '❌'} Supabase URL loaded`);
console.log(`${isAnonValid ? '✅' : '❌'} Anon key loaded`);
console.log(`${isServiceValid ? '✅' : '❌'} Service role key loaded`);

// Google OAuth Provider Verification
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const isGoogleEnabled = !isPlaceholder(googleClientId) && !isPlaceholder(googleClientSecret);
console.log(`${isGoogleEnabled ? '✅' : '❌'} Google provider enabled`);

// Production Redirect URL Verification
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
const isAppUrlValid = !isPlaceholder(appUrl);
console.log(`${isAppUrlValid ? '✅' : '❌'} Production redirect URL loaded`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const isProduction = process.env.NODE_ENV === 'production';
const skipValidation = process.env.SKIP_ENV_VALIDATION === 'true';

if (isProduction && !skipValidation) {
  const missing: string[] = [];
  if (!isUrlValid) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!isAnonValid) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!isServiceValid) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    console.error('\n🔴 BUILD BLOCKER: Authentication variables are missing or set to placeholder values.');
    console.error(`Missing keys: ${missing.join(', ')}`);
    console.error('Next.js requires client variables to be set at build-time to embed them in client-side bundles.');
    console.error('If you absolutely must bypass this check, set SKIP_ENV_VALIDATION=true in your environment.\n');
    process.exit(1); // Hard fail build
  }
}

const isDev = process.env.NODE_ENV !== 'production';
// 'unsafe-eval' is required by Next.js + Turbopack + React HMR in development
// for source-map reconstruction and hot updates. It is NEVER set in production.
const scriptSrc = `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.stripe.com https://checkout.razorpay.com https://connect.facebook.net`;

const csp = [
  "default-src 'self'",
  scriptSrc,
  "connect-src 'self' https://api.razorpay.com https://*.supabase.co wss://*.supabase.co https://graph.facebook.com https://www.facebook.com",
  "frame-src 'self' https://js.stripe.com https://checkout.razorpay.com https://www.facebook.com",
  "img-src 'self' data: https: blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
].join('; ') + ';';

const nextConfig: NextConfig = {
  // Type errors BLOCK deploys. Do not re-enable ignoreBuildErrors — it shipped
  // a broken contact picker (react-window v1 props on v2) and masked the
  // failure_reason schema bug that silently dropped all AI replies for 3 days.
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'Content-Security-Policy', value: csp },
      ],
    }];
  },
};

// Wrap with Sentry only when DSN is configured — no-ops without it
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,          // suppress build output
      disableLogger: true,   // no Sentry SDK logs in prod
      widenClientFileUpload: true,
    })
  : nextConfig;
