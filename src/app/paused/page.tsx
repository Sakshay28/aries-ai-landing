import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { sharedRefreshFetch } from "@/lib/supabase/shared-session-refresh";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { isPlanPaused } from "@/lib/tenant/pause";
import PausedScreen from "./PausedScreen";

export const metadata: Metadata = { title: "Account paused | Aries AI" };

// Real numbers only. The last reply is the point customers stopped hearing back:
// nothing outbound leaves a paused account, so it needs no separate pause date.
async function getWaitingStats(tenantId: string) {
  const { data: lastReply } = await supabaseAdmin
    .from("messages")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .eq("direction", "outbound")
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = lastReply?.created_at as string | undefined;
  if (!since) return { messages: 0, customers: 0, since: null };

  const [{ count: messages }, { count: customers }] = await Promise.all([
    supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("direction", "inbound")
      .gt("created_at", since),
    supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gt("last_message_at", since),
  ]);

  return { messages: messages ?? 0, customers: customers ?? 0, since };
}

export default async function PausedPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { fetch: sharedRefreshFetch }, // share session refreshes (lib/supabase/shared-session-refresh)
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() {},
    },
  });
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const userId = authUser?.id;
  if (!userId) redirect("/login");

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("tenant_id, role, is_platform_admin, tenants!tenant_id(business_name, plan_status)")
    .eq("auth_id", userId)
    .maybeSingle();

  const tenantRaw = (user as { tenants?: unknown } | null)?.tenants as
    | { business_name: string | null; plan_status: string | null }
    | { business_name: string | null; plan_status: string | null }[]
    | null
    | undefined;
  const tenant = Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw;

  // Restored accounts (and anyone who lands here by URL) go back to work.
  if (!user?.tenant_id || !isPlanPaused(tenant?.plan_status) || user.is_platform_admin) {
    redirect("/dashboard");
  }

  const stats = await getWaitingStats(user.tenant_id);

  return (
    <PausedScreen
      businessName={tenant?.business_name || "your business"}
      canExport={user.role === "owner" || user.role === "admin"}
      {...stats}
    />
  );
}
