// ═══════════════════════════════════════════════════════════
// 🛡️ Centralized Environment Variable Validator & Provider
// ═══════════════════════════════════════════════════════════
// This module provides a single, validated source of truth
// for all environment variables. It prevents client-side
// execution context from accessing server-side secrets,
// and ensures consistent, typed retrieval across the app.

export interface EnvDiagnostics {
  supabaseUrlLoaded: boolean;
  anonKeyLoaded: boolean;
  serviceRoleKeyLoaded: boolean;
  appUrlLoaded: boolean;
  isValid: boolean;
}

const PLACEHOLDER_URL = 'https://your-project.supabase.co';

export const isServer = typeof window === 'undefined';

/**
 * Strips out default template placeholders and whitespace so they
 * are treated as undefined/empty rather than hitting broken endpoints.
 */
function cleanEnvValue(val: string | undefined): string {
  if (!val) return '';
  const trimmed = val.trim();
  if (
    trimmed === PLACEHOLDER_URL ||
    trimmed === 'placeholder-key' ||
    trimmed === 'your_supabase_anon_key' ||
    trimmed === 'your_supabase_service_role_key' ||
    trimmed.includes('your-project') ||
    trimmed.includes('[project]') ||
    trimmed.startsWith('your_')
  ) {
    return '';
  }
  return trimmed;
}

// 1. Clean raw inputs
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const rawServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
const rawPlatformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL;
const rawGoogleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// 2. Export sanitized environment variable block
export const env = {
  NEXT_PUBLIC_SUPABASE_URL: cleanEnvValue(rawSupabaseUrl),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: cleanEnvValue(rawSupabaseAnonKey),
  // Bounded access — only read from process.env if on server
  SUPABASE_SERVICE_ROLE_KEY: isServer ? cleanEnvValue(rawServiceRoleKey) : '',
  NEXT_PUBLIC_APP_URL: cleanEnvValue(rawAppUrl) || 'http://localhost:3000',
  PLATFORM_ADMIN_EMAIL: cleanEnvValue(rawPlatformAdminEmail) || 'admin@ariesai.in',
  // No hardcoded fallback — forces the env var to be set explicitly.
  // Hardcoding the client ID leaks your Google project structure and
  // makes key rotation a code-change instead of a config change.
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: cleanEnvValue(rawGoogleClientId) || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
};

// 3. Compute system diagnostics
export function getEnvDiagnostics(): EnvDiagnostics {
  const supabaseUrlLoaded = !!env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKeyLoaded = !!env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Service role key is server-only; browser doesn't have it
  const serviceRoleKeyLoaded = isServer ? !!env.SUPABASE_SERVICE_ROLE_KEY : false;
  const appUrlLoaded = !!env.NEXT_PUBLIC_APP_URL;

  const isValid = isServer
    ? (supabaseUrlLoaded && anonKeyLoaded && serviceRoleKeyLoaded)
    : (supabaseUrlLoaded && anonKeyLoaded);

  return {
    supabaseUrlLoaded,
    anonKeyLoaded,
    serviceRoleKeyLoaded,
    appUrlLoaded,
    isValid,
  };
}

export const isSupabaseConfigured = getEnvDiagnostics().isValid;

/**
 * Strict server-side environment getter. Throws structured errors
 * if accessed from the browser, or if the server variable is missing.
 */
export function getRequiredServerEnv(name: keyof typeof env): string {
  if (!isServer) {
    throw new Error(`Security Violation: Cannot access server secret ${name} in browser client context.`);
  }
  const val = env[name];
  if (!val) {
    throw new Error(`Configuration Error: Required server environment variable "${name}" is missing or is set to a placeholder.`);
  }
  return val;
}
