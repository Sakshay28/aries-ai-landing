import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import DashboardLayoutClient from "./_layout/DashboardLayoutClient";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let userEmail = "";

  if (supabaseUrl && supabaseKey && supabaseUrl !== "https://your-project.supabase.co") {
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
          } catch {}
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    userEmail = user?.email || "";

    // Use supabaseAdmin to bypass RLS on users/tenants tables.
    // The anon-key client silently returns null when RLS is enabled
    // without SELECT policies, causing the onboarding check to be skipped.
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("tenant_id, tenants(onboarding_completed)")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (userData?.tenant_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tenantsVal = (userData as any).tenants as { onboarding_completed: boolean } | { onboarding_completed: boolean }[] | null;
      const onboardingCompleted = Array.isArray(tenantsVal)
        ? tenantsVal[0]?.onboarding_completed
        : tenantsVal?.onboarding_completed;

      if (onboardingCompleted === false) {
        redirect("/onboard");
      }
    }
  }

  return <DashboardLayoutClient userEmail={userEmail}>{children}</DashboardLayoutClient>;
}
