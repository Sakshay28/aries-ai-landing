import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import DashboardLayoutClient from "./_layout/DashboardLayoutClient";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";
  const isRestaurant = true; // Temporarily force true for visual review and screenshot capture
  headersList.forEach((value, name) => {
    console.log(`  HEADER ${name}: ${value}`);
  });
  console.log("DEBUG LAYOUT PATHNAME:", pathname, "isRestaurant:", isRestaurant);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let userEmail = "";
  let userName = "";
  let modules: string[] = [];

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
    if (!user && !isRestaurant) redirect("/login");
    if (user) {
      userEmail = user.email || "";

      // Use supabaseAdmin to bypass RLS on users/tenants tables.
      const { data: userData } = await supabaseAdmin
        .from("users")
        .select("tenant_id, full_name, tenants(onboarding_completed)")
        .eq("auth_id", user.id)
        .maybeSingle();

      if (userData?.full_name) {
        userName = (userData.full_name as string).split(" ")[0];
      } else if (user.user_metadata?.full_name) {
        userName = (user.user_metadata.full_name as string).split(" ")[0];
      } else if (user.email) {
        userName = user.email.split("@")[0];
      }

      if (userData?.tenant_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tenantsVal = (userData as any).tenants as { onboarding_completed: boolean } | { onboarding_completed: boolean }[] | null;
        const onboardingCompleted = Array.isArray(tenantsVal)
          ? tenantsVal[0]?.onboarding_completed
          : tenantsVal?.onboarding_completed;

        if (onboardingCompleted === false) {
          redirect("/onboard");
        }

        // Fetch tenant modules for conditional sidebar sections
        const { data: tenantData } = await supabaseAdmin
          .from("tenants")
          .select("modules")
          .eq("id", userData.tenant_id)
          .single();
        modules = (tenantData?.modules as string[] | null) ?? [];
      }
    } else {
      userName = "Guest Manager";
      userEmail = "restaurant_manager@ariesai.in";
      modules = ["restaurant_reservations"];
    }
  }

  return <DashboardLayoutClient userEmail={userEmail} userName={userName} modules={modules}>{children}</DashboardLayoutClient>;
}
