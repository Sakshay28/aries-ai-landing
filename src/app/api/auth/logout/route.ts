// ═══════════════════════════════════════════════════════════
// 🔐 Auth API — Logout
// ═══════════════════════════════════════════════════════════
// Clears the Supabase SSR session cookies server-side via the
// @supabase/ssr server client. Client redirects to /login after.
// ═══════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey && supabaseUrl !== 'https://your-project.supabase.co') {
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch {
              // Ignore — can fail in Server Components (read-only)
            }
          },
        },
      });

      await supabase.auth.signOut();
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ Logout error:', err);
    return NextResponse.json(
      { success: false, error: 'Logout failed' },
      { status: 500 }
    );
  }
}
