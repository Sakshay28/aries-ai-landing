// ═══════════════════════════════════════════════════════════
// 🔌 Supabase Client — Server Components & API Routes
// ═══════════════════════════════════════════════════════════
// Uses cookies for auth session. Respects RLS.
// Use this in Server Components and Route Handlers.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env, isSupabaseConfigured } from '@/lib/env';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  if (!isSupabaseConfigured) {
    return createServerClient(
      'https://placeholder.supabase.co',
      'placeholder-key',
      {
        cookies: {
          getAll() { return []; },
          setAll() {},
        },
      }
    );
  }

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // SECURITY: harden every Supabase auth cookie. Even though
              // this helper is used for read-mostly server queries, the
              // SSR client may still rotate the refresh token, and we
              // never want the JWT to be readable from `document.cookie`.
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: (options as { path?: string } | undefined)?.path ?? '/',
              });
            });
          } catch {
            // Ignore — can fail in Server Components (read-only)
          }
        },
      },
    }
  );
}
