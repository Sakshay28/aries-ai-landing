import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import DashboardLayoutClient from "./_layout/DashboardLayoutClient";
import { env, isSupabaseConfigured } from "@/lib/env";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userEmail = "";
  let userName = "";
  let modules: string[] = [];
  let businessType = "";
  let isPlatformAdmin = false;

  if (isSupabaseConfigured) {
    // middleware.ts already ran auth.getUser() for this request and forwards the
    // verified identity via these headers (never trusted from client input — see
    // middleware.ts). Reusing it saves a second Supabase Auth round trip on every
    // single dashboard navigation. Falls back to a real getUser() call otherwise.
    const headerStore = await headers();
    let userId = headerStore.get("x-verified-user-id");
    let resolvedEmail = headerStore.get("x-verified-user-email") || "";
    let metadataFullName: string | undefined;

    if (!userId) {
      const cookieStore = await cookies();
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
      userId = user?.id ?? null;
      resolvedEmail = user?.email || "";
      metadataFullName = user?.user_metadata?.full_name as string | undefined;
    }

    if (!userId) redirect("/login");
    if (userId) {
      userEmail = resolvedEmail;

      // Use supabaseAdmin to bypass RLS on users/tenants tables.
      // Single joined query pulls everything the layout needs (onboarding, approval,
      // modules, business type) so we don't pay 3 extra sequential round trips per navigation.
      const { data: userData, error: userQueryErr } = await supabaseAdmin
        .from("users")
        .select("tenant_id, full_name, is_platform_admin, tenants!tenant_id(onboarding_completed, is_approved, modules, business_type)")
        .eq("auth_id", userId)
        .maybeSingle();

      if (userQueryErr) {
        console.error('[layout] users query failed:', userQueryErr.message, userQueryErr.code, userQueryErr.details);
      }

      isPlatformAdmin = Boolean((userData as { is_platform_admin?: boolean } | null)?.is_platform_admin);

      if (userData?.full_name) {
        userName = (userData.full_name as string).split(" ")[0];
      } else if (metadataFullName) {
        userName = metadataFullName.split(" ")[0];
      } else if (userEmail) {
        userName = userEmail.split("@")[0];
      }

      if (userData?.tenant_id) {
        type TenantRow = {
          onboarding_completed: boolean;
          is_approved: boolean;
          modules: string[] | null;
          business_type: string | null;
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tenantsRaw = (userData as any).tenants as TenantRow | TenantRow[] | null;
        const tenantsVal = Array.isArray(tenantsRaw) ? tenantsRaw[0] : tenantsRaw;

        // Platform approval gate — new signups wait in /pending until approved.
        if (tenantsVal && tenantsVal.is_approved === false) {
          redirect("/pending");
        }

        if (tenantsVal?.onboarding_completed === false) {
          redirect("/onboard");
        }

        modules = tenantsVal?.modules ?? [];
        businessType = tenantsVal?.business_type ?? "";
      }
    }
  }

  return <DashboardLayoutClient userEmail={userEmail} userName={userName} modules={modules} businessType={businessType} isPlatformAdmin={isPlatformAdmin}>{children}</DashboardLayoutClient>;
}
