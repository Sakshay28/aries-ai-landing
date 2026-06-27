import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import DashboardLayoutClient from "./_layout/DashboardLayoutClient";
import { env, isSupabaseConfigured } from "@/lib/env";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  let userEmail = "";
  let userName = "";
  let modules: string[] = [];
  let businessType = "";
  let isPlatformAdmin = false;

  if (isSupabaseConfigured) {
    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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
    if (user) {
      userEmail = user.email || "";

      // Use supabaseAdmin to bypass RLS on users/tenants tables.
      const { data: userData, error: userQueryErr } = await supabaseAdmin
        .from("users")
        .select("tenant_id, full_name, is_platform_admin, tenants!tenant_id(onboarding_completed)")
        .eq("auth_id", user.id)
        .maybeSingle();

      if (userQueryErr) {
        console.error('[layout] users query failed:', userQueryErr.message, userQueryErr.code, userQueryErr.details);
      }

      isPlatformAdmin = Boolean((userData as { is_platform_admin?: boolean } | null)?.is_platform_admin);

      if (userData?.full_name) {
        userName = (userData.full_name as string).split(" ")[0];
      } else if (user.user_metadata?.full_name) {
        userName = (user.user_metadata.full_name as string).split(" ")[0];
      } else if (user.email) {
        userName = user.email.split("@")[0];
      }

      if (userData?.tenant_id) {
        // Platform approval gate — new signups wait in /pending until approved.
        // Separate query so a not-yet-migrated column can't break the layout.
        const { data: approvalRow } = await supabaseAdmin
          .from("tenants")
          .select("is_approved")
          .eq("id", userData.tenant_id)
          .single();
        if (approvalRow && approvalRow.is_approved === false) {
          redirect("/pending");
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tenantsVal = (userData as any).tenants as { onboarding_completed: boolean } | { onboarding_completed: boolean }[] | null;
        const onboardingCompleted = Array.isArray(tenantsVal)
          ? tenantsVal[0]?.onboarding_completed
          : tenantsVal?.onboarding_completed;

        if (onboardingCompleted === false) {
          redirect("/onboard");
        }

        // Fetch tenant modules + business type for conditional sidebar sections
        const { data: tenantData } = await supabaseAdmin
          .from("tenants")
          .select("modules, business_type")
          .eq("id", userData.tenant_id)
          .single();
        modules = (tenantData?.modules as string[] | null) ?? [];
        businessType = (tenantData?.business_type as string | null) ?? "";
      }
    }
  }

  return <DashboardLayoutClient userEmail={userEmail} userName={userName} modules={modules} businessType={businessType} isPlatformAdmin={isPlatformAdmin}>{children}</DashboardLayoutClient>;
}
