import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
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

    const { data: userData } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("auth_id", user.id)
      .maybeSingle();
    if (userData?.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("onboarding_completed")
        .eq("id", userData.tenant_id)
        .maybeSingle();
      if (tenant && tenant.onboarding_completed === false) {
        redirect("/onboard");
      }
    }
  }

  return <DashboardLayoutClient userEmail={userEmail}>{children}</DashboardLayoutClient>;
}
