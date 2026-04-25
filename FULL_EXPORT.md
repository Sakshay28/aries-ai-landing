# Project Bolt Export



## src/app/admin/page.tsx
```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ═══════════════════════════════════════
// 🛡️ Admin Panel — Platform Overview
// ═══════════════════════════════════════
// Now fetches REAL data from /api/admin/overview.
// No more mock tenants — all Supabase-backed.
// ═══════════════════════════════════════

interface AdminTenant {
  id: string;
  business_name: string;
  business_type: string;
  plan: string;
  plan_status: string;
  messages_used_this_month: number;
  message_limit: number;
  is_active: boolean;
  created_at: string;
  wa_phone_number_id: string | null;
}

interface AdminStats {
  totalTenants: number;
  activeTenants: number;
  totalLeads: number;
  totalMessages: number;
  mrr: number;
  tenantsByPlan: { plan: string; count: number }[];
}

function getStatusFromTenant(t: AdminTenant): string {
  if (!t.is_active) return "suspended";
  if (t.plan_status === "trialing") return "trial";
  if (t.plan_status === "cancelled") return "churned";
  if (t.plan_status === "active") return "active";
  return t.plan_status;
}

function getStatusStyle(s: string) {
  const m: Record<string, { bg: string; color: string }> = {
    active: { bg: "#00B89422", color: "#00B894" },
    trial: { bg: "#6C5CE722", color: "#6C5CE7" },
    trialing: { bg: "#6C5CE722", color: "#6C5CE7" },
    churned: { bg: "#E1705522", color: "#E17055" },
    cancelled: { bg: "#E1705522", color: "#E17055" },
    suspended: { bg: "#FDCB6E22", color: "#FDCB6E" },
    past_due: { bg: "#FDCB6E22", color: "#FDCB6E" },
  };
  return m[s] || m.active;
}

function getHealthScore(t: AdminTenant): number {
  let score = 0;
  if (t.is_active) score += 30;
  if (t.wa_phone_number_id) score += 30;
  if (t.messages_used_this_month > 0) score += 20;
  if (t.plan_status === "active") score += 20;
  return score;
}

function getHealthColor(score: number) {
  if (score >= 80) return "#00B894";
  if (score >= 50) return "#FDCB6E";
  return "#E17055";
}

export default function AdminDashboardPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview");
      if (!res.ok) {
        if (res.status === 403) throw new Error("Admin access required. You must be a platform admin.");
        throw new Error(`API error: ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setStats(data.data.stats);
        setTenants(data.data.tenants || []);
      } else {
        throw new Error(data.error || "Failed to load admin data");
      }
    } catch (err) {
      console.error("Admin fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalMRR = stats?.mrr || 0;
  const activeCount = stats?.activeTenants || 0;
  const trialCount = tenants.filter(t => t.plan_status === "trialing").length;
  const totalMessages = stats?.totalMessages || 0;
  const totalLeads = stats?.totalLeads || 0;

  const filtered = filter === "all"
    ? tenants
    : tenants.filter(t => getStatusFromTenant(t) === filter);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <aside style={{
        width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)",
        padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
      }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Admin Panel</span>
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "🏠", label: "Overview", href: "/admin", active: true },
            { icon: "🏢", label: "All Clients", href: "/admin/clients" },
            { icon: "💰", label: "Revenue", href: "/admin/revenue" },
            { icon: "📊", label: "Analytics", href: "/admin/analytics" },
            { icon: "⚙️", label: "Platform Settings", href: "/admin/settings" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 50, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>🛡️ Platform Admin</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Overview of all clients and platform health.</p>
          </div>
          <button onClick={fetchData} style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.85rem" }}>🔄 Refresh</button>
        </header>

        <div style={{ padding: "2rem" }}>
          {/* Error */}
          {error && (
            <div style={{ padding: "1rem 1.5rem", background: "rgba(225, 112, 85, 0.1)", border: "1px solid rgba(225, 112, 85, 0.3)", borderRadius: "8px", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#E17055", fontSize: "0.9rem" }}>❌ {error}</span>
              <button onClick={fetchData} style={{ padding: "0.4rem 1rem", background: "#E17055", border: "none", borderRadius: "6px", color: "white", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>Retry</button>
            </div>
          )}

          {/* Loading */}
          {loading && !stats && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--text-muted)" }}>
              <span style={{ fontSize: "1.5rem", marginRight: "0.5rem" }}>⏳</span> Loading admin data...
            </div>
          )}

          {/* Stats Grid */}
          {stats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
              {[
                { icon: "💰", label: "Monthly Revenue", value: `₹${(totalMRR).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`, color: "#00B894" },
                { icon: "🏢", label: "Active Clients", value: activeCount, color: "#6C5CE7" },
                { icon: "🆓", label: "On Trial", value: trialCount, color: "#FDCB6E" },
                { icon: "📩", label: "Total Messages", value: totalMessages.toLocaleString(), color: "#00CEC9" },
                { icon: "👥", label: "Total Leads", value: totalLeads.toLocaleString(), color: "#A29BFE" },
              ].map((s) => (
                <div key={s.label} className="glass-card" style={{ padding: "1.25rem", borderTop: `3px solid ${s.color}` }}>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>{s.icon} {s.label}</p>
                  <p style={{ fontSize: "1.75rem", fontWeight: 800, color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Client Table */}
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>All Clients ({filtered.length})</h2>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {["all", "active", "trial", "churned"].map((f) => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: "0.4rem 1rem", border: "1px solid var(--border)", borderRadius: "6px",
                    background: filter === f ? "var(--primary)" : "transparent",
                    color: filter === f ? "white" : "var(--text-secondary)",
                    cursor: "pointer", fontSize: "0.8rem", textTransform: "capitalize",
                  }}>{f}</button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>
                {loading ? "Loading..." : "No clients found. They'll appear here after sign-up."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Client", "Plan", "Status", "Messages", "WA Connected", "Health", "Since"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => {
                      const status = getStatusFromTenant(t);
                      const st = getStatusStyle(status);
                      const health = getHealthScore(t);
                      return (
                        <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.75rem" }}>
                            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{t.business_name}</div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{t.business_type}</div>
                          </td>
                          <td style={{ padding: "0.75rem", color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "capitalize" }}>{t.plan}</td>
                          <td style={{ padding: "0.75rem" }}>
                            <span style={{ padding: "0.2rem 0.6rem", borderRadius: "10px", fontSize: "0.75rem", fontWeight: 600, background: st.bg, color: st.color }}>{status}</span>
                          </td>
                          <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>
                            {t.messages_used_this_month.toLocaleString()} / {t.message_limit.toLocaleString()}
                          </td>
                          <td style={{ padding: "0.75rem" }}>
                            <span style={{ color: t.wa_phone_number_id ? "#00B894" : "#E17055", fontSize: "0.85rem" }}>
                              {t.wa_phone_number_id ? "✅ Yes" : "❌ No"}
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <div style={{ width: "40px", height: "6px", background: "var(--bg-tertiary)", borderRadius: "3px", overflow: "hidden" }}>
                                <div style={{ width: `${health}%`, height: "100%", background: getHealthColor(health), borderRadius: "3px" }} />
                              </div>
                              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: getHealthColor(health) }}>{health}</span>
                            </div>
                          </td>
                          <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                            {new Date(t.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

```


## src/app/api/admin/overview/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🛡️ Admin API — Platform Owner Dashboard
// ═══════════════════════════════════════════════════════════
// Only accessible by platform admins (is_platform_admin=true).
// Shows all clients, revenue, usage, and health metrics.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AdminStats } from '@/lib/types';

// ── Auth guard: platform admin only ──
async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { authorized: false, error: 'Unauthorized' };

  const { data } = await supabaseAdmin
    .from('users')
    .select('is_platform_admin, email')
    .eq('auth_id', user.id)
    .single();

  if (!data?.is_platform_admin) return { authorized: false, error: 'Admin access required' };
  if (data.email !== process.env.PLATFORM_ADMIN_EMAIL) return { authorized: false, error: 'Admin access blocked by ENV' };
  return { authorized: true };
}

// ═══════════════════════════════════════
// GET /api/admin/overview — Global stats
// ═══════════════════════════════════════
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 });
  }

  try {
    const [
      totalTenantsResult,
      activeTenantsResult,
      totalLeadsResult,
      totalMessagesResult,
      tenantsByPlanResult,
      recentTenantsResult,
    ] = await Promise.all([
      supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('plan_status', 'active'),
      supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('messages').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('tenants').select('plan'),
      supabaseAdmin.from('tenants').select('id, business_name, business_type, plan, plan_status, messages_used_this_month, message_limit, is_active, created_at, wa_phone_number_id').order('created_at', { ascending: false }).limit(100),
    ]);

    // Count tenants by plan
    const planCounts: Record<string, number> = {};
    (tenantsByPlanResult.data || []).forEach((t) => {
      planCounts[t.plan] = (planCounts[t.plan] || 0) + 1;
    });

    // Calculate MRR
    const PLAN_PRICES: Record<string, number> = { starter: 2499, growth: 4999, pro: 9999, enterprise: 25000 };
    let mrr = 0;
    (tenantsByPlanResult.data || []).forEach((t) => {
      mrr += PLAN_PRICES[t.plan] || 0;
    });

    const stats: AdminStats = {
      totalTenants: totalTenantsResult.count || 0,
      activeTenants: activeTenantsResult.count || 0,
      totalLeads: totalLeadsResult.count || 0,
      totalMessages: totalMessagesResult.count || 0,
      mrr,
      trialConversions: 0,
      churnRate: '0%',
      tenantsByPlan: Object.entries(planCounts).map(([plan, count]) => ({ plan, count })),
      revenueByMonth: [],
    };

    return NextResponse.json({
      success: true,
      data: { stats, tenants: recentTenantsResult.data || [] },
    });
  } catch (err) {
    console.error('❌ Admin stats error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch admin stats' }, { status: 500 });
  }
}

// ═══════════════════════════════════════
// POST /api/admin/overview — Create tenant manually
// ═══════════════════════════════════════
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { business_name, business_type, business_email, plan, bot_name } = body;

    if (!business_name) {
      return NextResponse.json({ success: false, error: 'business_name required' }, { status: 400 });
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .insert({
        business_name,
        business_type: business_type || 'Restaurant',
        business_email,
        plan: plan || 'starter',
        bot_name: bot_name || 'Assistant',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: tenant });
  } catch (err) {
    console.error('❌ Create tenant error:', err);
    return NextResponse.json({ success: false, error: 'Failed to create tenant' }, { status: 500 });
  }
}

// ═══════════════════════════════════════
// PATCH /api/admin/overview — Update tenant
// ═══════════════════════════════════════
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'tenantId required' }, { status: 400 });
    }

    const allowedFields = [
      'business_name', 'business_type', 'business_email', 'business_phone',
      'business_address', 'business_website', 'bot_name', 'bot_personality', 'is_active'
    ];
    
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No allowed fields provided for update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('❌ Update tenant error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update tenant' }, { status: 500 });
  }
}

```


## src/app/api/auth/callback/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🔐 Auth Callback — Handle OAuth Redirects
// ═══════════════════════════════════════════════════════════
// After Google/Facebook OAuth, Supabase redirects here.
// We check if the user has a tenant — if not, redirect to onboarding.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && user) {
      // Check if user has a tenant
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('tenant_id')
        .eq('auth_id', user.id)
        .single();

      if (!existingUser) {
        // New OAuth user — needs onboarding
        // Create a placeholder user record (tenant created during onboarding)
        return NextResponse.redirect(`${origin}/onboard?email=${user.email}&name=${user.user_metadata?.full_name || ''}`);
      }

      // Existing user — go to dashboard
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect to login
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}

```


## src/app/api/auth/signup/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🔐 Auth API — Signup & Tenant Creation
// ═══════════════════════════════════════════════════════════
// When a user signs up, we:
//  1. Create their Supabase Auth account
//  2. Create a new tenant (their business)
//  3. Create a user record linked to that tenant
//  4. Return the session
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_DETAILS } from '@/lib/types';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { z } from 'zod';

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  businessName: z.string().min(2, 'Business name must be at least 2 characters').max(100),
  businessType: z.string().optional(),
  plan: z.enum(['starter', 'growth', 'pro', 'enterprise']).optional()
});

// ═══════════════════════════════════════
// POST /api/auth/signup — New user + tenant
// ═══════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
    const rateLimit = await checkRedisRateLimit(`signup:${ip}`, 5, 3600); // 5 attempts per hour per IP
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: 'Too many signup attempts. Try again later.' }, { status: 429 });
    }

    let parsedBody;
    try {
      parsedBody = signupSchema.parse(await req.json());
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: e.errors?.[0]?.message || 'Invalid input data' },
        { status: 400 }
      );
    }
    const { email, password, fullName, businessName, businessType, plan } = parsedBody;

    // 1. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for now
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      return NextResponse.json(
        { success: false, error: authError.message },
        { status: 400 }
      );
    }

    const authUser = authData.user;

    // 2. Create tenant
    const selectedPlan = plan || 'starter';
    const planDetail = PLAN_DETAILS[selectedPlan as keyof typeof PLAN_DETAILS] || PLAN_DETAILS.starter;

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        business_name: businessName,
        business_type: businessType || 'Restaurant',
        business_email: email,
        bot_name: 'Assistant',
        plan: selectedPlan,
        message_limit: planDetail.messageLimit,
        ai_conversation_limit: planDetail.aiConversationLimit,
      })
      .select()
      .single();

    if (tenantError) {
      // Cleanup: delete auth user if tenant creation fails
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      throw tenantError;
    }

    // 3. Create user record
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        tenant_id: tenant.id,
        auth_id: authUser.id,
        email,
        full_name: fullName,
        role: 'owner',
        is_platform_admin: email === process.env.PLATFORM_ADMIN_EMAIL,
      });

    if (userError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      throw userError;
    }

    // 4. Log event
    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenant.id,
      event_type: 'user_signup',
      metadata: { email, plan: selectedPlan },
    });

    console.log(`🎉 New signup: ${businessName} (${email}) — ${selectedPlan} plan`);

    return NextResponse.json({
      success: true,
      data: {
        userId: authUser.id,
        tenantId: tenant.id,
        email,
        businessName,
        plan: selectedPlan,
      },
    });
  } catch (err) {
    console.error('❌ Signup error:', err);
    return NextResponse.json(
      { success: false, error: 'Signup failed. Please try again.' },
      { status: 500 }
    );
  }
}

```


## src/app/api/broadcast/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 📢 Broadcast API — Send bulk messages with rate limiting
// ═══════════════════════════════════════════════════════════
// Sends template messages to filtered lead segments.
// Rate-limited to comply with WhatsApp's throughput limits.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTemplateMessage, isWhatsAppConfigured } from '@/lib/whatsapp/service';
import { getTenantById } from '@/lib/tenant/manager';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { enqueueBroadcast } from '@/lib/broadcast/queue';
import { sleep } from '@/lib/utils/safety';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: max 5 broadcasts per hour per tenant
  const rateCheck = await checkRedisRateLimit(`broadcast:${tenantId}`, 5, 3600);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: 'Broadcast rate limit reached. Try again later.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const {
      template_name,
      language = 'en',
      filter_status,
      filter_channel,
      components = [],
    } = body;

    if (!template_name) {
      return NextResponse.json({ success: false, error: 'template_name is required' }, { status: 400 });
    }

    // Get tenant
    const tenant = await getTenantById(tenantId);
    if (!tenant || !isWhatsAppConfigured(tenant)) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp not connected. Connect first.' },
        { status: 400 }
      );
    }

    // Build lead query
    let query = supabaseAdmin
      .from('leads')
      .select('id, name, phone')
      .eq('tenant_id', tenantId)
      .not('phone', 'is', null);

    if (filter_status) {
      if (Array.isArray(filter_status)) {
        query = query.in('lead_status', filter_status);
      } else {
        query = query.eq('lead_status', filter_status);
      }
    }

    if (filter_channel) {
      query = query.eq('channel', filter_channel);
    }

    const { data: leads, error: leadErr } = await query.limit(1000);

    if (leadErr) throw new Error(leadErr.message);
    if (!leads || leads.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No leads match the selected filters.' },
        { status: 400 }
      );
    }

    // Create broadcast record
    const broadcastId = crypto.randomUUID();
    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenantId,
      event_type: 'broadcast_started',
      channel: 'whatsapp',
      metadata: {
        broadcast_id: broadcastId,
        template_name,
        total_recipients: leads.length,
        filter_status,
        filter_channel,
      },
    });

    // Send messages via BullMQ queue to avoid Vercel timeouts
    await enqueueBroadcast({
      tenantId,
      templateName: template_name,
      language,
      broadcastId,
      leads: leads as { id: string; name: string; phone: string }[],
      components,
    });

    return NextResponse.json({
      success: true,
      data: {
        broadcast_id: broadcastId,
        template_name: template_name,
        total: leads.length,
        status: 'enqueued',
      },
    });
  } catch (error) {
    console.error('❌ Broadcast error:', error);
    return NextResponse.json(
      { success: false, error: 'Broadcast failed. Please try again.' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════
// GET: Get broadcast-eligible lead counts
// ═══════════════════════════════════════
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [allLeads, byStatus, byChannel] = await Promise.all([
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('phone', 'is', null),
      supabaseAdmin
        .from('leads')
        .select('lead_status')
        .eq('tenant_id', tenantId)
        .not('phone', 'is', null),
      supabaseAdmin
        .from('leads')
        .select('channel')
        .eq('tenant_id', tenantId)
        .not('phone', 'is', null),
    ]);

    // Count by status
    const statusCounts: Record<string, number> = {};
    (byStatus.data || []).forEach((l) => {
      statusCounts[l.lead_status] = (statusCounts[l.lead_status] || 0) + 1;
    });

    // Count by channel
    const channelCounts: Record<string, number> = {};
    (byChannel.data || []).forEach((l) => {
      channelCounts[l.channel] = (channelCounts[l.channel] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      data: {
        total: allLeads.count || 0,
        byStatus: statusCounts,
        byChannel: channelCounts,
      },
    });
  } catch (error) {
    console.error('❌ Broadcast stats error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}

```


## src/app/api/cron/instagram-refresh/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import axios from 'axios';
import { decryptToken, encryptToken } from '@/lib/utils/crypto';

export async function GET(req: NextRequest) {
  // Simple auth to prevent unauthorized triggers
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch all tenants with active IG configurations
    const { data: tenants, error } = await supabaseAdmin
      .from('tenants')
      .select('id, ig_access_token')
      .not('ig_access_token', 'is', null)
      .eq('is_active', true);

    if (error) throw error;
    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ success: true, message: 'No active IG tokens to refresh' });
    }

    let refreshed = 0;
    let failed = 0;

    // Refresh each token
    for (const tenant of tenants) {
      try {
        const response = await axios.get('https://graph.instagram.com/refresh_access_token', {
          params: {
            grant_type: 'ig_refresh_token',
            access_token: decryptToken(tenant.ig_access_token),
          },
        });

        const newToken = response.data.access_token;
        
        if (newToken) {
          await supabaseAdmin
            .from('tenants')
            .update({ ig_access_token: encryptToken(newToken) })
            .eq('id', tenant.id);
          refreshed++;
        }
      } catch (err) {
        console.error(`❌ Failed to refresh IG token for tenant ${tenant.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'IG Token refresh complete',
      stats: { refreshed, failed, total: tenants.length }
    });

  } catch (error) {
    console.error('❌ IG Token Cron Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

```


## src/app/api/cron/timeout/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// ⏰ Cron: Conversation Timeout + Follow-Up Processing
// ═══════════════════════════════════════════════════════════
// Called by Vercel Cron or external cron service every minute.
// 1. Times out stale conversations (24h+ inactive)
// 2. Processes pending follow-ups (fallback when BullMQ unavailable)
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { processPendingFollowUps } from '@/lib/followup/engine';

// Verify cron secret to prevent unauthorized calls
function verifyCronSecret(req: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error('CRON_SECRET is not set — rejecting request');
    return false;
  }
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  return secret === expectedSecret;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    timedOutConversations: 0,
    followUpsSent: 0,
    errors: [] as string[],
  };

  try {
    // ── 1. Timeout stale conversations ──
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: staleConvs, error: staleErr } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('is_active', true)
      .lt('last_message_at', twentyFourHoursAgo)
      .limit(100);

    if (staleErr) {
      results.errors.push(`Stale query error: ${staleErr.message}`);
    } else if (staleConvs && staleConvs.length > 0) {
      const ids = staleConvs.map((c) => c.id);

      const { error: updateErr } = await supabaseAdmin
        .from('conversations')
        .update({ is_active: false, current_step: 'timed_out' })
        .in('id', ids);

      if (updateErr) {
        results.errors.push(`Timeout update error: ${updateErr.message}`);
      } else {
        results.timedOutConversations = ids.length;
      }
    }

    // ── 2. Process pending follow-ups ──
    try {
      results.followUpsSent = await processPendingFollowUps();
    } catch (err) {
      results.errors.push(`Follow-ups error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }

    console.log(`⏰ Cron: ${results.timedOutConversations} timed out, ${results.followUpsSent} follow-ups sent`);

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Cron error:', error);
    return NextResponse.json(
      { success: false, error: 'Cron job failed' },
      { status: 500 }
    );
  }
}

```


## src/app/api/dashboard/billing/route.ts
```ts
import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRazorpay } from '@/lib/billing/razorpay';

export async function GET() {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('plan, plan_status, razorpay_subscription_id')
      .eq('id', tenantId)
      .single();

    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    if (!tenant.razorpay_subscription_id) {
      return NextResponse.json({ success: true, data: { plan: tenant.plan, status: tenant.plan_status, invoices: [] } });
    }

    const subscription = await getRazorpay().subscriptions.fetch(tenant.razorpay_subscription_id);
    const invoices = await getRazorpay().invoices.all({ subscription_id: tenant.razorpay_subscription_id });

    return NextResponse.json({
      success: true,
      data: {
        plan: tenant.plan,
        status: tenant.plan_status,
        next_billing_date: subscription.charge_at ? new Date(subscription.charge_at * 1000).toISOString() : null,
        invoices: invoices.items.map(inv => ({
          id: inv.id,
          amount: (inv.amount as number) / 100,
          status: inv.status,
          date: new Date((inv.issued_at as number) * 1000).toISOString(),
          pdf_url: inv.short_url
        }))
      }
    });
  } catch (error: any) {
    console.error('Billing fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

```


## src/app/api/dashboard/conversations/[id]/pause/route.ts
```ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const bot_paused = Boolean(body.bot_paused);

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase.from('users').select('tenant_id').eq('auth_id', user.id).single();
    if (!userData?.tenant_id) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // Verify conversation belongs to tenant
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', userData.tenant_id)
      .single();

    if (!conv) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    // Update the bot_paused flag
    await supabaseAdmin
      .from('conversations')
      .update({ bot_paused })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

```


## src/app/api/dashboard/conversations/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 💬 Conversations API — Dashboard Data
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const activeOnly = searchParams.get('active') !== 'false';

  try {
    let query = supabaseAdmin
      .from('conversations')
      .select('id, sender_name, sender_id, current_step, is_active, escalated, last_message_at, channel, message_count')
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: false })
      .limit(limit);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('❌ Conversations fetch error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch conversations' }, { status: 500 });
  }
}

```


## src/app/api/dashboard/leads/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 👤 Leads API — Tenant-Scoped CRUD
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { cancelLeadFollowUps } from '@/lib/followup/engine';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50');
  const page = parseInt(searchParams.get('page') || '1');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('lead_status', status);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    data,
    total: count || 0,
    page,
    limit,
    hasMore: (count || 0) > offset + limit,
  });
}

// PATCH /api/dashboard/leads — Update lead status
export async function PATCH(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { leadId, status, notes, staff_assigned } = body;

  if (!leadId) return NextResponse.json({ success: false, error: 'leadId required' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const updates: Record<string, unknown> = {};

  if (status) {
    const validStatuses = ['new', 'hot', 'warm', 'cold', 'converted', 'lost'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }
    updates.lead_status = status;

    // Cancel follow-ups if converted or lost
    if (status === 'converted' || status === 'lost') {
      await cancelLeadFollowUps(leadId);
      if (status === 'converted') updates.converted_at = new Date().toISOString();
    }
  }

  if (notes !== undefined) updates.notes = notes;
  if (staff_assigned !== undefined) updates.staff_assigned = staff_assigned;

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', leadId)
    .eq('tenant_id', tenantId) // Ensure tenant isolation
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data });
}

```


## src/app/api/dashboard/settings/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// ⚙️ Settings API — Save Bot Configuration to Supabase
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateCache } from '@/lib/tenant/manager';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select(`
      business_name, business_type, business_phone, business_address,
      business_website, business_email, bot_name, bot_personality,
      welcome_message, welcome_offer, usps, working_hours,
      staff_phone, staff_name, manager_phone,
      followup_30min, followup_3hr, followup_24hr, followup_7day,
      escalation_timeout_mins, hot_keywords, warm_keywords,
      custom_faqs, off_hours_message, off_hours_capture_lead
    `)
    .eq('id', tenantId)
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

// PATCH /api/dashboard/settings — Update settings
export async function PATCH(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  // Whitelist allowed fields to prevent updating sensitive data
  const allowedFields = [
    'business_name', 'business_type', 'business_phone', 'business_address',
    'business_website', 'business_email', 'bot_name', 'bot_personality',
    'welcome_message', 'welcome_offer', 'usps', 'working_hours',
    'staff_phone', 'staff_name', 'manager_phone',
    'followup_30min', 'followup_3hr', 'followup_24hr', 'followup_7day',
    'escalation_timeout_mins', 'hot_keywords', 'warm_keywords',
    'custom_faqs', 'off_hours_message', 'off_hours_capture_lead',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update(updates)
    .eq('id', tenantId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Invalidate cached tenant config so changes take effect immediately
  await invalidateCache(tenantId);

  return NextResponse.json({ success: true, data });
}

```


## src/app/api/dashboard/stats/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 📊 Client Dashboard API — Tenant-Scoped
// ═══════════════════════════════════════════════════════════
// All routes require authentication and return only data
// belonging to the authenticated user's tenant.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResponse, DashboardStats } from '@/lib/types';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { getTenantId } from '@/lib/auth/getTenantId';

// Helper: Get tenant_id from authenticated user
export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const rateLimit = await checkRedisRateLimit(`stats:${tenantId}`, 60, 60); // 60 requests per minute
  if (!rateLimit.allowed) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  try {
    // Parallel queries for speed
    const [
      totalLeadsResult,
      newTodayResult,
      activeConvResult,
      confirmedBookingsResult,
      messagesResult,
      leadsByStatusResult,
      leadsByChannelResult,
      tenantResult,
      leadsDataResult,
      messagesDataResult,
    ] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', weekAgo),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', todayStart),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'confirmed'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', weekAgo),
      supabase.from('leads').select('lead_status').eq('tenant_id', tenantId),
      supabase.from('leads').select('channel').eq('tenant_id', tenantId).gte('created_at', weekAgo),
      supabase.from('tenants').select('messages_used_this_month, message_limit').eq('id', tenantId).single(),
      supabase.from('leads').select('created_at').eq('tenant_id', tenantId).gte('created_at', weekAgo),
      supabase.from('messages').select('created_at').eq('tenant_id', tenantId).gte('created_at', weekAgo),
    ]);

    // Aggregate leads by status
    const statusCounts: Record<string, number> = {};
    (leadsByStatusResult.data || []).forEach((l) => {
      statusCounts[l.lead_status] = (statusCounts[l.lead_status] || 0) + 1;
    });

    // Aggregate leads by channel
    const channelCounts: Record<string, number> = {};
    (leadsByChannelResult.data || []).forEach((l) => {
      channelCounts[l.channel] = (channelCounts[l.channel] || 0) + 1;
    });

    // Compute Daily Leads
    const dailyLeadsMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dailyLeadsMap[d.toISOString().split('T')[0]] = 0;
    }
    (leadsDataResult.data || []).forEach((l) => {
      const date = l.created_at.split('T')[0];
      if (dailyLeadsMap[date] !== undefined) dailyLeadsMap[date]++;
    });
    const dailyLeads = Object.entries(dailyLeadsMap).map(([date, count]) => ({ date, count }));

    // Compute Peak Hour
    const hourCounts: Record<number, number> = {};
    (messagesDataResult.data || []).forEach((m) => {
      const h = new Date(m.created_at).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    let peakHour = 'N/A';
    if (Object.keys(hourCounts).length > 0) {
      const topHour = parseInt(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0]);
      peakHour = `${topHour}:00 - ${topHour + 1}:00`;
    }

    const stats: DashboardStats = {
      totalLeads: totalLeadsResult.count || 0,
      newLeadsToday: newTodayResult.count || 0,
      activeConversations: activeConvResult.count || 0,
      confirmedBookings: confirmedBookingsResult.count || 0,
      conversionRate: totalLeadsResult.count
        ? `${(((confirmedBookingsResult.count || 0) / totalLeadsResult.count) * 100).toFixed(1)}%`
        : '0%',
      messagesThisMonth: tenantResult.data?.messages_used_this_month || 0,
      messageLimit: tenantResult.data?.message_limit || 1000,
      topChannel: Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
      peakHour,
      leadsByStatus: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
      leadsByChannel: Object.entries(channelCounts).map(([channel, count]) => ({ channel, count })),
      dailyLeads,
    };

    return NextResponse.json({ success: true, data: stats } as ApiResponse<DashboardStats>);
  } catch (err) {
    console.error('❌ Stats error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}

```


## src/app/api/dashboard/templates/route.ts
```ts
import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { decryptToken } from '@/lib/utils/crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import axios from 'axios';

export async function GET() {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_business_account_id, wa_access_token')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_business_account_id || !tenant?.wa_access_token) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });
    }

    const waToken = decryptToken(tenant.wa_access_token);
    const url = `https://graph.facebook.com/v21.0/${tenant.wa_business_account_id}/message_templates`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${waToken}` }
    });

    return NextResponse.json({ success: true, data: data.data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_business_account_id, wa_access_token')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_business_account_id || !tenant?.wa_access_token) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 });
    }

    const body = await request.json();
    const url = `https://graph.facebook.com/v21.0/${tenant.wa_business_account_id}/message_templates`;
    
    const { data } = await axios.post(url, body, {
      headers: { 
        Authorization: `Bearer ${decryptToken(tenant.wa_access_token)}`,
        'Content-Type': 'application/json'
      }
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    const message = error.response?.data?.error?.message || error.message;
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

```


## src/app/api/data-deletion/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🗑️ Data Deletion Callback — Required for Meta App Review
// ═══════════════════════════════════════════════════════════
// Meta requires a data deletion callback URL for apps that
// use Facebook Login / WhatsApp Business API.
// This endpoint accepts Meta's POST request, logs it, and
// returns the required JSON format.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

interface DataDeletionRequest {
  signed_request: string;
}

interface DecodedPayload {
  user_id: string;
  algorithm: string;
  issued_at: number;
}

function parseSignedRequest(signedRequest: string, appSecret: string): DecodedPayload | null {
  try {
    const [encodedSig, payload] = signedRequest.split('.');

    // Decode the payload
    const decodedPayload = JSON.parse(
      Buffer.from(payload, 'base64').toString('utf-8')
    ) as DecodedPayload;

    // Verify the signature
    if (appSecret) {
      const expectedSig = crypto
        .createHmac('sha256', appSecret)
        .update(payload)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      if (encodedSig !== expectedSig) {
        console.warn('⚠️ Data deletion: Invalid signature');
        if (process.env.NODE_ENV === 'production') {
          return null; // Still process in development, fail in production
        }
      }
    }

    return decodedPayload;
  } catch (error) {
    console.error('❌ Failed to parse signed_request:', error);
    return null;
  }
}

// POST /api/data-deletion
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as DataDeletionRequest;
    const signedRequest = body.signed_request;

    if (!signedRequest) {
      return NextResponse.json(
        { error: 'Missing signed_request' },
        { status: 400 }
      );
    }

    const appSecret = process.env.META_APP_SECRET || '';
    const payload = parseSignedRequest(signedRequest, appSecret);

    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid signed_request' },
        { status: 400 }
      );
    }

    const userId = payload.user_id;

    // Generate a unique confirmation code for this deletion request
    const confirmationCode = crypto.randomBytes(16).toString('hex');

    // Log the deletion request
    console.log(`🗑️ Data deletion request received for user: ${userId}`);
    console.log(`   Confirmation code: ${confirmationCode}`);
    console.log(`   Issued at: ${new Date(payload.issued_at * 1000).toISOString()}`);

    // Actually delete user data:
    const { data: tenants } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('wa_business_account_id', userId); 
      
    if (tenants && tenants.length > 0) {
      const tenantIds = tenants.map((t: {id: string}) => t.id);
      await supabaseAdmin.from('leads').delete().in('tenant_id', tenantIds);
      await supabaseAdmin.from('conversations').delete().in('tenant_id', tenantIds);
      await supabaseAdmin.from('messages').delete().in('tenant_id', tenantIds);
      await supabaseAdmin.from('follow_ups').delete().in('tenant_id', tenantIds);
      await supabaseAdmin.from('analytics_events').delete().in('tenant_id', tenantIds);
      await supabaseAdmin.from('users').delete().in('tenant_id', tenantIds);
      await supabaseAdmin.from('tenants').delete().in('id', tenantIds);
      
      console.log(`✅ Fully eradicated data for ${tenantIds.length} tenants (GDPR compliance)`);
    }

    // Return the required JSON format
    // Meta expects: { url, confirmation_code }
    const statusUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.com'}/api/data-deletion/status?code=${confirmationCode}`;

    return NextResponse.json({
      url: statusUrl,
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    console.error('❌ Data deletion callback error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/data-deletion — Status check page
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.json({
      status: 'error',
      message: 'No confirmation code provided',
    }, { status: 400 });
  }

  // In production, look up the deletion request by confirmation code
  // and return its status
  return NextResponse.json({
    status: 'completed',
    confirmation_code: code,
    message: 'Your data has been deleted successfully. This process is irreversible.',
  });
}

```


## src/app/api/health/route.ts
```ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRedisClient } from '@/lib/redis/client';

export async function GET() {
  const status: Record<string, 'up' | 'down'> = { db: 'down', redis: 'down' };
  
  try {
    const { data, error } = await supabaseAdmin.from('tenants').select('id').limit(1);
    if (!error) status.db = 'up';
  } catch {
    status.db = 'down';
  }

  try {
    const redis = getRedisClient();
    if (redis) {
      const ping = await redis.ping();
      if (ping === 'PONG') status.redis = 'up';
    }
  } catch {
    status.redis = 'down';
  }

  const isHealthy = status.db === 'up' && status.redis === 'up';
  
  return NextResponse.json(
    { status: isHealthy ? 'healthy' : 'unhealthy', details: status },
    { status: isHealthy ? 200 : 503 }
  );
}

```


## src/app/api/onboard/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🚀 Onboard API — Create Tenant for OAuth Users
// ═══════════════════════════════════════════════════════════
// When a user signs up via Google OAuth, they don't have a
// tenant yet. This route creates the tenant and user record.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_DETAILS } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user already exists in the users table
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('auth_id', user.id)
      .single();

    if (existingUser) {
      return NextResponse.json({ success: true, tenantId: existingUser.tenant_id, message: 'Already onboarded' });
    }

    const body = await req.json();
    const { businessName, businessType, plan } = body;

    if (!businessName) {
      return NextResponse.json({ success: false, error: 'businessName is required' }, { status: 400 });
    }

    const selectedPlan = plan || 'starter';
    const planDetail = PLAN_DETAILS[selectedPlan as keyof typeof PLAN_DETAILS] || PLAN_DETAILS.starter;

    // 1. Create tenant
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        business_name: businessName,
        business_type: businessType || 'Restaurant',
        business_email: user.email,
        bot_name: 'Assistant',
        plan: selectedPlan,
        message_limit: planDetail.messageLimit,
        ai_conversation_limit: planDetail.aiConversationLimit,
      })
      .select()
      .single();

    if (tenantError) {
      throw tenantError;
    }

    // 2. Create user record
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        tenant_id: tenant.id,
        auth_id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || 'User',
        role: 'owner',
        is_platform_admin: user.email === process.env.PLATFORM_ADMIN_EMAIL,
      });

    if (userError) {
      // Rollback tenant creation
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
      throw userError;
    }

    // 3. Log event
    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenant.id,
      event_type: 'user_onboarded',
      metadata: { email: user.email, plan: selectedPlan },
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        tenantId: tenant.id,
      },
    });
  } catch (err) {
    console.error('❌ Onboard error:', err);
    return NextResponse.json(
      { success: false, error: 'Onboarding failed' },
      { status: 500 }
    );
  }
}

```


## src/app/api/webhooks/instagram/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🔗 Instagram Webhook — Multi-Tenant Dispatcher
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { isDuplicateMessage, checkRedisRateLimit } from '@/lib/redis/client';
import { enqueueIGWebhookMessage } from '@/lib/webhook/queue';
import { verifySignature } from '@/lib/whatsapp/service';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.GLOBAL_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
    const rateLimit = await checkRedisRateLimit(`webhook:ig:${ip}`, 2000, 60);
    if (!rateLimit.allowed) {
      console.warn(`❌ Instagram webhook rate limit exceeded for IP: ${ip}`);
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > 2 * 1024 * 1024) { // 2MB hard limit
      console.warn(`❌ Webhook payload too large: ${contentLength} bytes`);
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');

    if (!signature && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const appSecret = process.env.META_APP_SECRET || '';
    if (signature && appSecret) {
      if (!verifySignature(rawBody, signature, appSecret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);
    
    if (body.object === 'instagram') {
      for (const entry of body.entry) {
        const igPageId = entry.id;

        for (const messagingItem of entry.messaging) {
          if (!messagingItem.message || !messagingItem.message.text) continue;

          const senderId = messagingItem.sender.id;
          const messageText = messagingItem.message.text;
          const messageId = messagingItem.message.mid;
            
          // Deduplication
          const duplicate = await isDuplicateMessage(messageId);
          if (duplicate) {
            console.log(`⏩ Duplicate IG message skipped: ${messageId}`);
            continue;
          }

          enqueueIGWebhookMessage({ igPageId, senderId, messageText, messageId }).catch((err) => {
            console.error(`❌ Failed to enqueue IG message from ${senderId}:`, err);
          });
        }
      }
    }
  } catch (error) {
    console.error('❌ IG Webhook Error:', error);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}

// Handlers imported from webhook queue

```


## src/app/api/webhooks/razorpay/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 💳 Razorpay Webhook Route
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyWebhookSignature, handleRazorpayWebhook } from '@/lib/billing/razorpay';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';

    // Verify signature
    if (process.env.RAZORPAY_WEBHOOK_SECRET && !verifyWebhookSignature(rawBody, signature)) {
      console.warn('❌ Razorpay webhook: invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const body = JSON.parse(rawBody);
    const event = body.event as string;
    const payload = body.payload as Record<string, any>;

    // Idempotency Check
    const subscriptionId = payload?.subscription?.entity?.id || payload?.payment?.entity?.id;
    if (subscriptionId) {
      const { data: existing } = await supabaseAdmin.from('analytics_events')
        .select('id')
        .eq('event_type', `billing_${event}`)
        .eq('metadata->>subscription_id', subscriptionId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .single();
        
      if (existing) {
        console.log(`⏩ Razorpay webhook: Idempotent skip for ${event} (${subscriptionId})`);
        return NextResponse.json({ status: 'ok', idempotent: true });
      }
    }

    console.log(`💳 Razorpay webhook: ${event}`);

    await handleRazorpayWebhook(event, payload);

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Razorpay webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

```


## src/app/api/webhooks/whatsapp/route.ts
```ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { parseWebhookPayload, verifySignature } from '@/lib/whatsapp/service';
import { isDuplicateMessage } from '@/lib/redis/client';
import { enqueueWebhookMessage } from '@/lib/webhook/queue';
import { checkRedisRateLimit } from '@/lib/redis/client';

export const maxDuration = 60;
import * as Sentry from '@sentry/nextjs';

// ═══════════════════════════════════════
// GET: Webhook Verification
// ═══════════════════════════════════════
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, wa_verify_token')
      .eq('wa_verify_token', token)
      .single();

    if (tenant) {
      console.log(`✅ Webhook verified for tenant ${tenant.id}`);
      await supabaseAdmin
        .from('tenants')
        .update({ wa_webhook_verified: true })
        .eq('id', tenant.id);
      return new NextResponse(challenge, { status: 200 });
    }

    if (token === process.env.GLOBAL_WEBHOOK_VERIFY_TOKEN) {
      console.log('✅ Webhook verified (global token)');
      return new NextResponse(challenge, { status: 200 });
    }
  }

  console.warn('❌ Webhook verification failed');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ═══════════════════════════════════════
// POST: Incoming Messages
// ═══════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
    const rateLimit = await checkRedisRateLimit(`webhook:wa:${ip}`, 2000, 60); // 2000 per minute per IP for Meta
    if (!rateLimit.allowed) {
      console.warn(`❌ Webhook rate limit exceeded for IP: ${ip}`);
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > 2 * 1024 * 1024) { // 2MB hard limit
      console.warn(`❌ Webhook payload too large: ${contentLength} bytes`);
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');

    if (!signature && process.env.NODE_ENV === 'production') {
      console.warn('❌ Missing webhook signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const messages = parseWebhookPayload(body);

    const appSecret = process.env.META_APP_SECRET;
    if (appSecret && signature) {
      if (!verifySignature(rawBody, signature, appSecret)) {
        console.warn('❌ Invalid webhook signature — rejecting');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else if (!signature && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    for (const msg of messages) {
      if (msg.isStatusUpdate) {
        console.log(`📋 [${msg.phoneNumberId}] Status: ${msg.status} for ${msg.recipientId}`);
        continue;
      }
      if (msg.isReaction) continue;
      if (!msg.text && !msg.buttonReplyId && !msg.listReplyId) continue;

      // ── Redis-backed deduplication ──
      const duplicate = await isDuplicateMessage(msg.messageId);
      if (duplicate) {
        console.log(`⏩ Duplicate message skipped: ${msg.messageId}`);
        continue;
      }

      // ── Enqueue to BullMQ worker (Decoupled from 200 OK) ──
      enqueueWebhookMessage(msg).catch((err) => {
        console.error(`❌ Failed to enqueue message from ${msg.from}:`, err);
        Sentry.captureException(err);
      });
    }
  } catch (error) {
    console.error('❌ Webhook parse error:', error);
    Sentry.captureException(error);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}

```


## src/app/api/whatsapp/connect/route.ts
```ts
// ═══════════════════════════════════════════════════════════
// 📱 WhatsApp Connect API — Embedded Signup Token Handler
// ═══════════════════════════════════════════════════════════
// Receives the OAuth code from Meta's Embedded Signup flow,
// exchanges it for a permanent access token, then saves
// the WhatsApp credentials to the tenant in Supabase.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateCache } from '@/lib/tenant/manager';
import axios from 'axios';
import { encryptToken } from '@/lib/utils/crypto';
import { getTenantId } from '@/lib/auth/getTenantId';

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { code, phone_number_id, waba_id, manual = false } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Missing OAuth code from Embedded Signup' },
        { status: 400 }
      );
    }

    // Step 1: Exchange short-lived code for a long-lived access token
    let accessToken: string;

    if (manual && phone_number_id) {
      // Manual mode: caller passes the token directly, skip OAuth exchange
      accessToken = code;
    } else {
      // Embedded Signup flow: exchange the short-lived OAuth code
      try {
        const tokenRes = await axios.get(`${META_GRAPH_URL}/oauth/access_token`, {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: META_APP_ID,
            client_secret: META_APP_SECRET,
            fb_exchange_token: code,
          },
          timeout: 15000,
        });
        accessToken = tokenRes.data.access_token;
        if (!accessToken) throw new Error('No access_token in response');
      } catch (tokenErr) {
        console.error('❌ Token exchange failed:', tokenErr);
        return NextResponse.json(
          { success: false, error: 'Failed to exchange OAuth code. Please try again.' },
          { status: 400 }
        );
      }
    }

    // Step 2: If phone_number_id wasn't provided, look it up from WABA
    let phoneNumberId = phone_number_id;

    let validPhone = false;
    if (waba_id) {
      try {
        const phonesRes = await axios.get(
          `${META_GRAPH_URL}/${waba_id}/phone_numbers`,
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
        );

        const phones = phonesRes.data.data || [];
        if (!phoneNumberId && phones.length > 0) {
          phoneNumberId = phones[0].id;
        }

        // Verify the provided phoneNumberId belongs to this WABA
        if (phoneNumberId && phones.some((p: any) => p.id === phoneNumberId)) {
          validPhone = true;
        }
      } catch (phoneErr) {
        console.error('⚠️ Could not fetch phone numbers:', phoneErr);
      }
    } else if (phoneNumberId) {
      validPhone = true;
    }

    if (!phoneNumberId || !validPhone) {
      return NextResponse.json(
        { success: false, error: 'Invalid phone number or it does not belong to the provided Business Account.' },
        { status: 400 }
      );
    }

    // Step 3: Fetch the display phone number for verification
    let displayPhone = '';
    try {
      const phoneRes = await axios.get(
        `${META_GRAPH_URL}/${phoneNumberId}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
      );
      displayPhone = phoneRes.data.display_phone_number || '';
    } catch {
      // Non-critical
    }

    // Step 4: Register the phone for Cloud API messaging
    const waPin = process.env.WA_CLOUD_API_PIN;
    if (!waPin) {
      console.error('❌ WA_CLOUD_API_PIN is not set. Phone registration skipped.');
    } else {
      try {
        await axios.post(
          `${META_GRAPH_URL}/${phoneNumberId}/register`,
          { messaging_product: 'whatsapp', pin: waPin },
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
        );
        console.log(`✅ Phone ${phoneNumberId} registered for Cloud API`);
      } catch (regErr) {
        console.warn('⚠️ Phone registration step failed (may already be registered):', regErr);
      }
    }

    // Step 5: Subscribe the WABA to webhooks
    if (waba_id) {
      try {
        await axios.post(
          `${META_GRAPH_URL}/${waba_id}/subscribed_apps`,
          {},
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
        );
        console.log(`✅ WABA ${waba_id} subscribed to webhooks`);
      } catch (subErr) {
        console.warn('⚠️ Webhook subscription failed:', subErr);
      }
    }

    // Step 6: Save credentials to Supabase
    const { data: tenant, error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        wa_phone_number_id: phoneNumberId,
        wa_access_token: encryptToken(accessToken),
        wa_business_account_id: waba_id || null,
        wa_webhook_verified: false,
        onboarding_completed: true,
      })
      .eq('id', tenantId)
      .select('id, business_name, wa_phone_number_id')
      .single();

    if (updateErr) {
      throw new Error(`Supabase update failed: ${updateErr.message}`);
    }

    // Invalidate cache so new credentials take effect immediately
    invalidateCache(tenantId);

    // Log analytics
    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenantId,
      event_type: 'whatsapp_connected',
      channel: 'whatsapp',
      metadata: {
        phone_number_id: phoneNumberId,
        display_phone: displayPhone,
        waba_id: waba_id,
      },
    });

    console.log(`✅ [${tenant?.business_name}] WhatsApp connected: ${phoneNumberId} (${displayPhone})`);

    return NextResponse.json({
      success: true,
      data: {
        phone_number_id: phoneNumberId,
        display_phone: displayPhone,
        waba_id: waba_id,
      },
    });
  } catch (error) {
    console.error('❌ WhatsApp connect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to connect WhatsApp. Please try again.' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════
// GET: Check current connection status
// ═══════════════════════════════════════
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('wa_phone_number_id, wa_business_account_id, wa_webhook_verified, onboarding_completed')
    .eq('id', tenantId)
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: {
      connected: !!(data?.wa_phone_number_id),
      phone_number_id: data?.wa_phone_number_id,
      waba_id: data?.wa_business_account_id,
      webhook_verified: data?.wa_webhook_verified,
      onboarding_completed: data?.onboarding_completed,
    },
  });
}

```


## src/app/dashboard/analytics/page.tsx
```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell 
} from "recharts";

// ═══════════════════════════════════════
// 📈 Analytics Dashboard
// ═══════════════════════════════════════

interface DashboardStats {
  totalLeads: number;
  newLeadsToday: number;
  activeConversations: number;
  confirmedBookings: number;
  conversionRate: string;
  messagesThisMonth: number;
  messageLimit: number;
  topChannel: string;
  peakHour: string;
  leadsByStatus: { status: string; count: number }[];
  leadsByChannel: { channel: string; count: number }[];
  dailyLeads: { date: string; count: number }[];
}

const COLORS = ["#6C5CE7", "#00B894", "#FDCB6E", "#E17055", "#00CEC9", "#A29BFE"];

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !stats) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", color: "var(--text-muted)" }}>
        <span style={{ fontSize: "1.5rem", marginRight: "10px", animation: "pulse 1.5s infinite" }}>⏳</span> Loading Analytics...
      </div>
    );
  }

  // Format Daily Leads Data
  const dailyLeadsData = (stats?.dailyLeads || []).map(d => ({
    name: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    leads: d.count
  })).reverse(); // Oldest to newest if they came in newest to oldest? Wait, stats API created them ascending implicitly by how we looped it. Actually let's assume they are correct. Wait, API loops from i=6 to 0, which is oldest to newest. Good.

  // Format Leads by Status
  const statusData = (stats?.leadsByStatus || []).map((s, i) => ({
    name: s.status.toUpperCase(),
    value: s.count,
    color: COLORS[i % COLORS.length]
  }));

  // Format Leads by Channel
  const channelData = (stats?.leadsByChannel || []).map((c, i) => ({
    name: c.channel,
    value: c.count,
    color: COLORS[(i + 2) % COLORS.length] // offset colors
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{
        width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)",
        padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
      }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Project Bolt</span>
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📈", label: "Analytics", href: "/dashboard/analytics", active: true },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 50 }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>📈 Analytics</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Monitor your lead generation and engagement trends.</p>
          </div>
          <button onClick={fetchData} style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.85rem" }}>
            🔄 Refresh Data
          </button>
        </header>

        <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
          {error && <div style={{ color: "#E17055", background: "rgba(225,112,85,0.1)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(225,112,85,0.3)" }}>❌ {error}</div>}

          {/* Top Key Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
            <div className="glass-card" style={{ padding: "1.5rem", borderTop: "3px solid #6C5CE7" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>Conversion Rate</p>
              <p style={{ fontSize: "2rem", fontWeight: 800, color: "#6C5CE7" }}>{stats?.conversionRate || "0%"}</p>
            </div>
            <div className="glass-card" style={{ padding: "1.5rem", borderTop: "3px solid #00B894" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>Peak Engagement Hour</p>
              <p style={{ fontSize: "2rem", fontWeight: 800, color: "#00B894" }}>{stats?.peakHour || "N/A"}</p>
            </div>
            <div className="glass-card" style={{ padding: "1.5rem", borderTop: "3px solid #FDCB6E" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>Active Conversations</p>
              <p style={{ fontSize: "2rem", fontWeight: 800, color: "#FDCB6E" }}>{stats?.activeConversations || 0}</p>
            </div>
          </div>

          {/* Main Charts Area */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "2rem" }}>
            
            {/* Daily Leads Trend */}
            <div className="glass-card" style={{ padding: "2rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>Daily Lead Volume (Last 7 Days)</h2>
              <div style={{ height: "300px", width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyLeadsData}>
                    <defs>
                      <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6C5CE7" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#6C5CE7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}
                      itemStyle={{ color: "#6C5CE7", fontWeight: 700 }}
                    />
                    <Area type="monotone" dataKey="leads" stroke="#6C5CE7" strokeWidth={3} fillOpacity={1} fill="url(#colorLeads)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Leads by Status */}
            <div className="glass-card" style={{ padding: "2rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>Lead Status Breakdown</h2>
              {statusData.length > 0 ? (
                <div style={{ height: "300px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Legend */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center", marginTop: "1rem" }}>
                    {statusData.map((entry, index) => (
                      <div key={index} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: entry.color }} />
                        {entry.name} ({entry.value})
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ height: "300px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                  No lead data available yet
                </div>
              )}
            </div>

          </div>

          {/* Bottom Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
            
            {/* Lead Sources / Channels */}
            <div className="glass-card" style={{ padding: "2rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>Lead Sources (Channels)</h2>
              {channelData.length > 0 ? (
                <div style={{ height: "250px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelData} layout="vertical" margin={{ top: 0, right: 0, left: 20, bottom: 0 }}>
                      <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" stroke="var(--text-primary)" fontSize={12} tickLine={false} axisLine={false} width={80} />
                      <Tooltip 
                        contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)" }}
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                        {channelData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height: "250px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                  No channel data available yet
                </div>
              )}
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}

```


## src/app/dashboard/billing/page.tsx
```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function BillingPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/stats").then(res => res.json()),
      fetch("/api/dashboard/billing").then(res => res.json())
    ]).then(([statsRes, billingRes]) => {
      setTenant({
        plan_type: billingRes.data?.plan || "starter",
        plan_status: billingRes.data?.status || "active",
        message_limit: statsRes.data?.messageLimit || 1000,
        messages_used: statsRes.data?.messagesThisMonth || 0,
        invoices: billingRes.data?.invoices || []
      });
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{ width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Project Bolt</span>
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "👥", label: "Leads", href: "/dashboard/leads" },
            { icon: "💬", label: "Conversations", href: "/dashboard/conversations" },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📈", label: "Analytics", href: "/dashboard/analytics" },
            { icon: "💳", label: "Billing", href: "/dashboard/billing", active: true },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>💳 Billing & Usage</h1>
        <div className="glass-card" style={{ padding: "2rem", maxWidth: "800px" }}>
          {loading ? (
             <p>Loading billing info...</p>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Current Plan: <span style={{ textTransform: "capitalize", color: "var(--primary)" }}>{tenant?.plan_type}</span></h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Status: <span style={{ color: "#00B894", fontWeight: 600 }}>{tenant?.plan_status}</span></p>
                </div>
                <button className="btn btn-primary" style={{ padding: "0.75rem 1.5rem", borderRadius: "8px", fontWeight: 600 }}>Upgrade Plan</button>
              </div>

              <div style={{ marginBottom: "2rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Monthly Usage</h3>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>AI Messages</span>
                  <span style={{ fontWeight: 600 }}>{tenant?.messages_used} / {tenant?.message_limit}</span>
                </div>
                <div style={{ width: "100%", height: "8px", background: "var(--bg-tertiary)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (tenant?.messages_used / tenant?.message_limit) * 100)}%`, height: "100%", background: "var(--primary)", transition: "width 0.5s" }} />
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Invoice History</h3>
                <div style={{ border: "1px solid var(--border)", borderRadius: "8px" }}>
                  {tenant?.invoices && tenant.invoices.length > 0 ? (
                    tenant.invoices.map((inv: any) => (
                      <div key={inv.id} style={{ padding: "1rem", display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{tenant.plan_type} Plan</div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{new Date(inv.date).toLocaleDateString()}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                          <span style={{ fontWeight: 700 }}>₹{inv.amount}</span>
                          <span style={{ padding: "0.25rem 0.5rem", background: "rgba(0,184,148,0.1)", color: "#00B894", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 600, textTransform: "capitalize" }}>{inv.status}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      No invoices found.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

```


## src/app/dashboard/broadcast/page.tsx
```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface BroadcastStats {
  total: number;
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
}

export default function BroadcastPage() {
  const [stats, setStats] = useState<BroadcastStats | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/broadcast");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setStats(data.data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  async function handleSend() {
    if (!templateName.trim()) { setError("Template name is required."); return; }
    setSending(true); setError(null); setResult(null);

    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_name: templateName,
          filter_status: filterStatus.length > 0 ? filterStatus : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || "Broadcast failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setSending(false);
    }
  }

  const statusOptions = ["new", "hot", "warm", "cold", "converted"];

  function toggleStatus(s: string) {
    setFilterStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  const selectedCount = filterStatus.length > 0 && stats
    ? filterStatus.reduce((sum, s) => sum + (stats.byStatus[s] || 0), 0)
    : stats?.total || 0;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <aside style={{ width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Project Bolt</span>
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast", active: true },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 50 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>📢 Broadcast</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Send template messages to your leads at scale.</p>
        </header>

        <div style={{ padding: "2rem", maxWidth: "700px" }}>
          {/* Audience Stats */}
          {stats && (
            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>📊 Your Audience</h2>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ padding: "0.75rem 1.25rem", background: "rgba(108, 92, 231, 0.1)", borderRadius: "8px" }}>
                  <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--primary)" }}>{stats.total}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "0.5rem" }}>Total leads with phone</span>
                </div>
                {Object.entries(stats.byStatus).map(([status, count]) => (
                  <div key={status} style={{ padding: "0.5rem 0.75rem", background: "var(--bg-tertiary)", borderRadius: "6px" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{count}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginLeft: "0.4rem", textTransform: "capitalize" }}>{status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Broadcast Form */}
          <div className="glass-card" style={{ padding: "2rem" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>✉️ New Broadcast</h2>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem", fontWeight: 600 }}>
                Template Name *
              </label>
              <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., follow_up_reminder, special_offer"
                style={{ width: "100%", padding: "0.75rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "0.9rem" }}
              />
              <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: "0.25rem" }}>
                Must be an approved template in your Meta Business Manager.
              </p>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.75rem", fontWeight: 600 }}>
                Filter by Lead Status (optional)
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {statusOptions.map((s) => (
                  <button key={s} onClick={() => toggleStatus(s)} style={{
                    padding: "0.4rem 1rem", border: filterStatus.includes(s) ? "2px solid var(--primary)" : "1px solid var(--border)",
                    borderRadius: "20px", background: filterStatus.includes(s) ? "rgba(108, 92, 231, 0.15)" : "transparent",
                    color: filterStatus.includes(s) ? "var(--primary)" : "var(--text-secondary)",
                    cursor: "pointer", fontSize: "0.8rem", textTransform: "capitalize", fontWeight: filterStatus.includes(s) ? 600 : 400,
                  }}>{s}</button>
                ))}
              </div>
            </div>

            <div style={{ padding: "1rem", background: "var(--bg-tertiary)", borderRadius: "8px", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Recipients:</span>
              <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--primary)" }}>{selectedCount} leads</span>
            </div>

            {error && (
              <div style={{ padding: "0.75rem", background: "rgba(225, 112, 85, 0.1)", borderRadius: "8px", marginBottom: "1rem", color: "#E17055", fontSize: "0.85rem" }}>
                ❌ {error}
              </div>
            )}

            {result && (
              <div style={{ padding: "1rem", background: "rgba(0, 184, 148, 0.1)", borderRadius: "8px", marginBottom: "1rem", border: "1px solid rgba(0, 184, 148, 0.3)" }}>
                <p style={{ color: "#00B894", fontWeight: 700, marginBottom: "0.5rem" }}>✅ Broadcast Complete</p>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Sent: {result.sent} · Failed: {result.failed} · Total: {result.total}
                </p>
              </div>
            )}

            <button onClick={handleSend} disabled={sending || !templateName.trim() || selectedCount === 0} style={{
              width: "100%", padding: "0.85rem", background: sending ? "var(--bg-tertiary)" : "var(--gradient-primary)",
              border: "none", borderRadius: "10px", color: "white", fontWeight: 700, fontSize: "1rem",
              cursor: sending ? "wait" : "pointer", opacity: !templateName.trim() || selectedCount === 0 ? 0.5 : 1,
            }}>
              {sending ? "📡 Sending..." : `📢 Send to ${selectedCount} leads`}
            </button>
          </div>

          {/* Important Notice */}
          <div style={{ marginTop: "1.5rem", padding: "1rem", background: "rgba(253, 203, 110, 0.1)", borderRadius: "8px", border: "1px solid rgba(253, 203, 110, 0.3)" }}>
            <p style={{ color: "#FDCB6E", fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem" }}>⚠️ Important</p>
            <ul style={{ color: "var(--text-muted)", fontSize: "0.8rem", paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <li>Templates must be pre-approved in Meta Business Manager</li>
              <li>Rate limited to 5 broadcasts per hour</li>
              <li>Messages sent outside 24h window require template messages</li>
              <li>Broadcasts cannot be undone once sent</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

```


## src/app/dashboard/conversations/page.tsx
```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/conversations?limit=100")
      .then(res => res.json())
      .then(data => {
        if (data.success) setConversations(data.data || []);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{ width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Project Bolt</span>
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "👥", label: "Leads", href: "/dashboard/leads" },
            { icon: "💬", label: "Conversations", href: "/dashboard/conversations", active: true },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📈", label: "Analytics", href: "/dashboard/analytics" },
            { icon: "💳", label: "Billing", href: "/dashboard/billing" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>💬 Live Conversations</h1>
        <div className="glass-card" style={{ padding: "1.5rem" }}>
          {loading ? (
             <p>Loading conversations...</p>
          ) : conversations.length === 0 ? (
             <p style={{ color: "var(--text-muted)" }}>No active conversations.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["User", "Status", "Step", "Escalated", "Last Message"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conversations.map((conv) => (
                  <tr key={conv.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 600, fontSize: "0.9rem" }}>{conv.sender_name || conv.sender_id}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <span style={{ padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: conv.is_active ? "rgba(0, 184, 148, 0.1)" : "rgba(99, 110, 114, 0.1)", color: conv.is_active ? "#00B894" : "#636E72" }}>{conv.is_active ? "Active" : "Closed"}</span>
                      {conv.bot_paused && <span style={{ marginLeft: '0.5rem', padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: "rgba(253, 203, 110, 0.1)", color: "#FDCB6E" }}>Paused</span>}
                    </td>
                    <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{conv.current_step}</td>
                    <td style={{ padding: "0.75rem" }}>
                      {conv.escalated && <span style={{ padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: "rgba(225, 112, 85, 0.1)", color: "#E17055" }}>Escalated</span>}
                    </td>
                    <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{new Date(conv.last_message_at).toLocaleString()}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <button 
                        onClick={async () => {
                          await fetch(`/api/dashboard/conversations/${conv.id}/pause`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bot_paused: !conv.bot_paused }) });
                          setConversations(conversations.map(c => c.id === conv.id ? { ...c, bot_paused: !conv.bot_paused } : c));
                        }}
                        style={{ padding: "0.4rem 0.8rem", borderRadius: "6px", border: "1px solid var(--border)", background: conv.bot_paused ? "#00B894" : "var(--bg-tertiary)", color: conv.bot_paused ? "white" : "var(--text-secondary)", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}
                      >
                        {conv.bot_paused ? "Resume Bot" : "Take Over"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

```


## src/app/dashboard/layout.tsx
```tsx
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  let isTokenExpired = false;

  if (supabaseUrl && supabaseKey && supabaseUrl !== 'https://your-project.supabase.co') {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      redirect('/login');
    } else {
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('auth_id', user.id).single();
      if (userData?.tenant_id) {
        const { data: tenant } = await supabase.from('tenants').select('onboarding_completed, wa_token_expired').eq('id', userData.tenant_id).single();
        if (tenant && tenant.onboarding_completed === false) {
          redirect('/onboard');
        }
        isTokenExpired = !!tenant?.wa_token_expired;
      }
    }
  }

  return (
    <>
      {isTokenExpired && (
        <div className="bg-red-600 text-white text-center p-3 font-medium text-sm flex items-center justify-center gap-2 shadow-sm z-50 relative">
          <span>⚠️</span>
          <span>
            <strong>WhatsApp Disconnected!</strong> Your Meta access token has expired. Customers are not receiving replies. 
            <a href="/dashboard/settings" className="underline ml-2 hover:text-white/80 transition-colors">Reconnect WhatsApp now &rarr;</a>
          </span>
        </div>
      )}
      {children}
    </>
  );
}

```


## src/app/dashboard/leads/page.tsx
```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/leads?limit=100")
      .then(res => res.json())
      .then(data => {
        if (data.success) setLeads(data.data || []);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{ width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Project Bolt</span>
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "👥", label: "Leads", href: "/dashboard/leads", active: true },
            { icon: "💬", label: "Conversations", href: "/dashboard/conversations" },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📈", label: "Analytics", href: "/dashboard/analytics" },
            { icon: "💳", label: "Billing", href: "/dashboard/billing" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>👥 All Leads</h1>
        <div className="glass-card" style={{ padding: "1.5rem" }}>
          {loading ? (
             <p>Loading leads...</p>
          ) : leads.length === 0 ? (
             <p style={{ color: "var(--text-muted)" }}>No leads captured yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Name", "Phone", "Status", "Score", "Channel"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 600, fontSize: "0.9rem" }}>{lead.name || "Unknown"}</td>
                    <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{lead.phone}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <span style={{ padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: "rgba(108, 92, 231, 0.1)", color: "#6C5CE7" }}>{lead.lead_status}</span>
                    </td>
                    <td style={{ padding: "0.75rem", fontWeight: 700 }}>{lead.lead_score}</td>
                    <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{lead.channel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

```


## src/app/dashboard/page.tsx
```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ═══════════════════════════════════════
// 📊 Client Dashboard — Stats & Overview
// ═══════════════════════════════════════
// Now fetches REAL data from API endpoints.
// No more mock data — all Supabase-backed.
// ═══════════════════════════════════════

interface DashboardStats {
  totalLeads: number;
  newLeadsToday: number;
  activeConversations: number;
  confirmedBookings: number;
  conversionRate: string;
  messagesThisMonth: number;
  messageLimit: number;
  topChannel: string;
  peakHour: string;
  leadsByStatus: { status: string; count: number }[];
  leadsByChannel: { channel: string; count: number }[];
  dailyLeads: { date: string; count: number }[];
}

interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  lead_status: string;
  lead_score: number;
  channel: string;
  enquiry_type: string | null;
  last_message_at: string;
  created_at: string;
}

interface Conversation {
  id: string;
  sender_name: string | null;
  sender_id: string;
  current_step: string;
  is_active: boolean;
  escalated: boolean;
  last_message_at: string;
  channel: string;
  message_count: number;
}

function StatCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="glass-card" style={{ padding: "1.5rem", borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>{label}</p>
          <p style={{ fontSize: "2rem", fontWeight: 800, color }}>{value}</p>
          {sub && <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem" }}>{sub}</p>}
        </div>
        <span style={{ fontSize: "2rem" }}>{icon}</span>
      </div>
    </div>
  );
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    new: "#6C5CE7", hot: "#E17055", warm: "#FDCB6E", cold: "#636E72", converted: "#00CEC9", lost: "#E17055",
    active: "#00B894", resolved: "#636E72", escalated: "#E17055",
  };
  return colors[status] || "#636E72";
}

function getScoreColor(score: number) {
  if (score >= 80) return "#00B894";
  if (score >= 50) return "#FDCB6E";
  return "#E17055";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function LoadingPulse() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--text-muted)" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span style={{ animation: "pulse 1.5s infinite", fontSize: "1.5rem" }}>⏳</span>
        <span>Loading data...</span>
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ padding: "1rem 1.5rem", background: "rgba(225, 112, 85, 0.1)", border: "1px solid rgba(225, 112, 85, 0.3)", borderRadius: "8px", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "#E17055", fontSize: "0.9rem" }}>❌ {message}</span>
      <button onClick={onRetry} style={{ padding: "0.4rem 1rem", background: "#E17055", border: "none", borderRadius: "6px", color: "white", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>Retry</button>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "leads" | "conversations">("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadFilter, setLeadFilter] = useState("all");

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, leadsRes, convsRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/dashboard/leads?limit=50"),
        fetch("/api/dashboard/conversations?limit=20"),
      ]);

      if (!statsRes.ok) throw new Error(`Stats API error: ${statsRes.status}`);
      if (!leadsRes.ok) throw new Error(`Leads API error: ${leadsRes.status}`);

      const statsData = await statsRes.json();
      const leadsData = await leadsRes.json();

      if (statsData.success) setStats(statsData.data);
      else throw new Error(statsData.error || "Failed to fetch stats");

      if (leadsData.success) setLeads(leadsData.data || []);
      else throw new Error(leadsData.error || "Failed to fetch leads");

      // Conversations endpoint might not exist yet — handle gracefully
      if (convsRes.ok) {
        const convsData = await convsRes.json();
        if (convsData.success) setConversations(convsData.data || []);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const usagePercent = stats ? Math.round((stats.messagesThisMonth / stats.messageLimit) * 100) : 0;

  const filteredLeads = leadFilter === "all"
    ? leads
    : leads.filter((l) => l.lead_status === leadFilter);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? "260px" : "70px",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
        padding: "1.5rem 0",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.3s ease",
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 100,
      }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {sidebarOpen && (
            <Link href="/" style={{ textDecoration: "none" }}>
              <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Project Bolt</span>
            </Link>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1.25rem" }}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard", active: true },
            { icon: "👥", label: "Leads", href: "/dashboard/leads", active: false },
            { icon: "💬", label: "Conversations", href: "/dashboard/conversations", active: false },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast", active: false },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings", active: false },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp", active: false },
            { icon: "📈", label: "Analytics", href: "/dashboard/analytics", active: false },
            { icon: "💳", label: "Billing", href: "/dashboard/billing", active: false },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)",
              textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem",
              fontWeight: item.active ? 600 : 400,
              transition: "all 0.2s ease",
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {sidebarOpen && stats && (
          <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid var(--border)" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.5rem" }}>Messages: {stats.messagesThisMonth.toLocaleString()} / {stats.messageLimit.toLocaleString()}</p>
            <div style={{ width: "100%", height: "6px", background: "var(--bg-tertiary)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${usagePercent}%`, height: "100%", background: usagePercent > 80 ? "#E17055" : "var(--gradient-primary)", borderRadius: "3px", transition: "width 0.5s ease" }} />
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, marginLeft: sidebarOpen ? "260px" : "70px", transition: "margin-left 0.3s ease" }}>
        {/* Top Header */}
        <header style={{
          padding: "1rem 2rem",
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>Dashboard</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Welcome back! Here&apos;s your business overview.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button onClick={fetchDashboardData} style={{
              padding: "0.5rem 1rem",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}>
              🔄 Refresh
            </button>
            <div style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: "var(--gradient-primary)", display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: "0.85rem", color: "white",
            }}>S</div>
          </div>
        </header>

        {stats && (
          <div style={{ padding: "0 2rem", marginTop: "1.5rem" }}>
            {usagePercent >= 100 ? (
              <div style={{ background: "rgba(225, 112, 85, 0.1)", border: "1px solid #E17055", padding: "1rem 1.5rem", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ color: "#E17055", margin: 0, fontSize: "1rem" }}>⚠️ Message Limit Reached</h3>
                  <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0", fontSize: "0.85rem" }}>You have used {stats.messagesThisMonth} of your {stats.messageLimit} monthly messages. Your bot is currently paused.</p>
                </div>
                <Link href="/dashboard/billing" style={{ padding: "0.5rem 1rem", background: "#E17055", color: "white", textDecoration: "none", borderRadius: "6px", fontWeight: 600, fontSize: "0.85rem" }}>Upgrade Plan</Link>
              </div>
            ) : usagePercent >= 80 ? (
              <div style={{ background: "rgba(253, 203, 110, 0.1)", border: "1px solid #FDCB6E", padding: "1rem 1.5rem", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ color: "#FDCB6E", margin: 0, fontSize: "1rem" }}>⚠️ Approaching Limit</h3>
                  <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0", fontSize: "0.85rem" }}>You have used {usagePercent}% of your monthly AI messages ({stats.messagesThisMonth} / {stats.messageLimit}).</p>
                </div>
                <Link href="/dashboard/billing" style={{ padding: "0.5rem 1rem", background: "var(--bg-tertiary)", color: "var(--text-primary)", textDecoration: "none", borderRadius: "6px", fontWeight: 600, fontSize: "0.85rem", border: "1px solid var(--border)" }}>View Upgrade Options</Link>
              </div>
            ) : null}
          </div>
        )}

        <div style={{ padding: "2rem" }}>
          {/* Error Banner */}
          {error && <ErrorBanner message={error} onRetry={fetchDashboardData} />}

          {/* Tab Switcher */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem" }}>
            {(["overview", "leads", "conversations"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                padding: "0.6rem 1.5rem",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                background: activeTab === tab ? "var(--primary)" : "transparent",
                color: activeTab === tab ? "white" : "var(--text-secondary)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.85rem",
                textTransform: "capitalize",
                transition: "all 0.2s ease",
              }}>{tab}</button>
            ))}
          </div>

          {/* Loading State */}
          {loading && !stats && <LoadingPulse />}

          {/* Overview Tab */}
          {activeTab === "overview" && stats && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
                <StatCard icon="👥" label="Total Leads" value={stats.totalLeads} sub={`${stats.newLeadsToday} new today`} color="#6C5CE7" />
                <StatCard icon="💬" label="Active Conversations" value={stats.activeConversations} sub="Currently active" color="#00B894" />
                <StatCard icon="📩" label="Messages This Month" value={stats.messagesThisMonth.toLocaleString()} sub={`${usagePercent}% of limit used`} color="#00CEC9" />
                <StatCard icon="📅" label="Bookings" value={stats.confirmedBookings} sub={`${stats.conversionRate} conversion`} color="#FDCB6E" />
                <StatCard icon="📡" label="Top Channel" value={stats.topChannel} sub="Most leads from" color="#A29BFE" />
                <StatCard icon="📊" label="Leads by Status" value={stats.leadsByStatus.length} sub="Categories tracked" color="#FD79A8" />
              </div>

              {/* Recent Leads */}
              <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Recent Leads</h2>
                  <button onClick={() => setActiveTab("leads")} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}>View All →</button>
                </div>
                {leads.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>No leads yet. Leads will appear here when customers message your WhatsApp.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["Name", "Status", "Score", "Channel", "Activity"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leads.slice(0, 5).map((lead) => (
                          <tr key={lead.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.75rem" }}>
                              <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{lead.name || "Unknown"}</div>
                              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{lead.phone}</div>
                            </td>
                            <td style={{ padding: "0.75rem" }}>
                              <span style={{ padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: `${getStatusColor(lead.lead_status)}22`, color: getStatusColor(lead.lead_status) }}>{lead.lead_status}</span>
                            </td>
                            <td style={{ padding: "0.75rem" }}>
                              <span style={{ fontWeight: 700, color: getScoreColor(lead.lead_score) }}>{lead.lead_score}</span>
                            </td>
                            <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{lead.channel}</td>
                            <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>{timeAgo(lead.last_message_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Leads by Status Breakdown */}
              {stats.leadsByStatus.length > 0 && (
                <div className="glass-card" style={{ padding: "1.5rem" }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>Lead Status Breakdown</h2>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    {stats.leadsByStatus.map(({ status, count }) => (
                      <div key={status} style={{ padding: "0.75rem 1.25rem", background: `${getStatusColor(status)}15`, borderRadius: "8px", border: `1px solid ${getStatusColor(status)}33` }}>
                        <span style={{ color: getStatusColor(status), fontWeight: 700, fontSize: "1.2rem" }}>{count}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: "0.5rem", textTransform: "capitalize" }}>{status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Leads Tab */}
          {activeTab === "leads" && (
            <div className="glass-card" style={{ padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>All Leads ({filteredLeads.length})</h2>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {["all", "new", "hot", "warm", "converted"].map((f) => (
                    <button key={f} onClick={() => setLeadFilter(f)} style={{ padding: "0.4rem 1rem", border: "1px solid var(--border)", borderRadius: "6px", background: leadFilter === f ? "var(--primary)" : "transparent", color: leadFilter === f ? "white" : "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem", textTransform: "capitalize" }}>{f}</button>
                  ))}
                </div>
              </div>
              {filteredLeads.length === 0 ? (
                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>No leads found for this filter.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Name", "Status", "Score", "Channel", "Type", "Activity"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }} onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(108, 92, 231, 0.05)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                        <td style={{ padding: "0.75rem" }}>
                          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{lead.name || "Unknown"}</div>
                          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{lead.phone}</div>
                        </td>
                        <td style={{ padding: "0.75rem" }}>
                          <span style={{ padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: `${getStatusColor(lead.lead_status)}22`, color: getStatusColor(lead.lead_status) }}>{lead.lead_status}</span>
                        </td>
                        <td style={{ padding: "0.75rem" }}><span style={{ fontWeight: 700, color: getScoreColor(lead.lead_score) }}>{lead.lead_score}</span></td>
                        <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{lead.channel}</td>
                        <td style={{ padding: "0.75rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>{lead.enquiry_type || "—"}</td>
                        <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>{timeAgo(lead.last_message_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Conversations Tab */}
          {activeTab === "conversations" && (
            <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "1rem", height: "calc(100vh - 220px)" }}>
              {/* Conversation List */}
              <div className="glass-card" style={{ padding: "0", overflow: "hidden" }}>
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                  <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Conversations</h2>
                  <input type="text" placeholder="Search conversations..." style={{ width: "100%", padding: "0.5rem 0.75rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-primary)", fontSize: "0.85rem" }} />
                </div>
                <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 320px)" }}>
                  {conversations.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem", fontSize: "0.85rem" }}>No active conversations.</p>
                  ) : (
                    conversations.map((conv, i) => (
                      <div key={conv.id} style={{
                        padding: "1rem 1.25rem",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        background: i === 0 ? "rgba(108, 92, 231, 0.08)" : "transparent",
                        borderLeft: i === 0 ? "3px solid var(--primary)" : "3px solid transparent",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{conv.sender_name || conv.sender_id}</span>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{timeAgo(conv.last_message_at)}</span>
                        </div>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Step: {conv.current_step} · {conv.message_count} msgs</p>
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                          <span style={{ fontSize: "0.7rem", padding: "0.1rem 0.5rem", borderRadius: "4px", background: conv.is_active ? "#00B89422" : "#636E7222", color: conv.is_active ? "#00B894" : "#636E72" }}>{conv.is_active ? "active" : "closed"}</span>
                          {conv.escalated && <span style={{ fontSize: "0.7rem", padding: "0.1rem 0.5rem", borderRadius: "4px", background: "#E1705522", color: "#E17055" }}>escalated</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chat View Placeholder */}
              <div className="glass-card" style={{ padding: "0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>💬 Select a conversation to view messages</p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.5rem" }}>Messages are handled by the AI bot in real-time</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

```


## src/app/dashboard/settings/page.tsx
```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ═══════════════════════════════════════
// 🤖 Bot Settings — Now saves to Supabase!
// ═══════════════════════════════════════
// Fetches config from /api/dashboard/settings on load.
// Saves changes back to Supabase via PATCH.
// ═══════════════════════════════════════

interface BotConfig {
  business_name: string;
  business_type: string;
  welcome_message: string;
  bot_name: string;
  bot_personality: string;
  business_phone: string;
  business_address: string;
  business_website: string;
  business_email: string;
  welcome_offer: string;
  usps: string[];
  working_hours: Record<string, string>;
  off_hours_message: string;
  staff_phone: string;
  staff_name: string;
  manager_phone: string;
  followup_30min: boolean;
  followup_3hr: boolean;
  followup_24hr: boolean;
  followup_7day: boolean;
  escalation_timeout_mins: number;
  hot_keywords: string[];
  warm_keywords: string[];
  custom_faqs: Array<{ question: string; answer: string }>;
  off_hours_capture_lead: boolean;
}

const DEFAULT_CONFIG: BotConfig = {
  business_name: "",
  business_type: "restaurant",
  welcome_message: "Welcome to {business_name}! 🙏 How can I help you today?",
  bot_name: "Assistant",
  bot_personality: "friendly and professional",
  business_phone: "",
  business_address: "",
  business_website: "",
  business_email: "",
  welcome_offer: "",
  usps: [],
  working_hours: { "mon-fri": "09:00-22:00", "sat-sun": "10:00-23:00" },
  off_hours_message: "We're currently closed. We'll get back to you when we open! 🌙",
  staff_phone: "",
  staff_name: "",
  manager_phone: "",
  followup_30min: true,
  followup_3hr: true,
  followup_24hr: true,
  followup_7day: false,
  escalation_timeout_mins: 30,
  hot_keywords: ["today", "tonight", "now", "book", "reserve"],
  warm_keywords: ["interested", "looking", "when", "available"],
  custom_faqs: [],
  off_hours_capture_lead: true,
};

const PERSONALITY_OPTIONS = [
  { value: "professional", label: "Professional", icon: "👔", desc: "Formal, polished, corporate tone" },
  { value: "friendly and professional", label: "Friendly", icon: "😊", desc: "Warm, approachable, conversational" },
  { value: "casual and fun", label: "Casual", icon: "✌️", desc: "Relaxed, uses emoji, fun" },
  { value: "elegant and exclusive", label: "Luxury", icon: "✨", desc: "Elegant, exclusive, premium feel" },
];

export default function BotSettingsPage() {
  const [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [activeSection, setActiveSection] = useState("general");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [newFaqQ, setNewFaqQ] = useState("");
  const [newFaqA, setNewFaqA] = useState("");

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/settings");
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      if (data.success && data.data) {
        setConfig({ ...DEFAULT_CONFIG, ...data.data });
      }
    } catch (err) {
      console.error("Settings fetch error:", err);
      // Don't set error — just use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleTest() {
    if (!testMessage.trim()) return;
    const responses: Record<string, string> = {
      "hi": `Welcome to ${config.business_name}! 🙏 How can I help you today?`,
      "menu": "Here's our menu! We have a wide selection. Would you like to see our special recommendations? 🍽️",
      "book": `I'd love to help you with a reservation at ${config.business_name}! For how many guests and when? 📅`,
    };
    const key = Object.keys(responses).find(k => testMessage.toLowerCase().includes(k));
    setTestResponse(key ? responses[key] : `Thank you for reaching out to ${config.business_name}! Let me help you with that.`);
  }

  function addFaq() {
    if (!newFaqQ.trim() || !newFaqA.trim()) return;
    setConfig(prev => ({
      ...prev,
      custom_faqs: [...prev.custom_faqs, { question: newFaqQ.trim(), answer: newFaqA.trim() }],
    }));
    setNewFaqQ("");
    setNewFaqA("");
  }

  function removeFaq(index: number) {
    setConfig(prev => ({
      ...prev,
      custom_faqs: prev.custom_faqs.filter((_, i) => i !== index),
    }));
  }

  function updateConfig<K extends keyof BotConfig>(key: K, value: BotConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  const sections = [
    { id: "general", label: "General", icon: "⚙️" },
    { id: "personality", label: "AI Personality", icon: "🧠" },
    { id: "hours", label: "Working Hours", icon: "🕐" },
    { id: "faqs", label: "Custom FAQs", icon: "❓" },
    { id: "followups", label: "Follow-ups", icon: "📤" },
    { id: "escalation", label: "Escalation", icon: "🚨" },
    { id: "features", label: "Features", icon: "🔧" },
    { id: "test", label: "Test Bot", icon: "🧪" },
  ];

  const inputStyle = { width: "100%", padding: "0.7rem 1rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "0.9rem" };
  const labelStyle = { display: "block" as const, color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem", fontWeight: 600 };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", color: "var(--text-muted)" }}>
        ⏳ Loading settings...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{
        width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)",
        padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
      }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Project Bolt</span>
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings", active: true },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 50 }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>🤖 Bot Settings</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Configure your AI assistant&apos;s behavior. Changes save to your account.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {error && <span style={{ color: "#E17055", fontSize: "0.8rem" }}>❌ {error}</span>}
            <button onClick={handleSave} disabled={saving} style={{
              padding: "0.6rem 1.5rem", background: saved ? "#00B894" : "var(--gradient-primary)", border: "none", borderRadius: "8px",
              color: "white", fontWeight: 600, cursor: saving ? "wait" : "pointer", transition: "all 0.3s ease", opacity: saving ? 0.7 : 1,
            }}>
              {saving ? "⏳ Saving..." : saved ? "✅ Saved!" : "💾 Save Changes"}
            </button>
          </div>
        </header>

        <div style={{ padding: "2rem", display: "flex", gap: "2rem" }}>
          {/* Settings Navigation */}
          <div style={{ width: "200px", flexShrink: 0 }}>
            {sections.map((s) => (
              <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
                display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", padding: "0.6rem 1rem",
                border: "none", borderRadius: "8px", marginBottom: "0.25rem", cursor: "pointer", fontSize: "0.85rem",
                background: activeSection === s.id ? "rgba(108, 92, 231, 0.15)" : "transparent",
                color: activeSection === s.id ? "var(--primary)" : "var(--text-secondary)", fontWeight: activeSection === s.id ? 600 : 400,
              }}>
                <span>{s.icon}</span><span>{s.label}</span>
              </button>
            ))}
          </div>

          {/* Settings Content */}
          <div style={{ flex: 1, maxWidth: "700px" }}>
            {activeSection === "general" && (
              <div className="glass-card" style={{ padding: "2rem" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>⚙️ General Settings</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <label style={labelStyle}>Business Name</label>
                    <input type="text" value={config.business_name} onChange={(e) => updateConfig("business_name", e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Business Type</label>
                    <select value={config.business_type} onChange={(e) => updateConfig("business_type", e.target.value)} style={inputStyle}>
                      {["Restaurant", "Hotel", "Salon", "Clinic", "Retail", "Real Estate", "Gym", "Other"].map((t) => (
                        <option key={t} value={t.toLowerCase().replace(" ", "_")}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Bot Name</label>
                    <input type="text" value={config.bot_name} onChange={(e) => updateConfig("bot_name", e.target.value)} style={inputStyle} placeholder="e.g., Maya, Aria, Assistant" />
                  </div>
                  <div>
                    <label style={labelStyle}>Welcome Message</label>
                    <textarea value={config.welcome_message || ""} onChange={(e) => updateConfig("welcome_message", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />
                    <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem" }}>Variables: {"{business_name}"}, {"{customer_name}"}</p>
                  </div>
                  <div>
                    <label style={labelStyle}>Welcome Offer (optional)</label>
                    <input type="text" value={config.welcome_offer || ""} onChange={(e) => updateConfig("welcome_offer", e.target.value)} style={inputStyle} placeholder="e.g., 10% off on first visit!" />
                  </div>
                  <div>
                    <label style={labelStyle}>Business Phone</label>
                    <input type="tel" value={config.business_phone || ""} onChange={(e) => updateConfig("business_phone", e.target.value)} style={inputStyle} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label style={labelStyle}>Business Address</label>
                    <input type="text" value={config.business_address || ""} onChange={(e) => updateConfig("business_address", e.target.value)} style={inputStyle} />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "personality" && (
              <div className="glass-card" style={{ padding: "2rem" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>🧠 AI Personality</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                  {PERSONALITY_OPTIONS.map((p) => (
                    <button key={p.value} onClick={() => updateConfig("bot_personality", p.value)} style={{
                      padding: "1.25rem", border: config.bot_personality === p.value ? "2px solid var(--primary)" : "1px solid var(--border)",
                      borderRadius: "12px", background: config.bot_personality === p.value ? "rgba(108, 92, 231, 0.1)" : "var(--bg-tertiary)",
                      cursor: "pointer", textAlign: "left",
                    }}>
                      <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{p.icon}</div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: "0.25rem", color: "var(--text-primary)" }}>{p.label}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeSection === "hours" && (
              <div className="glass-card" style={{ padding: "2rem" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>🕐 Working Hours</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
                  {Object.entries(config.working_hours || {}).map(([day, hours]) => (
                    <div key={day} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      <span style={{ width: "100px", color: "var(--text-secondary)", fontSize: "0.85rem", fontWeight: 600, textTransform: "capitalize" }}>{day}</span>
                      <input type="text" value={hours} onChange={(e) => {
                        const newHours = { ...config.working_hours, [day]: e.target.value };
                        updateConfig("working_hours", newHours);
                      }} style={{ ...inputStyle, width: "200px" }} placeholder="09:00-22:00" />
                    </div>
                  ))}
                </div>
                <div>
                  <label style={labelStyle}>Off-Hours Message</label>
                  <textarea value={config.off_hours_message || ""} onChange={(e) => updateConfig("off_hours_message", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />
                  <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem" }}>Sent when a customer messages outside working hours.</p>
                </div>
              </div>
            )}

            {activeSection === "faqs" && (
              <div className="glass-card" style={{ padding: "2rem" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>❓ Custom FAQs</h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>Add Q&A pairs that your bot will use to answer common questions.</p>
                
                {config.custom_faqs.map((faq, i) => (
                  <div key={i} style={{ padding: "1rem", background: "var(--bg-tertiary)", borderRadius: "8px", marginBottom: "0.75rem", position: "relative" }}>
                    <button onClick={() => removeFaq(i)} style={{ position: "absolute", top: "0.5rem", right: "0.5rem", background: "none", border: "none", color: "#E17055", cursor: "pointer", fontSize: "1rem" }}>✕</button>
                    <p style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.25rem" }}>Q: {faq.question}</p>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>A: {faq.answer}</p>
                  </div>
                ))}

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem", padding: "1rem", border: "1px dashed var(--border)", borderRadius: "8px" }}>
                  <input type="text" value={newFaqQ} onChange={(e) => setNewFaqQ(e.target.value)} placeholder="Question (e.g., What's your parking situation?)" style={inputStyle} />
                  <textarea value={newFaqA} onChange={(e) => setNewFaqA(e.target.value)} placeholder="Answer (e.g., Free valet parking for all guests!)" rows={2} style={{ ...inputStyle, resize: "vertical" as const }} />
                  <button onClick={addFaq} style={{ alignSelf: "flex-start", padding: "0.5rem 1.25rem", background: "var(--gradient-primary)", border: "none", borderRadius: "6px", color: "white", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}>+ Add FAQ</button>
                </div>
              </div>
            )}

            {activeSection === "followups" && (
              <div className="glass-card" style={{ padding: "2rem" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>📤 Follow-up Settings</h2>
                {[
                  { key: "followup_30min" as keyof BotConfig, label: "30-Minute Follow-up", desc: "Confirm booking status" },
                  { key: "followup_3hr" as keyof BotConfig, label: "3-Hour Follow-up", desc: "Gentle reminder for interested leads" },
                  { key: "followup_24hr" as keyof BotConfig, label: "24-Hour Follow-up", desc: "Create urgency with special offers" },
                  { key: "followup_7day" as keyof BotConfig, label: "7-Day Follow-up", desc: "Re-engage cold leads" },
                ].map((item) => (
                  <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{item.label}</span>
                      <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{item.desc}</p>
                    </div>
                    <button onClick={() => updateConfig(item.key, !config[item.key])} style={{
                      width: "48px", height: "26px", borderRadius: "13px", border: "none", cursor: "pointer",
                      background: config[item.key] ? "var(--primary)" : "var(--bg-secondary)", position: "relative", transition: "background 0.3s",
                    }}>
                      <span style={{ position: "absolute", width: "20px", height: "20px", borderRadius: "50%", background: "white", top: "3px", left: config[item.key] ? "25px" : "3px", transition: "left 0.3s" }} />
                    </button>
                  </div>
                ))}
                <div style={{ marginTop: "1.5rem" }}>
                  <label style={labelStyle}>Escalation Timeout (minutes)</label>
                  <input type="number" value={config.escalation_timeout_mins} onChange={(e) => updateConfig("escalation_timeout_mins", parseInt(e.target.value) || 30)} min={5} max={120} style={{ ...inputStyle, width: "200px" }} />
                  <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem" }}>Alert staff if bot can&apos;t resolve within this time</p>
                </div>
              </div>
            )}

            {activeSection === "escalation" && (
              <div className="glass-card" style={{ padding: "2rem" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>🚨 Escalation & Staff</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <label style={labelStyle}>Staff Name</label>
                    <input type="text" value={config.staff_name || ""} onChange={(e) => updateConfig("staff_name", e.target.value)} style={inputStyle} placeholder="e.g., Rajesh" />
                  </div>
                  <div>
                    <label style={labelStyle}>Staff Alert Phone</label>
                    <input type="tel" value={config.staff_phone || ""} onChange={(e) => updateConfig("staff_phone", e.target.value)} style={inputStyle} placeholder="+91 98765 43210" />
                    <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem" }}>Receives WhatsApp alerts for escalations and new bookings.</p>
                  </div>
                  <div>
                    <label style={labelStyle}>Manager Phone (optional)</label>
                    <input type="tel" value={config.manager_phone || ""} onChange={(e) => updateConfig("manager_phone", e.target.value)} style={inputStyle} placeholder="+91 98765 43210" />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "features" && (
              <div className="glass-card" style={{ padding: "2rem" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>🔧 Advanced</h2>
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={labelStyle}>USPs (one per line)</label>
                  <textarea value={(config.usps || []).join("\n")} onChange={(e) => updateConfig("usps", e.target.value.split("\n").filter(Boolean))} rows={4} style={{ ...inputStyle, resize: "vertical" as const }} placeholder="Live music every weekend&#10;Rooftop dining&#10;Award-winning chef" />
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={labelStyle}>Hot Lead Keywords (comma-separated)</label>
                  <input type="text" value={(config.hot_keywords || []).join(", ")} onChange={(e) => updateConfig("hot_keywords", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Warm Lead Keywords (comma-separated)</label>
                  <input type="text" value={(config.warm_keywords || []).join(", ")} onChange={(e) => updateConfig("warm_keywords", e.target.value.split(",").map(s => s.trim()).filter(Boolean))} style={inputStyle} />
                </div>
              </div>
            )}

            {activeSection === "test" && (
              <div className="glass-card" style={{ padding: "2rem" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1.5rem" }}>🧪 Test Your Bot</h2>
                <div style={{ background: "var(--bg-tertiary)", borderRadius: "12px", padding: "1.5rem", minHeight: "300px", display: "flex", flexDirection: "column" }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                    {testMessage && (
                      <div style={{ alignSelf: "flex-end", maxWidth: "70%", padding: "0.75rem 1rem", background: "var(--primary)", borderRadius: "12px 12px 4px 12px", fontSize: "0.9rem", color: "white" }}>
                        {testMessage}
                      </div>
                    )}
                    {testResponse && (
                      <div style={{ alignSelf: "flex-start", maxWidth: "70%", padding: "0.75rem 1rem", background: "var(--bg-secondary)", borderRadius: "12px 12px 12px 4px", fontSize: "0.9rem" }}>
                        {testResponse}
                      </div>
                    )}
                    {!testMessage && !testResponse && (
                      <p style={{ color: "var(--text-muted)", textAlign: "center", marginTop: "3rem" }}>Send a test message to preview your bot&apos;s response.</p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input type="text" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleTest(); }} placeholder="Type a test message..." style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={handleTest} style={{ padding: "0.6rem 1.5rem", background: "var(--gradient-primary)", border: "none", borderRadius: "8px", color: "white", fontWeight: 600, cursor: "pointer" }}>Send</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

```


## src/app/dashboard/templates/page.tsx
```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const PREBUILT_TEMPLATES = [
  { name: "restaurant_reservation_confirm", category: "UTILITY", text: "Hi {{1}}, your table for {{2}} at {{3}} is confirmed. We look forward to hosting you! 🍽️" },
  { name: "restaurant_weekend_offer", category: "MARKETING", text: "Hey {{1}}! 🎉 Join us this weekend at {{2}} for a special offer: {{3}}. Reply 'BOOK' to reserve a table." },
  { name: "gym_membership_renewal", category: "UTILITY", text: "Hi {{1}}, your gym membership at {{2}} expires in {{3}} days. Renew now to keep your streak alive! 💪" },
  { name: "gym_personal_training_promo", category: "MARKETING", text: "Hey {{1}}, ready to crush your goals? Get 20% off your first 5 Personal Training sessions at {{2}}. Reply 'YES' to claim." },
  { name: "jeweler_appointment_reminder", category: "UTILITY", text: "Hi {{1}}, this is a reminder for your viewing appointment at {{2}} on {{3}}. See you soon! ✨" },
  { name: "jeweler_new_collection", category: "MARKETING", text: "Hello {{1}}! 💍 Our new bridal collection has just arrived at {{2}}. Book a private viewing and receive a complimentary gift." },
  { name: "general_abandoned_cart", category: "MARKETING", text: "Hi {{1}}, you left something behind! 🛒 Complete your purchase at {{2}} and use code {{3}} for 10% off." },
  { name: "general_event_invite", category: "MARKETING", text: "You're invited, {{1}}! 🎈 Join us for {{2}} on {{3}}. Reply to RSVP." },
  { name: "general_feedback_request", category: "MARKETING", text: "Hi {{1}}, thanks for visiting {{2}}! How was your experience? Rate us from 1 (Poor) to 5 (Excellent). ⭐" },
  { name: "general_follow_up", category: "MARKETING", text: "Hey {{1}} 👋 We noticed you were interested in {{2}}. Can we help answer any questions?" },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", category: "MARKETING", language: "en_US", text: "" });

  useEffect(() => {
    fetch("/api/dashboard/templates")
      .then(res => res.json())
      .then(data => {
        if (data.success) setTemplates(data.data);
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/dashboard/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTemplate)
    });
    const data = await res.json();
    if (data.success) {
      setTemplates([...templates, data.data]);
      setShowModal(false);
      setNewTemplate({ name: "", category: "MARKETING", language: "en_US", text: "" });
    }
  };

  const loadPrebuilt = (t: any) => {
    setNewTemplate({ name: t.name, category: t.category, language: "en_US", text: t.text });
    setShowModal(true);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Sidebar */}
      <aside style={{ width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Project Bolt</span>
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "👥", label: "Leads", href: "/dashboard/leads" },
            { icon: "💬", label: "Conversations", href: "/dashboard/conversations" },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
            { icon: "📝", label: "Templates", href: "/dashboard/templates", active: true },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp" },
            { icon: "📈", label: "Analytics", href: "/dashboard/analytics" },
            { icon: "💳", label: "Billing", href: "/dashboard/billing" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px", padding: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>📝 Template Manager</h1>
          <button onClick={() => setShowModal(true)} style={{ padding: "0.6rem 1.2rem", background: "var(--primary)", color: "white", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
            + Create Template
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "2rem" }}>
          
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>My WhatsApp Templates</h2>
            {loading ? <p>Loading templates from Meta...</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Template Name", "Category", "Status", "Reason"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "1rem 0.75rem", fontWeight: 600, fontSize: "0.9rem" }}>{t.name}</td>
                      <td style={{ padding: "1rem 0.75rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>{t.category}</td>
                      <td style={{ padding: "1rem 0.75rem" }}>
                        <span style={{ 
                          padding: "0.25rem 0.75rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, 
                          background: t.status === 'APPROVED' ? 'rgba(0,184,148,0.1)' : t.status === 'REJECTED' ? 'rgba(225,112,85,0.1)' : 'rgba(253,203,110,0.1)',
                          color: t.status === 'APPROVED' ? '#00B894' : t.status === 'REJECTED' ? '#E17055' : '#FDCB6E'
                        }}>{t.status}</span>
                      </td>
                      <td style={{ padding: "1rem 0.75rem", color: "#E17055", fontSize: "0.8rem", maxWidth: "200px" }}>{t.rejection_reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="glass-card" style={{ padding: "1.5rem", height: "fit-content" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>Pre-built Library</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>Click any template to customize and submit it for Meta approval instantly.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {PREBUILT_TEMPLATES.map((t, i) => (
                <button key={i} onClick={() => loadPrebuilt(t)} style={{ textAlign: "left", padding: "0.75rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", transition: "border 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--primary)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--text-primary)" }}>{t.name.replace(/_/g, ' ')}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.text}</div>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Modal */}
        {showModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}>
            <div className="glass-card" style={{ width: "500px", padding: "2rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.5rem" }}>Submit New Template</h2>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>Template Name (lowercase, underscores)</label>
                  <input required className="input" value={newTemplate.name} onChange={e => setNewTemplate({...newTemplate, name: e.target.value.toLowerCase().replace(/[^a-z_]/g, '')})} placeholder="e.g. spring_sale_offer" style={{ width: "100%", padding: "0.75rem" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>Category</label>
                  <select className="input" value={newTemplate.category} onChange={e => setNewTemplate({...newTemplate, category: e.target.value})} style={{ width: "100%", padding: "0.75rem" }}>
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utility</option>
                    <option value="AUTHENTICATION">Authentication</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>Message Text (use {'{{1}}'}, {'{{2}}'} for variables)</label>
                  <textarea required className="input" value={newTemplate.text} onChange={e => setNewTemplate({...newTemplate, text: e.target.value})} rows={4} style={{ width: "100%", padding: "0.75rem", resize: "vertical" }} />
                </div>
                <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                  <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: "0.75rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-secondary)", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                  <button type="submit" style={{ flex: 1, padding: "0.75rem", background: "var(--primary)", border: "none", borderRadius: "8px", color: "white", fontWeight: 600, cursor: "pointer" }}>Submit to Meta</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

```


## src/app/dashboard/whatsapp/page.tsx
```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Script from "next/script";

// ═══════════════════════════════════════
// 📱 WhatsApp Connection — Meta Embedded Signup
// ═══════════════════════════════════════
// Uses Meta's official Embedded Signup SDK for one-click
// WhatsApp Business API connection. No manual token entry.
// ═══════════════════════════════════════

declare global {
  interface Window {
    FB?: {
      init: (config: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        config: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

interface ConnectionStatus {
  connected: boolean;
  phone_number_id: string | null;
  waba_id: string | null;
  webhook_verified: boolean;
  onboarding_completed: boolean;
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || "";
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID || "";

export default function WhatsAppPage() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Manual connection fields (fallback)
  const [manualMode, setManualMode] = useState(false);
  const [manualPhoneId, setManualPhoneId] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/connect");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setStatus(data.data);
      }
    } catch {
      // Ignore — will show setup flow
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Initialize Facebook SDK
  useEffect(() => {
    if (!META_APP_ID) return;
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: true,
        version: "v21.0",
      });
      setSdkLoaded(true);
    };
  }, []);

  // ── Embedded Signup Flow ──
  function handleEmbeddedSignup() {
    if (!window.FB) {
      setError("Facebook SDK not loaded. Please refresh the page.");
      return;
    }

    setConnecting(true);
    setError(null);

    window.FB.login(
      async (response) => {
        if (!response.authResponse?.code) {
          setConnecting(false);
          setError("Login was cancelled or failed. Please try again.");
          return;
        }

        try {
          const res = await fetch("/api/whatsapp/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: response.authResponse.code }),
          });

          const data = await res.json();
          if (data.success) {
            setSuccess("WhatsApp connected successfully! 🎉");
            await fetchStatus();
          } else {
            setError(data.error || "Connection failed");
          }
        } catch {
          setError("Network error. Please try again.");
        } finally {
          setConnecting(false);
        }
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: "3",
        },
      }
    );
  }

  // ── Manual Connection ──
  async function handleManualConnect() {
    if (!manualPhoneId || !manualToken) {
      setError("Phone Number ID and Access Token are required.");
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: manualToken, // Token used directly
          phone_number_id: manualPhoneId,
          waba_id: manualWabaId || null,
          manual: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess("WhatsApp connected successfully! 🎉");
        await fetchStatus();
        setManualMode(false);
      } else {
        setError(data.error || "Connection failed");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setConnecting(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "0.75rem 1rem",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    color: "var(--text-primary)",
    fontSize: "0.9rem",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", color: "var(--text-muted)" }}>
        ⏳ Loading WhatsApp status...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Facebook SDK Script */}
      {META_APP_ID && (
        <Script
          src="https://connect.facebook.net/en_US/sdk.js"
          strategy="lazyOnload"
          onLoad={() => {
            if (window.fbAsyncInit) window.fbAsyncInit();
          }}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        width: "260px", background: "var(--bg-secondary)", borderRight: "1px solid var(--border)",
        padding: "1.5rem 0", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
      }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, background: "var(--gradient-primary)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>⚡ Project Bolt</span>
          </Link>
        </div>
        <nav style={{ flex: 1 }}>
          {[
            { icon: "📊", label: "Dashboard", href: "/dashboard" },
            { icon: "🤖", label: "Bot Settings", href: "/dashboard/settings" },
            { icon: "📱", label: "WhatsApp", href: "/dashboard/whatsapp", active: true },
            { icon: "📢", label: "Broadcast", href: "/dashboard/broadcast" },
          ].map((item) => (
            <Link key={item.label} href={item.href} style={{
              display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.25rem",
              color: item.active ? "var(--primary)" : "var(--text-secondary)", textDecoration: "none",
              background: item.active ? "rgba(108, 92, 231, 0.1)" : "transparent",
              borderRight: item.active ? "3px solid var(--primary)" : "3px solid transparent",
              fontSize: "0.9rem", fontWeight: item.active ? 600 : 400,
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, marginLeft: "260px" }}>
        <header style={{ padding: "1rem 2rem", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 50 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>📱 WhatsApp Connection</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Connect your WhatsApp Business number to start automating.</p>
        </header>

        <div style={{ padding: "2rem", maxWidth: "700px" }}>
          {/* Status Messages */}
          {error && (
            <div style={{ padding: "1rem", background: "rgba(225, 112, 85, 0.1)", border: "1px solid rgba(225, 112, 85, 0.3)", borderRadius: "8px", marginBottom: "1.5rem", color: "#E17055", fontSize: "0.9rem" }}>
              ❌ {error}
            </div>
          )}
          {success && (
            <div style={{ padding: "1rem", background: "rgba(0, 184, 148, 0.1)", border: "1px solid rgba(0, 184, 148, 0.3)", borderRadius: "8px", marginBottom: "1.5rem", color: "#00B894", fontSize: "0.9rem" }}>
              ✅ {success}
            </div>
          )}

          {/* Connected State */}
          {status?.connected ? (
            <div className="glass-card" style={{ padding: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
                <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: "rgba(0, 184, 148, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem" }}>✅</div>
                <div>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>WhatsApp Connected</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Your bot is live and responding to messages.</p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--bg-tertiary)", borderRadius: "8px" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Phone Number ID</span>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", fontFamily: "monospace" }}>{status.phone_number_id}</span>
                </div>
                {status.waba_id && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--bg-tertiary)", borderRadius: "8px" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Business Account ID</span>
                    <span style={{ fontWeight: 600, fontSize: "0.85rem", fontFamily: "monospace" }}>{status.waba_id}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--bg-tertiary)", borderRadius: "8px" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Webhook</span>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: status.webhook_verified ? "#00B894" : "#FDCB6E" }}>
                    {status.webhook_verified ? "✅ Verified" : "⏳ Pending"}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: "2rem", padding: "1rem", background: "rgba(108, 92, 231, 0.08)", borderRadius: "8px", border: "1px solid rgba(108, 92, 231, 0.2)" }}>
                <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>📋 Webhook URL</p>
                <code style={{ fontSize: "0.8rem", color: "var(--text-secondary)", wordBreak: "break-all" }}>
                  {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/whatsapp` : "/api/webhooks/whatsapp"}
                </code>
                <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.5rem" }}>
                  Set this URL in your Meta App Dashboard → WhatsApp → Configuration → Webhook URL
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Not Connected — Show setup options */}
              <div className="glass-card" style={{ padding: "2rem", marginBottom: "1.5rem" }}>
                <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📱</div>
                  <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "0.5rem" }}>Connect WhatsApp</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "400px", margin: "0 auto" }}>
                    Connect your WhatsApp Business number to start automating customer conversations with AI.
                  </p>
                </div>

                {/* One-Click Embedded Signup */}
                {META_APP_ID && (
                  <div style={{ marginBottom: "2rem" }}>
                    <button
                      onClick={handleEmbeddedSignup}
                      disabled={connecting || !sdkLoaded}
                      style={{
                        width: "100%", padding: "1rem", background: "#25D366", border: "none",
                        borderRadius: "12px", color: "white", fontWeight: 700, fontSize: "1rem",
                        cursor: connecting ? "wait" : "pointer", display: "flex", alignItems: "center",
                        justifyContent: "center", gap: "0.75rem", opacity: connecting ? 0.7 : 1,
                        transition: "all 0.2s ease",
                      }}
                    >
                      {connecting ? (
                        "⏳ Connecting..."
                      ) : (
                        <>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                            <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.258-.168-2.836.744.744-2.836-.168-.258A8 8 0 1112 20z"/>
                          </svg>
                          Connect with WhatsApp
                        </>
                      )}
                    </button>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center", marginTop: "0.75rem" }}>
                      One-click setup via Meta&apos;s official Embedded Signup
                    </p>
                  </div>
                )}

                {/* Divider */}
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>or connect manually</span>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                </div>

                {/* Manual Toggle */}
                <button onClick={() => setManualMode(!manualMode)} style={{
                  width: "100%", padding: "0.75rem", background: "var(--bg-tertiary)", border: "1px solid var(--border)",
                  borderRadius: "8px", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.9rem",
                }}>
                  {manualMode ? "▼ Hide Manual Setup" : "▶ Manual Setup (API credentials)"}
                </button>
              </div>

              {/* Manual Mode Form */}
              {manualMode && (
                <div className="glass-card" style={{ padding: "2rem" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem" }}>🔧 Manual Connection</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    <div>
                      <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem", fontWeight: 600 }}>
                        Phone Number ID *
                      </label>
                      <input type="text" value={manualPhoneId} onChange={(e) => setManualPhoneId(e.target.value)} placeholder="e.g., 123456789012345" style={inputStyle} />
                      <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: "0.25rem" }}>Found in Meta Business → WhatsApp → API Setup</p>
                    </div>
                    <div>
                      <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem", fontWeight: 600 }}>
                        Access Token *
                      </label>
                      <input type="password" value={manualToken} onChange={(e) => setManualToken(e.target.value)} placeholder="Your permanent access token" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: "block", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "0.5rem", fontWeight: 600 }}>
                        Business Account ID (optional)
                      </label>
                      <input type="text" value={manualWabaId} onChange={(e) => setManualWabaId(e.target.value)} placeholder="e.g., 123456789012345" style={inputStyle} />
                    </div>
                    <button onClick={handleManualConnect} disabled={connecting} style={{
                      padding: "0.75rem", background: "var(--gradient-primary)", border: "none",
                      borderRadius: "8px", color: "white", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem",
                    }}>
                      {connecting ? "⏳ Connecting..." : "🔗 Connect Manually"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

```


## src/app/globals.css
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

:root {
  /* ── Brand Colors ── */
  --primary: #6C5CE7;
  --primary-light: #A29BFE;
  --primary-dark: #4834D4;
  --primary-glow: rgba(108, 92, 231, 0.3);

  --accent: #00D2FF;
  --accent-light: #72EFDD;
  --accent-dark: #0099CC;

  --success: #00B894;
  --warning: #FDCB6E;
  --danger: #FF6B6B;
  --info: #74B9FF;

  /* ── Backgrounds ── */
  --bg-primary: #0A0A1A;
  --bg-secondary: #12122A;
  --bg-tertiary: #1E1E40;
  --bg-card: #1A1A3E;
  --bg-card-hover: #222255;
  --bg-elevated: #252550;
  --bg-glass: rgba(26, 26, 62, 0.7);

  /* ── Text ── */
  --text-primary: #FFFFFF;
  --text-secondary: #B8B8D4;
  --text-muted: #6C6C8A;
  --text-accent: #A29BFE;

  /* ── Borders ── */
  --border: rgba(255, 255, 255, 0.06);
  --border-light: rgba(255, 255, 255, 0.12);
  --border-accent: rgba(108, 92, 231, 0.3);

  /* ── Shadows ── */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 24px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 48px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 30px rgba(108, 92, 231, 0.2);
  --shadow-glow-accent: 0 0 30px rgba(0, 210, 255, 0.15);

  /* ── Gradients ── */
  --gradient-primary: linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%);
  --gradient-accent: linear-gradient(135deg, #00D2FF 0%, #72EFDD 100%);
  --gradient-hero: linear-gradient(180deg, #0A0A1A 0%, #12122A 50%, #1A1A3E 100%);
  --gradient-card: linear-gradient(145deg, rgba(26, 26, 62, 0.8) 0%, rgba(18, 18, 42, 0.8) 100%);
  --gradient-mesh: radial-gradient(ellipse at 20% 50%, rgba(108, 92, 231, 0.08) 0%, transparent 50%),
                   radial-gradient(ellipse at 80% 20%, rgba(0, 210, 255, 0.06) 0%, transparent 50%),
                   radial-gradient(ellipse at 50% 80%, rgba(162, 155, 254, 0.04) 0%, transparent 50%);

  /* ── Spacing ── */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* ── Transitions ── */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 400ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* ══════════════════════════════════════ */
/* RESET & BASE                          */
/* ══════════════════════════════════════ */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
}

a {
  color: inherit;
  text-decoration: none;
}

button {
  cursor: pointer;
  font-family: inherit;
  border: none;
  outline: none;
}

input, textarea, select {
  font-family: inherit;
  outline: none;
}

/* ══════════════════════════════════════ */
/* UTILITY CLASSES                       */
/* ══════════════════════════════════════ */

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

.container-wide {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
}

/* ── Text ── */
.text-gradient {
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.text-gradient-accent {
  background: var(--gradient-accent);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── Glass Card ── */
.glass-card {
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  transition: all var(--transition-base);
}

.card:hover {
  border-color: var(--border-accent);
  box-shadow: var(--shadow-glow);
  transform: translateY(-2px);
}

/* ── Buttons ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 600;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.btn-primary {
  background: var(--gradient-primary);
  color: white;
  box-shadow: 0 4px 16px rgba(108, 92, 231, 0.3);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(108, 92, 231, 0.4);
}

.btn-secondary {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-light);
}

.btn-secondary:hover {
  background: var(--bg-card);
  border-color: var(--primary-light);
}

.btn-accent {
  background: var(--gradient-accent);
  color: var(--bg-primary);
  font-weight: 700;
}

.btn-accent:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0, 210, 255, 0.3);
}

.btn-lg {
  padding: 16px 36px;
  font-size: 17px;
  border-radius: var(--radius-lg);
}

.btn-sm {
  padding: 8px 16px;
  font-size: 13px;
}

/* ── Input ── */
.input {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 15px;
  transition: all var(--transition-fast);
}

.input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-glow);
}

.input::placeholder {
  color: var(--text-muted);
}

/* ── Badge ── */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.badge-primary {
  background: rgba(108, 92, 231, 0.15);
  color: var(--primary-light);
}

.badge-success {
  background: rgba(0, 184, 148, 0.15);
  color: var(--success);
}

.badge-warning {
  background: rgba(253, 203, 110, 0.15);
  color: var(--warning);
}

.badge-danger {
  background: rgba(255, 107, 107, 0.15);
  color: var(--danger);
}

/* ── Animations ── */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideIn {
  from { transform: translateX(-20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}

@keyframes glow {
  0%, 100% { box-shadow: 0 0 20px rgba(108, 92, 231, 0.2); }
  50% { box-shadow: 0 0 40px rgba(108, 92, 231, 0.4); }
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.animate-fade-in-up {
  animation: fadeInUp 0.6s ease-out forwards;
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

/* ── Stagger delays ── */
.delay-100 { animation-delay: 100ms; }
.delay-200 { animation-delay: 200ms; }
.delay-300 { animation-delay: 300ms; }
.delay-400 { animation-delay: 400ms; }
.delay-500 { animation-delay: 500ms; }

/* ── Scrollbar ── */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-primary);
}
::-webkit-scrollbar-thumb {
  background: var(--bg-elevated);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--primary-dark);
}

/* ── Selection ── */
::selection {
  background: var(--primary);
  color: white;
}

```


## src/app/layout.tsx
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Bolt — AI-Powered WhatsApp Automation for Businesses",
  description: "Automate customer conversations, capture leads, and grow revenue with AI-powered WhatsApp bots. Built for restaurants, hotels, and hospitality businesses.",
  keywords: ["WhatsApp automation", "AI chatbot", "business automation", "lead generation", "WhatsApp API"],
  openGraph: {
    title: "Project Bolt — AI-Powered WhatsApp Automation",
    description: "Turn WhatsApp into your smartest employee. AI-powered conversations that book tables, capture leads, and never sleep.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

```


## src/app/login/page.tsx
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) { setError("Supabase not configured yet. Set env vars first."); return; }
    setLoading(true);
    setError("");

    const supabase = createBrowserSupabaseClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  async function handleGoogleLogin() {
    if (!isSupabaseConfigured) { setError("Supabase not configured yet. Set env vars first."); return; }
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard` },
    });
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--gradient-hero)", position: "relative",
    }}>
      {/* Background mesh */}
      <div style={{ position: "absolute", inset: 0, background: "var(--gradient-mesh)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: "440px", padding: "24px" }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center", marginBottom: "40px" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "12px",
            background: "var(--gradient-primary)", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: "20px"
          }}>⚡</div>
          <span style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px" }}>
            Project <span className="text-gradient">Bolt</span>
          </span>
        </Link>

        {/* Card */}
        <div className="glass-card" style={{ padding: "36px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px", textAlign: "center" }}>
            Welcome back
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", textAlign: "center", marginBottom: "32px" }}>
            Log in to your dashboard
          </p>

          {/* Google OAuth */}
          <button
            onClick={handleGoogleLogin}
            className="btn btn-secondary"
            style={{ width: "100%", marginBottom: "24px", padding: "14px" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{
            display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px",
          }}>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>or</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>
                Email
              </label>
              <input
                type="email" className="input" placeholder="you@business.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required
              />
            </div>
            <div>
              <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>
                Password
              </label>
              <input
                type="password" className="input" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} required
              />
            </div>

            {error && (
              <div style={{
                background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)",
                borderRadius: "var(--radius-md)", padding: "10px 14px",
                fontSize: "13px", color: "var(--danger)",
              }}>{error}</div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: "14px" }} disabled={loading}>
              {loading ? "Logging in..." : "Log In"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: "24px", fontSize: "14px", color: "var(--text-secondary)" }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" style={{ color: "var(--primary-light)", fontWeight: 600 }}>
              Start free trial
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

```


## src/app/onboard/page.tsx
```tsx
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import { PLAN_DETAILS } from "@/lib/types";

// ═══════════════════════════════════════
// 🚀 Onboarding Wizard
// ═══════════════════════════════════════
// A guided setup for new users to complete their profile,
// connect WhatsApp, and configure their AI bot.
// ═══════════════════════════════════════

declare global {
  interface Window {
    FB?: {
      init: (config: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        config: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || "";
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID || "";

const BUSINESS_TYPES = ["Restaurant", "Cafe", "Hotel", "Lounge", "Bar", "Cloud Kitchen", "Event Venue", "Salon", "Spa", "Clinic", "Real Estate", "E-Commerce", "Other"];

function OnboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email");
  const nameParam = searchParams.get("name");

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Business
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("Restaurant");
  const [selectedPlan, setSelectedPlan] = useState("starter");

  // Step 2: WhatsApp
  const [connectingWA, setConnectingWA] = useState(false);
  const [waConnected, setWaConnected] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Step 3: Bot Settings
  const [botName, setBotName] = useState("Assistant");
  const [botPersonality, setBotPersonality] = useState("friendly and professional");
  const [botMessage, setBotMessage] = useState("Welcome to {business_name}! 🙏 How can I help you today?");

  useEffect(() => {
    if (!META_APP_ID) return;
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: true,
        version: "v21.0",
      });
      setSdkLoaded(true);
    };
  }, []);

  async function handleCreateTenant() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, businessType, plan: selectedPlan }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to create tenant");
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleEmbeddedSignup() {
    if (!window.FB) {
      setError("Facebook SDK not loaded. Please try again later.");
      return;
    }

    setConnectingWA(true);
    setError("");

    window.FB.login(
      async (response) => {
        if (!response.authResponse?.code) {
          setConnectingWA(false);
          setError("Login was cancelled or failed.");
          return;
        }

        try {
          const res = await fetch("/api/whatsapp/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: response.authResponse.code }),
          });

          const data = await res.json();
          if (data.success) {
            setWaConnected(true);
            setTimeout(() => setStep(3), 1500);
          } else {
            setError(data.error || "Connection failed");
          }
        } catch {
          setError("Network error. Please try again.");
        } finally {
          setConnectingWA(false);
        }
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      }
    );
  }

  async function handleSaveBot() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_name: botName,
          bot_personality: botPersonality,
          welcome_message: botMessage,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to save settings");
      
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--gradient-hero)", position: "relative",
    }}>
      {META_APP_ID && (
        <Script
          src="https://connect.facebook.net/en_US/sdk.js"
          strategy="lazyOnload"
          onLoad={() => { if (window.fbAsyncInit) window.fbAsyncInit(); }}
        />
      )}

      <div style={{ position: "absolute", inset: 0, background: "var(--gradient-mesh)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: "600px", padding: "24px" }}>
        {/* Progress */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
          {[1, 2, 3].map((s) => (
            <div key={s} style={{
              flex: 1, height: "4px", borderRadius: "2px",
              background: s <= step ? "var(--primary)" : "var(--border)",
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        <div className="glass-card" style={{ padding: "40px" }}>
          
          {/* STEP 1: BUSINESS DETAILS */}
          {step === 1 && (
            <>
              <div style={{ textAlign: "center", marginBottom: "32px" }}>
                <div style={{ fontSize: "3rem", marginBottom: "16px" }}>👋</div>
                <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>Welcome, {nameParam?.split(' ')[0] || 'there'}!</h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>Let&apos;s set up your workspace to get started.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Business Name</label>
                  <input className="input" placeholder="e.g., The Royal Terrace" value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={{ padding: "12px 16px" }} />
                </div>
                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Business Type</label>
                  <select className="input" value={businessType} onChange={(e) => setBusinessType(e.target.value)} style={{ padding: "12px 16px" }}>
                    {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Select Plan</label>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {(["starter", "growth"] as const).map((planKey) => {
                      const plan = PLAN_DETAILS[planKey];
                      return (
                        <button key={planKey} onClick={() => setSelectedPlan(planKey)} style={{
                          flex: 1, padding: "16px", borderRadius: "12px", textAlign: "left", cursor: "pointer",
                          background: selectedPlan === planKey ? "rgba(108,92,231,0.1)" : "var(--bg-tertiary)",
                          border: `2px solid ${selectedPlan === planKey ? "var(--primary)" : "var(--border)"}`,
                          transition: "all 0.2s"
                        }}>
                          <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: "4px" }}>{plan.name}</div>
                          <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px" }}>{plan.features[0]}</div>
                          <div style={{ fontWeight: 800, color: "var(--text-primary)" }}>₹{plan.price.toLocaleString()}/mo</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {error && <div style={{ color: "var(--danger)", fontSize: "14px", background: "rgba(255,107,107,0.1)", padding: "12px", borderRadius: "8px" }}>❌ {error}</div>}

                <button className="btn btn-primary" style={{ padding: "16px", fontSize: "16px", marginTop: "12px" }} onClick={handleCreateTenant} disabled={loading || !businessName}>
                  {loading ? "Saving..." : "Continue →"}
                </button>
              </div>
            </>
          )}

          {/* STEP 2: WHATSAPP CONNECT */}
          {step === 2 && (
            <>
              <div style={{ textAlign: "center", marginBottom: "32px" }}>
                <div style={{ fontSize: "3rem", marginBottom: "16px" }}>📱</div>
                <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>Connect WhatsApp</h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>Link your WhatsApp Business account to your bot.</p>
              </div>

              {waConnected ? (
                <div style={{ textAlign: "center", padding: "32px", background: "rgba(0,184,148,0.1)", border: "1px solid rgba(0,184,148,0.3)", borderRadius: "12px" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "16px" }}>✅</div>
                  <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#00B894", marginBottom: "8px" }}>Successfully Connected!</h2>
                  <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Moving to the next step...</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ background: "var(--bg-tertiary)", padding: "20px", borderRadius: "12px", fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <li>You need a Meta Developer account</li>
                      <li>A valid WhatsApp Business number</li>
                      <li>Meta business verification (optional for sandbox)</li>
                    </ul>
                  </div>

                  {error && <div style={{ color: "var(--danger)", fontSize: "14px", background: "rgba(255,107,107,0.1)", padding: "12px", borderRadius: "8px" }}>❌ {error}</div>}

                  <button 
                    onClick={handleEmbeddedSignup} 
                    disabled={connectingWA || !sdkLoaded || !META_APP_ID}
                    style={{
                      width: "100%", padding: "16px", background: "#25D366", border: "none",
                      borderRadius: "12px", color: "white", fontWeight: 700, fontSize: "16px",
                      cursor: connectingWA ? "wait" : "pointer", display: "flex", alignItems: "center",
                      justifyContent: "center", gap: "12px", opacity: connectingWA || !sdkLoaded ? 0.7 : 1,
                    }}
                  >
                    {connectingWA ? "⏳ Connecting..." : "Connect with Meta"}
                  </button>

                  <button onClick={() => setStep(3)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "14px", marginTop: "8px" }}>
                    Skip for now (I&apos;ll do this later)
                  </button>
                </div>
              )}
            </>
          )}

          {/* STEP 3: BOT SETUP */}
          {step === 3 && (
            <>
              <div style={{ textAlign: "center", marginBottom: "32px" }}>
                <div style={{ fontSize: "3rem", marginBottom: "16px" }}>🤖</div>
                <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>Personalize Your Bot</h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>Give your AI assistant a personality.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Bot Name</label>
                  <input className="input" placeholder="e.g., Maya, Aria, Assistant" value={botName} onChange={(e) => setBotName(e.target.value)} style={{ padding: "12px 16px" }} />
                </div>
                
                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Bot Personality</label>
                  <select className="input" value={botPersonality} onChange={(e) => setBotPersonality(e.target.value)} style={{ padding: "12px 16px" }}>
                    <option value="professional">Professional & Formal</option>
                    <option value="friendly and professional">Friendly & Approachable</option>
                    <option value="casual and fun">Casual & Fun</option>
                    <option value="elegant and exclusive">Elegant & Luxurious</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "block" }}>Welcome Message</label>
                  <textarea className="input" value={botMessage} onChange={(e) => setBotMessage(e.target.value)} rows={3} style={{ padding: "12px 16px", resize: "vertical" }} />
                </div>

                {error && <div style={{ color: "var(--danger)", fontSize: "14px", background: "rgba(255,107,107,0.1)", padding: "12px", borderRadius: "8px" }}>❌ {error}</div>}

                <button className="btn btn-accent" style={{ padding: "16px", fontSize: "16px", marginTop: "12px" }} onClick={handleSaveBot} disabled={loading}>
                  {loading ? "Finishing up..." : "Complete Setup 🎉"}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

export default function OnboardPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gradient-hero)" }}><div className="spinner">Loading...</div></div>}>
      <OnboardContent />
    </Suspense>
  );
}

```


## src/app/page.tsx
```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ═══════════════════════════════════════
// Navbar
// ═══════════════════════════════════════
function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: "16px 0",
        transition: "all 0.3s",
        background: scrolled ? "rgba(10, 10, 26, 0.9)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
      }}
    >
      <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: 36, height: 36, borderRadius: "10px",
            background: "var(--gradient-primary)", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: "18px"
          }}>⚡</div>
          <span style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.5px" }}>
            Project <span className="text-gradient">Bolt</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <a href="#features" style={{ color: "var(--text-secondary)", fontSize: "14px", fontWeight: 500, transition: "color 0.2s" }}>Features</a>
          <a href="#pricing" style={{ color: "var(--text-secondary)", fontSize: "14px", fontWeight: 500 }}>Pricing</a>
          <a href="#how-it-works" style={{ color: "var(--text-secondary)", fontSize: "14px", fontWeight: 500 }}>How It Works</a>
          <Link href="/login" className="btn btn-secondary btn-sm">Log In</Link>
          <Link href="/signup" className="btn btn-primary btn-sm">Start Free Trial</Link>
        </div>
      </div>
    </nav>
  );
}

// ═══════════════════════════════════════
// Hero Section
// ═══════════════════════════════════════
function Hero() {
  return (
    <section style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      position: "relative", overflow: "hidden",
      background: "var(--gradient-hero)",
    }}>
      {/* Background mesh gradient */}
      <div style={{
        position: "absolute", inset: 0, background: "var(--gradient-mesh)",
        pointerEvents: "none",
      }} />
      {/* Floating orbs */}
      <div className="animate-float" style={{
        position: "absolute", top: "15%", right: "10%", width: "300px", height: "300px",
        borderRadius: "50%", background: "radial-gradient(circle, rgba(108,92,231,0.15) 0%, transparent 70%)",
        filter: "blur(40px)", pointerEvents: "none",
      }} />
      <div className="animate-float delay-300" style={{
        position: "absolute", bottom: "20%", left: "5%", width: "250px", height: "250px",
        borderRadius: "50%", background: "radial-gradient(circle, rgba(0,210,255,0.1) 0%, transparent 70%)",
        filter: "blur(40px)", pointerEvents: "none",
      }} />

      <div className="container" style={{ position: "relative", zIndex: 2, textAlign: "center", paddingTop: "80px" }}>
        {/* Badge */}
        <div className="animate-fade-in-up" style={{ marginBottom: "24px" }}>
          <span className="badge badge-primary" style={{ padding: "6px 16px", fontSize: "13px" }}>
            🚀 AI-Powered WhatsApp Automation
          </span>
        </div>

        {/* Headline */}
        <h1 className="animate-fade-in-up delay-100" style={{
          fontSize: "clamp(36px, 5vw, 72px)", fontWeight: 900,
          lineHeight: 1.1, maxWidth: "900px", margin: "0 auto 24px",
          letterSpacing: "-2px",
        }}>
          Turn WhatsApp Into Your{" "}
          <span className="text-gradient">Smartest Employee</span>
        </h1>

        {/* Subheadline */}
        <p className="animate-fade-in-up delay-200" style={{
          fontSize: "clamp(16px, 2vw, 20px)", color: "var(--text-secondary)",
          maxWidth: "640px", margin: "0 auto 40px", lineHeight: 1.7,
        }}>
          AI conversations that book tables, capture leads, recover abandoned carts, and follow up automatically.
          Your bot understands Hindi, English, and Hinglish — naturally.
        </p>

        {/* CTA Buttons */}
        <div className="animate-fade-in-up delay-300" style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="btn btn-accent btn-lg" style={{ minWidth: "220px" }}>
            Start Free 14-Day Trial →
          </Link>
          <a href="#how-it-works" className="btn btn-secondary btn-lg" style={{ minWidth: "180px" }}>
            See How It Works
          </a>
        </div>

        {/* Social proof */}
        <div className="animate-fade-in-up delay-400" style={{
          marginTop: "48px", display: "flex", justifyContent: "center", gap: "40px",
          flexWrap: "wrap", color: "var(--text-muted)", fontSize: "14px",
        }}>
          <div>✅ No credit card required</div>
          <div>⚡ Setup in 5 minutes</div>
          <div>🤖 AI that speaks your language</div>
        </div>

        {/* Dashboard preview */}
        <div className="animate-fade-in-up delay-500" style={{
          marginTop: "64px", borderRadius: "var(--radius-xl)",
          border: "1px solid var(--border-light)",
          background: "var(--gradient-card)", padding: "4px",
          boxShadow: "var(--shadow-lg), var(--shadow-glow)",
          maxWidth: "1000px", margin: "64px auto 0",
        }}>
          <div style={{
            background: "var(--bg-card)", borderRadius: "20px",
            padding: "40px", minHeight: "400px",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-muted)", fontSize: "16px",
            position: "relative", overflow: "hidden",
          }}>
            <DashboardPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardPreview() {
  return (
    <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
      {[
        { label: "Active Leads", value: "1,247", change: "+23%", color: "var(--primary-light)" },
        { label: "Messages Today", value: "3,892", change: "+18%", color: "var(--accent)" },
        { label: "Bookings", value: "156", change: "+31%", color: "var(--success)" },
        { label: "Revenue Impact", value: "₹4.2L", change: "+45%", color: "var(--warning)" },
      ].map((stat, i) => (
        <div key={i} style={{
          background: "var(--bg-secondary)", borderRadius: "var(--radius-md)",
          padding: "20px", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>{stat.label}</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: stat.color }}>{stat.value}</div>
          <div style={{ fontSize: "12px", color: "var(--success)", marginTop: "4px" }}>↑ {stat.change}</div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════
// Features Section
// ═══════════════════════════════════════
function Features() {
  const features = [
    { icon: "🧠", title: "AI That Actually Understands", desc: "Not rigid chatbot flows. Real AI that understands 'bhai kal 4 logo ke liye table milega kya' — in Hindi, English, or Hinglish.", color: "var(--primary)" },
    { icon: "📲", title: "WhatsApp Cloud API", desc: "Direct Meta integration. No middlemen, no extra fees. Your customers message you, AI replies instantly.", color: "var(--accent)" },
    { icon: "📊", title: "Lead Pipeline", desc: "Every conversation automatically scored and categorized. See hot leads, warm leads, and follow-up reminders.", color: "var(--success)" },
    { icon: "⏰", title: "Smart Follow-Ups", desc: "AI-written follow-up messages sent at the perfect time. 30 min, 3 hours, 24 hours — configurable per business.", color: "var(--warning)" },
    { icon: "🛒", title: "Shopify Integration", desc: "Order confirmations via WhatsApp. Abandoned cart recovery. Increase your store revenue by 15-30%.", color: "var(--danger)" },
    { icon: "🔔", title: "Staff Alerts", desc: "Hot lead detected? Staff gets an instant WhatsApp alert. Customer escalation? Manager notified in seconds.", color: "var(--info)" },
  ];

  return (
    <section id="features" style={{ padding: "120px 0", background: "var(--bg-secondary)" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <span className="badge badge-primary" style={{ marginBottom: "16px" }}>Features</span>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 48px)", fontWeight: 800, letterSpacing: "-1px", marginTop: "12px" }}>
            Everything You Need to <span className="text-gradient">Automate Sales</span>
          </h2>
          <p style={{ color: "var(--text-secondary)", maxWidth: "560px", margin: "16px auto 0", fontSize: "17px" }}>
            Built specifically for restaurants, hotels, and hospitality businesses.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "24px" }}>
          {features.map((f, i) => (
            <div key={i} className="card" style={{ padding: "32px" }}>
              <div style={{
                width: "48px", height: "48px", borderRadius: "var(--radius-md)",
                background: `${f.color}15`, display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: "24px", marginBottom: "20px",
              }}>{f.icon}</div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>{f.title}</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════
// How It Works
// ═══════════════════════════════════════
function HowItWorks() {
  const steps = [
    { num: "01", title: "Sign Up & Connect", desc: "Create your account in 2 minutes. Connect your WhatsApp Business number with one click." },
    { num: "02", title: "Configure Your Bot", desc: "Tell us about your business — name, type, offers. AI creates your custom bot personality instantly." },
    { num: "03", title: "Go Live", desc: "Your AI assistant starts handling customer conversations immediately. You monitor leads from your dashboard." },
    { num: "04", title: "Watch Revenue Grow", desc: "AI captures leads 24/7, follows up automatically, and books tables while you sleep." },
  ];

  return (
    <section id="how-it-works" style={{ padding: "120px 0" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <span className="badge badge-primary" style={{ marginBottom: "16px" }}>How It Works</span>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 48px)", fontWeight: 800, letterSpacing: "-1px", marginTop: "12px" }}>
            Live in <span className="text-gradient-accent">5 Minutes</span>
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "32px", maxWidth: "1000px", margin: "0 auto" }}>
          {steps.map((step, i) => (
            <div key={i} style={{ textAlign: "center", position: "relative" }}>
              <div style={{
                width: "64px", height: "64px", borderRadius: "50%",
                background: "var(--gradient-primary)", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: "20px", fontWeight: 800, margin: "0 auto 20px",
                boxShadow: "var(--shadow-glow)",
              }}>{step.num}</div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "10px" }}>{step.title}</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.7 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════
// Pricing Section
// ═══════════════════════════════════════
function Pricing() {
  const plans = [
    {
      name: "Starter", price: "2,499", period: "/mo",
      desc: "Perfect for single outlets",
      features: ["1 WhatsApp number", "AI-powered conversations", "1,000 conversations/mo", "Lead dashboard", "Email support"],
      popular: false, cta: "Start Free Trial",
    },
    {
      name: "Growth", price: "4,999", period: "/mo",
      desc: "For growing businesses",
      features: ["Everything in Starter", "5,000 conversations/mo", "Shopify integration", "Smart follow-ups", "Advanced analytics", "Priority support"],
      popular: true, cta: "Start Free Trial",
    },
    {
      name: "Pro", price: "9,999", period: "/mo",
      desc: "For serious businesses",
      features: ["Everything in Growth", "Unlimited conversations", "Custom AI personality", "Green tick assistance", "Instagram automation", "Dedicated support"],
      popular: false, cta: "Start Free Trial",
    },
  ];

  return (
    <section id="pricing" style={{ padding: "120px 0", background: "var(--bg-secondary)" }}>
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <span className="badge badge-primary" style={{ marginBottom: "16px" }}>Pricing</span>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 48px)", fontWeight: 800, letterSpacing: "-1px", marginTop: "12px" }}>
            Simple, <span className="text-gradient">Transparent</span> Pricing
          </h2>
          <p style={{ color: "var(--text-secondary)", maxWidth: "560px", margin: "16px auto 0", fontSize: "17px" }}>
            14-day free trial. No credit card required. Cancel anytime.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px", maxWidth: "1000px", margin: "0 auto" }}>
          {plans.map((plan, i) => (
            <div key={i} className="card" style={{
              padding: "36px",
              border: plan.popular ? "2px solid var(--primary)" : undefined,
              boxShadow: plan.popular ? "var(--shadow-glow)" : undefined,
              position: "relative",
            }}>
              {plan.popular && (
                <div style={{
                  position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)",
                  background: "var(--gradient-primary)", padding: "4px 20px",
                  borderRadius: "var(--radius-full)", fontSize: "12px", fontWeight: 700,
                }}>MOST POPULAR</div>
              )}
              <h3 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>{plan.name}</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "20px" }}>{plan.desc}</p>
              <div style={{ marginBottom: "24px" }}>
                <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>₹</span>
                <span style={{ fontSize: "48px", fontWeight: 900, letterSpacing: "-2px" }}>{plan.price}</span>
                <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>{plan.period}</span>
              </div>
              <Link href="/signup" className={`btn ${plan.popular ? "btn-primary" : "btn-secondary"}`} style={{ width: "100%", marginBottom: "24px" }}>
                {plan.cta}
              </Link>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
                {plan.features.map((feat, j) => (
                  <li key={j} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--success)", fontSize: "14px" }}>✓</span>
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", marginTop: "32px", color: "var(--text-muted)", fontSize: "14px" }}>
          * WhatsApp message fees are charged directly by Meta to your business account. We don&apos;t add any markup.
        </p>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════
// CTA Section
// ═══════════════════════════════════════
function CTA() {
  return (
    <section style={{ padding: "120px 0" }}>
      <div className="container">
        <div style={{
          background: "var(--gradient-card)", borderRadius: "var(--radius-xl)",
          padding: "80px 48px", textAlign: "center", position: "relative",
          overflow: "hidden", border: "1px solid var(--border-light)",
        }}>
          <div style={{
            position: "absolute", inset: 0, background: "var(--gradient-mesh)",
            pointerEvents: "none",
          }} />
          <div style={{ position: "relative", zIndex: 2 }}>
            <h2 style={{ fontSize: "clamp(28px, 3vw, 44px)", fontWeight: 800, marginBottom: "16px", letterSpacing: "-1px" }}>
              Ready to Automate Your Business?
            </h2>
            <p style={{ color: "var(--text-secondary)", maxWidth: "500px", margin: "0 auto 32px", fontSize: "17px" }}>
              Join 100+ businesses already using AI to handle customer conversations 24/7.
            </p>
            <Link href="/signup" className="btn btn-accent btn-lg">
              Start Your Free Trial →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════
// Footer
// ═══════════════════════════════════════
function Footer() {
  return (
    <footer style={{
      padding: "48px 0", borderTop: "1px solid var(--border)",
      background: "var(--bg-secondary)",
    }}>
      <div className="container" style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: 28, height: 28, borderRadius: "8px",
            background: "var(--gradient-primary)", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: "14px"
          }}>⚡</div>
          <span style={{ fontWeight: 700, fontSize: "15px" }}>Project Bolt</span>
        </div>
        <div style={{ display: "flex", gap: "24px", fontSize: "13px", color: "var(--text-muted)" }}>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Support</a>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          © 2026 Project Bolt. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════
// PAGE
// ═══════════════════════════════════════
export default function LandingPage() {
  return (
    <main>
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
}

```


## src/app/signup/page.tsx
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { PLAN_DETAILS } from "@/lib/types";

type Step = 1 | 2 | 3;

export default function SignupPage() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1 fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Step 2 fields
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("Restaurant");

  // Step 3 fields
  const [selectedPlan, setSelectedPlan] = useState("starter");

  async function handleGoogleSignup() {
    if (!isSupabaseConfigured) { setError("Supabase not configured yet. Set env vars first."); return; }
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=/onboard` },
    });
  }

  async function handleSubmit() {
    if (!isSupabaseConfigured) { setError("Supabase not configured yet. Set env vars first."); return; }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password, fullName, businessName, businessType, plan: selectedPlan,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Sign in the user
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signInWithPassword({ email, password });
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
      setLoading(false);
    }
  }

  const businessTypes = ["Restaurant", "Cafe", "Hotel", "Lounge", "Bar", "Cloud Kitchen", "Event Venue", "Salon", "Spa", "Clinic", "Real Estate", "E-Commerce", "Other"];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--gradient-hero)", position: "relative",
    }}>
      <div style={{ position: "absolute", inset: 0, background: "var(--gradient-mesh)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: "500px", padding: "24px" }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center", marginBottom: "40px" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "12px",
            background: "var(--gradient-primary)", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: "20px"
          }}>⚡</div>
          <span style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px" }}>
            Project <span className="text-gradient">Bolt</span>
          </span>
        </Link>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "32px" }}>
          {[1, 2, 3].map((s) => (
            <div key={s} style={{
              flex: 1, height: "4px", borderRadius: "2px",
              background: s <= step ? "var(--primary)" : "var(--border)",
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        <div className="glass-card" style={{ padding: "36px" }}>
          {/* Step 1: Account */}
          {step === 1 && (
            <>
              <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>Create your account</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "28px" }}>
                Start your 14-day free trial. No credit card needed.
              </p>

              <button onClick={handleGoogleSignup} className="btn btn-secondary" style={{ width: "100%", marginBottom: "24px", padding: "14px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Sign up with Google
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
                <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase" }}>or</span>
                <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>Full Name</label>
                  <input className="input" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>Email</label>
                  <input className="input" type="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>Password</label>
                  <input className="input" type="password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <button className="btn btn-primary" style={{ width: "100%", padding: "14px" }}
                  onClick={() => { if (email && password && fullName) setStep(2); else setError("Please fill all fields"); }}
                  disabled={!email || !password || !fullName}>
                  Continue →
                </button>
              </div>
            </>
          )}

          {/* Step 2: Business */}
          {step === 2 && (
            <>
              <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>Tell us about your business</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "28px" }}>
                We&apos;ll customize your AI assistant based on this.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>Business Name</label>
                  <input className="input" placeholder="e.g., The Royal Terrace" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500, marginBottom: "6px", display: "block" }}>Business Type</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                    {businessTypes.map((type) => (
                      <button key={type} onClick={() => setBusinessType(type)}
                        style={{
                          padding: "10px 8px", borderRadius: "var(--radius-md)", fontSize: "13px",
                          background: businessType === type ? "var(--primary)" : "var(--bg-secondary)",
                          color: businessType === type ? "white" : "var(--text-secondary)",
                          border: `1px solid ${businessType === type ? "var(--primary)" : "var(--border)"}`,
                          transition: "all 0.2s", fontWeight: businessType === type ? 600 : 400,
                        }}>{type}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button className="btn btn-secondary" style={{ flex: 1, padding: "14px" }} onClick={() => setStep(1)}>← Back</button>
                  <button className="btn btn-primary" style={{ flex: 2, padding: "14px" }}
                    onClick={() => { if (businessName) setStep(3); }}
                    disabled={!businessName}>
                    Continue →
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Plan */}
          {step === 3 && (
            <>
              <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>Choose your plan</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "28px" }}>
                Start free for 14 days. Upgrade or cancel anytime.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {(["starter", "growth", "pro"] as const).map((planKey) => {
                  const plan = PLAN_DETAILS[planKey];
                  const isSelected = selectedPlan === planKey;
                  return (
                    <button key={planKey} onClick={() => setSelectedPlan(planKey)}
                      style={{
                        padding: "16px 20px", borderRadius: "var(--radius-md)", textAlign: "left",
                        background: isSelected ? "rgba(108,92,231,0.1)" : "var(--bg-secondary)",
                        border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                        transition: "all 0.2s", display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-primary)" }}>
                          {plan.name} {planKey === "growth" && <span className="badge badge-primary" style={{ fontSize: "10px", marginLeft: "8px" }}>POPULAR</span>}
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>
                          {plan.features.slice(0, 2).join(" · ")}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)" }}>₹{plan.price.toLocaleString()}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>/month</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div style={{
                  background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)",
                  borderRadius: "var(--radius-md)", padding: "10px 14px", marginTop: "16px",
                  fontSize: "13px", color: "var(--danger)",
                }}>{error}</div>
              )}

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button className="btn btn-secondary" style={{ flex: 1, padding: "14px" }} onClick={() => setStep(2)}>← Back</button>
                <button className="btn btn-accent" style={{ flex: 2, padding: "14px" }}
                  onClick={handleSubmit} disabled={loading}>
                  {loading ? "Creating your account..." : "Start Free Trial 🚀"}
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <p style={{ textAlign: "center", marginTop: "24px", fontSize: "14px", color: "var(--text-secondary)" }}>
              Already have an account?{" "}
              <Link href="/login" style={{ color: "var(--primary-light)", fontWeight: 600 }}>Log in</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

```


## src/instrumentation.ts
```ts
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const required = [
      'ENCRYPTION_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'PLATFORM_ADMIN_EMAIL',
      'CRON_SECRET',
    ];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `FATAL: Missing required environment variables: ${missing.join(', ')}. Deployment aborted.`
      );
    }
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;

```


## src/lib/ai/engine.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🧠 AI Conversation Engine — Gemini-Powered
// ═══════════════════════════════════════════════════════════
// This is the BRAIN of the platform. Unlike AiSensy's rigid
// flow trees, this engine:
//  1. Understands natural language (Hindi, Hinglish, English)
//  2. Extracts booking intent, dates, guest counts automatically
//  3. Falls back to structured flows for reliability
//  4. Never crashes — always has a graceful fallback
// ═══════════════════════════════════════════════════════════

import { GoogleGenAI } from '@google/genai';
import type { ConversationContext } from '@/lib/types';
import * as Sentry from '@sentry/nextjs';
import { withTimeout } from '@/lib/utils/safety';
import { supabaseAdmin } from '@/lib/supabase/admin';

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return _ai;
}
const MODEL = 'gemini-2.0-flash';

// ── Response Types ──
export interface AIResponse {
  reply: string;
  extractedData: ExtractedData;
  intent: Intent;
  sentiment: Sentiment;
  shouldEscalate: boolean;
  escalationReason?: string;
  nextStep: string;
  confidence: number;
}

export interface ExtractedData {
  name?: string;
  phone?: string;
  email?: string;
  guestCount?: string;
  date?: string;
  time?: string;
  occasion?: string;
  eventType?: string;
  companyName?: string;
  specialRequests?: string;
}

export type Intent =
  | 'greeting'
  | 'reserve_table'
  | 'private_event'
  | 'corporate_booking'
  | 'gift_occasion'
  | 'general_enquiry'
  | 'pricing'
  | 'location'
  | 'timing'
  | 'menu'
  | 'complaint'
  | 'human_request'
  | 'confirm'
  | 'cancel'
  | 'thank_you'
  | 'unknown';

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'angry';

// ═══════════════════════════════════════
// SYSTEM PROMPT — The AI's Personality
// ═══════════════════════════════════════
function buildSystemPrompt(tenantConfig: TenantAIConfig): string {
  return `You are ${tenantConfig.botName}, an AI assistant for ${tenantConfig.businessName} (${tenantConfig.businessType}).

PERSONALITY: ${tenantConfig.botPersonality}. You speak naturally, use emojis sparingly, and keep responses SHORT (2-4 sentences max). You understand Hindi, Hinglish, and English.

BUSINESS INFO:
- Name: ${tenantConfig.businessName}
- Type: ${tenantConfig.businessType}
- Phone: ${tenantConfig.phone}
- Address: ${tenantConfig.address}
- Website: ${tenantConfig.website}
${tenantConfig.usps.length > 0 ? `- USPs: ${tenantConfig.usps.join(', ')}` : ''}
${tenantConfig.welcomeOffer ? `- Current Offer: ${tenantConfig.welcomeOffer}` : ''}
${tenantConfig.customFaqs && tenantConfig.customFaqs.length > 0 ? `
CUSTOM FAQ (use these to answer common questions):
${tenantConfig.customFaqs.map((faq: { question: string; answer: string }) => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n')}` : ''}

YOUR JOB:
1. Greet customers warmly
2. Understand what they want (table booking, event, enquiry, etc.)
3. Collect required info naturally through conversation (guests, date, name, phone)
4. Confirm the booking and alert staff
5. Answer general questions about the business

RULES:
- NEVER make up information you don't have
- If someone is angry or asks for a human, say you're connecting them to the team
- Keep responses under 300 characters for WhatsApp readability
- Be helpful but don't be pushy
- If you can't understand something, ask for clarification politely
- Always respond in the same language the customer is using

You must respond with ONLY a JSON object (no markdown, no backticks) in this exact format:
{
  "reply": "Your message to the customer",
  "intent": "one of: greeting, reserve_table, private_event, corporate_booking, gift_occasion, general_enquiry, pricing, location, timing, menu, complaint, human_request, confirm, cancel, thank_you, unknown",
  "sentiment": "one of: positive, neutral, negative, angry",
  "shouldEscalate": false,
  "extractedData": {
    "name": null,
    "phone": null,
    "email": null,
    "guestCount": null,
    "date": null,
    "time": null,
    "occasion": null,
    "eventType": null,
    "companyName": null,
    "specialRequests": null
  },
  "nextStep": "what info to collect next: greeting, ask_intent, ask_guests, ask_date, ask_occasion, ask_name, ask_phone, ask_email, confirmation, completed, escalated",
  "confidence": 0.95
}`;
}

export interface TenantAIConfig {
  businessName: string;
  businessType: string;
  botName: string;
  botPersonality: string;
  phone: string;
  address: string;
  website: string;
  welcomeOffer: string;
  usps: string[];
  staffName: string;
  // Fix #7: Custom FAQs
  customFaqs?: Array<{ question: string; answer: string }>;
}

// ═══════════════════════════════════════
// PROCESS MESSAGE — Main Entry Point
// ═══════════════════════════════════════
export async function processMessageWithAI(
  message: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  context: ConversationContext,
  tenantConfig: TenantAIConfig,
  tenantId?: string
): Promise<AIResponse> {
  const startTime = Date.now();

  try {
    const systemPrompt = buildSystemPrompt(tenantConfig);

    // Build message history for context
    const contents = [
      ...conversationHistory.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user' as const,
        parts: [{ text: message }],
      },
    ];

    const response = await withTimeout(
      () => getAI().models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
          maxOutputTokens: 500,
          topP: 0.9,
          responseMimeType: 'application/json',
        },
      }),
      15000 // 15 second hard circuit breaker
    );

    if (tenantId && response.usageMetadata?.totalTokenCount) {
      try {
        await supabaseAdmin.rpc('increment_ai_tokens', {
          t_id: tenantId,
          token_count: response.usageMetadata.totalTokenCount
        });
      } catch (e: unknown) {
        console.error('Failed to log tokens:', e);
      }
    }

    const text = response.text?.trim() || '';
    const latency = Date.now() - startTime;

    // Parse AI response
    const parsed = parseAIResponse(text);

    // Merge extracted data into context
    if (parsed.extractedData) {
      Object.entries(parsed.extractedData).forEach(([key, value]) => {
        if (value && value !== 'null') {
          (context as Record<string, unknown>)[key] = value;
        }
      });
    }

    console.log(`🧠 AI responded in ${latency}ms (intent: ${parsed.intent}, confidence: ${parsed.confidence})`);

    return parsed;
  } catch (error) {
    console.error('❌ AI Engine error:', error);
    Sentry.captureException(error);
    // NEVER crash — return a graceful fallback
    return getFallbackResponse(message, context, tenantConfig);
  }
}

// ═══════════════════════════════════════
// PARSE: AI Response JSON
// ═══════════════════════════════════════
function parseAIResponse(text: string): AIResponse {
  try {
    // Strip markdown code blocks if present
    let cleaned = text;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    return {
      reply: parsed.reply || "I'd love to help! Could you tell me more?",
      extractedData: parsed.extractedData || {},
      intent: parsed.intent || 'unknown',
      sentiment: parsed.sentiment || 'neutral',
      shouldEscalate: parsed.shouldEscalate || false,
      escalationReason: parsed.escalationReason,
      nextStep: parsed.nextStep || 'ask_intent',
      confidence: parsed.confidence || 0.5,
    };
  } catch {
    // If JSON parsing fails, use the raw text as the reply
    return {
      reply: text || "I'd love to help! Could you tell me what you're looking for?",
      extractedData: {},
      intent: 'unknown',
      sentiment: 'neutral',
      shouldEscalate: false,
      nextStep: 'ask_intent',
      confidence: 0.3,
    };
  }
}

// ═══════════════════════════════════════
// FALLBACK: When AI fails, use templates
// ═══════════════════════════════════════
// This ensures the bot NEVER crashes or goes silent.
function getFallbackResponse(
  message: string,
  context: ConversationContext,
  config: TenantAIConfig
): AIResponse {
  const lower = message.toLowerCase();

  // Detect angry/escalation keywords
  const angryWords = ['angry', 'upset', 'terrible', 'worst', 'complaint', 'manager', 'refund', 'fuck', 'shit'];
  const humanWords = ['human', 'real person', 'agent', 'staff', 'speak to'];

  if (angryWords.some((w) => lower.includes(w)) || humanWords.some((w) => lower.includes(w))) {
    return {
      reply: `I'm connecting you with ${config.staffName} right away 🙏 They'll be with you in a few minutes.`,
      extractedData: {},
      intent: angryWords.some((w) => lower.includes(w)) ? 'complaint' : 'human_request',
      sentiment: 'angry',
      shouldEscalate: true,
      escalationReason: 'fallback_escalation',
      nextStep: 'escalated',
      confidence: 0.9,
    };
  }

  // Detect booking intent
  if (lower.includes('book') || lower.includes('table') || lower.includes('reserv') || lower.includes('dinner') || lower.includes('dine')) {
    return {
      reply: `I'd love to help you book! 🍽️\n\nHow many guests are you expecting?\n→ 1-2 | 3-5 | 6-10 | 10+`,
      extractedData: {},
      intent: 'reserve_table',
      sentiment: 'positive',
      shouldEscalate: false,
      nextStep: 'ask_guests',
      confidence: 0.8,
    };
  }

  // Detect event intent
  if (lower.includes('event') || lower.includes('party') || lower.includes('celebration') || lower.includes('wedding')) {
    return {
      reply: `We'd love to host your event! 🎉\n\nWhat type of event are you planning?\n→ Birthday | Wedding | Corporate | Social`,
      extractedData: {},
      intent: 'private_event',
      sentiment: 'positive',
      shouldEscalate: false,
      nextStep: 'ask_intent',
      confidence: 0.8,
    };
  }

  // Detect pricing questions
  if (lower.includes('price') || lower.includes('cost') || lower.includes('rate') || lower.includes('kitna')) {
    return {
      reply: `Our pricing varies:\n\n🍽️ Dining: ₹1,500-₹3,500/person\n🎉 Events: From ₹50,000\n💼 Corporate: Custom packages\n\nWant me to connect you with our team for a detailed quote? 📞`,
      extractedData: {},
      intent: 'pricing',
      sentiment: 'neutral',
      shouldEscalate: false,
      nextStep: 'ask_intent',
      confidence: 0.8,
    };
  }

  // Default: show menu
  return {
    reply: `Hey! 👋 Welcome to ${config.businessName}!\n\nHow can I help you today?\n\n🍽️ Reserve a Table\n🎉 Plan an Event\n💼 Corporate Booking\n📋 General Enquiry`,
    extractedData: {},
    intent: 'greeting',
    sentiment: 'neutral',
    shouldEscalate: false,
    nextStep: 'ask_intent',
    confidence: 0.5,
  };
}

// ═══════════════════════════════════════
// GENERATE: AI-Written Follow-Up Message
// ═══════════════════════════════════════
export async function generateFollowUpMessage(
  context: ConversationContext,
  followUpType: string,
  tenantConfig: TenantAIConfig
): Promise<string> {
  try {
    const prompt = `Write a short, friendly WhatsApp follow-up message (under 200 chars) for a customer named "${context.name || 'there'}" who was interested in ${context.enquiry_type || 'visiting'} at ${tenantConfig.businessName}.

Follow-up type: ${followUpType}
- If "30min": Reassure them their booking is being confirmed
- If "3hr": Gently ask if they're still interested, mention limited availability
- If "24hr": Create urgency, mention a special offer or USP
- If "7day": Friendly re-engagement, share something exciting about the business

Keep it casual, use 1-2 emojis, don't be salesy. Reply with ONLY the message text, no JSON.`;

    const response = await getAI().models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.8, maxOutputTokens: 200 },
    });

    return response.text?.trim() || getDefaultFollowUp(context, followUpType, tenantConfig);
  } catch {
    return getDefaultFollowUp(context, followUpType, tenantConfig);
  }
}

function getDefaultFollowUp(
  context: ConversationContext,
  type: string,
  config: TenantAIConfig
): string {
  const name = (context.name || 'there').split(' ')[0];

  switch (type) {
    case '30min':
      return `Hey ${name}! Our team is confirming your reservation. We'll update you in 15 minutes! 🙏`;
    case '3hr':
      return `Hey ${name} 👋 Still thinking about visiting ${config.businessName}? We have limited slots this weekend 🗓️`;
    case '24hr':
      return `${name}, we'd love to see you at ${config.businessName}! ✨ ${config.welcomeOffer || 'Check out our special offers'}`;
    case '7day':
      return `Hey ${name}! Something exciting at ${config.businessName} this week 🎉 Want to know more?`;
    default:
      return `Hey ${name}! Just checking in from ${config.businessName} 👋`;
  }
}

```


## src/lib/auth/getTenantId.ts
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cacheGet, cacheSet } from '@/lib/redis/client';

export async function getTenantId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) return null;

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const cacheKey = `user_tenant:${user.id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const { data: userData } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('auth_id', user.id)
      .single();

    if (userData?.tenant_id) {
      await cacheSet(cacheKey, userData.tenant_id, 3600); // 1 hour TTL
      return userData.tenant_id;
    }
    
    return null;
  } catch {
    return null;
  }
}

```


## src/lib/billing/razorpay.ts
```ts
// ═══════════════════════════════════════════════════════════
// 💳 Razorpay Billing — Subscriptions & Webhooks
// ═══════════════════════════════════════════════════════════
// Handles plan subscriptions, payment verification, and
// webhook events (payment success, failure, cancellation).
// ═══════════════════════════════════════════════════════════

import Razorpay from 'razorpay';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_DETAILS } from '@/lib/types';
import type { Plan } from '@/lib/types';

let _razorpay: Razorpay | null = null;
export function getRazorpay(): Razorpay {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }
  return _razorpay;
}

// Razorpay plan IDs (create these in Razorpay Dashboard)
const RAZORPAY_PLAN_IDS: Record<Plan, string> = {
  starter: process.env.RAZORPAY_PLAN_STARTER || '',
  growth: process.env.RAZORPAY_PLAN_GROWTH || '',
  pro: process.env.RAZORPAY_PLAN_PRO || '',
  enterprise: '', // Custom — handled manually
};

// ═══════════════════════════════════════
// Create Subscription for a Tenant
// ═══════════════════════════════════════
export async function createSubscription(tenantId: string, plan: Plan, customerEmail: string) {
  const planId = RAZORPAY_PLAN_IDS[plan];
  if (!planId) throw new Error(`No Razorpay plan configured for: ${plan}`);

  // Create or get Razorpay customer
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('razorpay_customer_id, business_name, business_email, business_phone')
    .eq('id', tenantId)
    .single();

  let customerId = tenant?.razorpay_customer_id;

  if (!customerId) {
    const customer = await getRazorpay().customers.create({
      name: tenant?.business_name || 'Client',
      email: customerEmail || tenant?.business_email || '',
    });
    customerId = customer.id;

    await supabaseAdmin
      .from('tenants')
      .update({ razorpay_customer_id: customerId })
      .eq('id', tenantId);
  }

  // Create subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscription = await (getRazorpay().subscriptions.create as any)({
    plan_id: planId,
    total_count: 120, // 10 years of monthly billing
    customer_id: customerId,
    notify_info: {
      notify_phone: tenant?.business_phone || '',
      notify_email: customerEmail || tenant?.business_email || '',
    },
  });

  // Update tenant with subscription ID
  await supabaseAdmin
    .from('tenants')
    .update({
      razorpay_subscription_id: subscription.id,
      plan,
      plan_status: 'active',
      message_limit: PLAN_DETAILS[plan].messageLimit,
      ai_conversation_limit: PLAN_DETAILS[plan].aiConversationLimit,
    })
    .eq('id', tenantId);

  return {
    subscriptionId: subscription.id as string,
    shortUrl: subscription.short_url as string,
    status: subscription.status as string,
  };
}

// ═══════════════════════════════════════
// Verify Payment Signature
// ═══════════════════════════════════════
export function verifyPaymentSignature(
  subscriptionId: string,
  paymentId: string,
  signature: string
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET!;
  const generated = crypto
    .createHmac('sha256', secret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex');

  return generated === signature;
}

// ═══════════════════════════════════════
// Verify Webhook Signature
// ═══════════════════════════════════════
export function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
  const generated = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return generated === signature;
}

// ═══════════════════════════════════════
// Handle Webhook Events
// ═══════════════════════════════════════
export async function handleRazorpayWebhook(event: string, payload: Record<string, unknown>) {
  const entity = (payload.subscription as Record<string, unknown>) ||
                 (payload.payment as Record<string, unknown>) || {};
  const subscriptionId = (entity.id as string) || (entity.subscription_id as string);

  if (!subscriptionId) {
    console.warn('⚠️ Razorpay webhook: no subscription ID found');
    return;
  }

  // Find tenant by subscription ID
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, business_name')
    .eq('razorpay_subscription_id', subscriptionId)
    .single();

  if (!tenant) {
    console.warn(`⚠️ Razorpay webhook: no tenant for subscription ${subscriptionId}`);
    return;
  }

  switch (event) {
    case 'subscription.activated':
      await supabaseAdmin
        .from('tenants')
        .update({ plan_status: 'active' })
        .eq('id', tenant.id);
      console.log(`💳 [${tenant.business_name}] Subscription activated`);
      break;

    case 'subscription.charged':
      // Monthly payment successful — reset usage counters
      await supabaseAdmin
        .from('tenants')
        .update({
          plan_status: 'active',
          messages_used_this_month: 0,
          ai_conversations_this_month: 0,
          current_billing_period_start: new Date().toISOString(),
        })
        .eq('id', tenant.id);
      console.log(`💳 [${tenant.business_name}] Monthly payment received`);
      break;

    case 'subscription.pending':
      await supabaseAdmin
        .from('tenants')
        .update({ plan_status: 'past_due' })
        .eq('id', tenant.id);
      console.log(`⚠️ [${tenant.business_name}] Payment pending`);
      break;

    case 'subscription.halted':
    case 'subscription.cancelled':
      await supabaseAdmin
        .from('tenants')
        .update({ plan_status: 'cancelled', is_active: false })
        .eq('id', tenant.id);
      console.log(`❌ [${tenant.business_name}] Subscription cancelled`);
      break;

    default:
      console.log(`📋 Razorpay event: ${event} for ${tenant.business_name}`);
  }

  // Log the event
  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenant.id,
    event_type: `billing_${event}`,
    channel: 'razorpay',
    metadata: { event, subscription_id: subscriptionId },
  });
}

// ═══════════════════════════════════════
// Cancel Subscription
// ═══════════════════════════════════════
export async function cancelSubscription(tenantId: string) {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('razorpay_subscription_id')
    .eq('id', tenantId)
    .single();

  if (tenant?.razorpay_subscription_id) {
    await getRazorpay().subscriptions.cancel(tenant.razorpay_subscription_id);
  }

  await supabaseAdmin
    .from('tenants')
    .update({ plan_status: 'cancelled' })
    .eq('id', tenantId);
}

// ═══════════════════════════════════════
// Change Plan
// ═══════════════════════════════════════
export async function changePlan(tenantId: string, newPlan: Plan, customerEmail: string) {
  // Cancel existing subscription
  await cancelSubscription(tenantId);

  // Create new subscription with new plan
  return createSubscription(tenantId, newPlan, customerEmail);
}

```


## src/lib/broadcast/queue.ts
```ts
import { Queue, Worker, type Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantById } from '@/lib/tenant/manager';
import { sendTemplateMessage } from '@/lib/whatsapp/service';
import { sleep } from '@/lib/utils/safety';
import * as Sentry from '@sentry/nextjs';

const BROADCAST_QUEUE = 'broadcast-jobs';
let broadcastQueue: Queue | null = null;
let broadcastWorker: Worker | null = null;

interface BroadcastJobData {
  tenantId: string;
  templateName: string;
  language: string;
  broadcastId: string;
  leads: { id: string; name: string; phone: string }[];
  components: any[];
}

export function initBroadcastEngine() {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('⚠️ Redis not available, broadcast engine cannot start.');
    return;
  }

  broadcastQueue = new Queue(BROADCAST_QUEUE, { connection: redis });

  broadcastWorker = new Worker(
    BROADCAST_QUEUE,
    async (job: Job<BroadcastJobData>) => {
      await processBroadcastJob(job.data);
    },
    { 
      connection: redis, 
      concurrency: 10,
      lockDuration: 30000,
      stalledInterval: 30000,
      maxStalledCount: 1,
    } // Process broadcasts concurrently
  );

  broadcastWorker.on('completed', (job) => {
    console.log(`✅ Broadcast job completed: ${job.id}`);
  });

  broadcastWorker.on('failed', async (job, err) => {
    console.error(`❌ Broadcast job failed: ${job?.id}`, err.message);
    Sentry.captureException(err);
    if (job?.data?.tenantId) {
      try {
        await supabaseAdmin.from('analytics_events').insert({
          tenant_id: job.data.tenantId,
          event_type: 'broadcast_failed',
          metadata: { broadcast_id: job.data.broadcastId, error: err.message },
        });
      } catch (e: unknown) {
        console.error('Failed to log broadcast error:', e);
      }
    }
  });

  console.log('📢 Broadcast queue engine started (BullMQ + Redis)');
}

export async function enqueueBroadcast(data: BroadcastJobData): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error('Redis is required for broadcast. Set REDIS_URL or UPSTASH_REDIS_URL.');
  }
  const producerQueue = new Queue(BROADCAST_QUEUE, { connection: redis });
  try {
    await producerQueue.add('send-broadcast', data, {
      removeOnComplete: 10,
      removeOnFail: 100,
    });
  } finally {
    await producerQueue.close();
  }
}

async function processBroadcastJob(data: BroadcastJobData) {
  const { tenantId, templateName, language, broadcastId, leads, components } = data;
  const tenant = await getTenantById(tenantId);
  
  if (!tenant) throw new Error('Tenant not found');

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const lead of leads) {
    if (!lead.phone) continue;

    const personalizedComponents = components.length > 0
      ? components
      : [
          {
            type: 'body',
            parameters: [{ type: 'text', text: lead.name || 'there' }],
          },
        ];

    try {
      await sendTemplateMessage(tenant, lead.phone, templateName, language, personalizedComponents);
      sent++;
    } catch (error: any) {
      failed++;
      errors.push(`${lead.phone}: ${error.message || 'Unknown error'}`);
    }

    // Per-message delay to stay under Meta's 80 msgs/sec limit (15ms = ~66 msg/sec)
    await sleep(15);
  }

  // Log completion
  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenantId,
    event_type: 'broadcast_completed',
    channel: 'whatsapp',
    metadata: {
      broadcast_id: broadcastId,
      template_name: templateName,
      sent,
      failed,
      total: leads.length,
      errors: errors.slice(0, 10),
    },
  });

  console.log(`📢 [${tenant.business_name}] Broadcast completed: ${sent} sent, ${failed} failed`);
}

export async function shutdownBroadcastEngine() {
  if (broadcastWorker) await broadcastWorker.close();
  if (broadcastQueue) await broadcastQueue.close();
  console.log('📢 Broadcast engine shut down');
}

```


## src/lib/database/schema.sql
```sql
-- ═══════════════════════════════════════════════════════════
-- 🗄️  Project Bolt — Multi-Tenant Database Schema
-- ═══════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor to set up the database.
-- Every table is tenant-scoped with Row-Level Security (RLS).
-- ═══════════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════
-- 1. TENANTS (Each client business)
-- ═══════════════════════════════════════
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Business Identity
  business_name TEXT NOT NULL,
  business_type TEXT DEFAULT 'Restaurant',
  business_phone TEXT,
  business_address TEXT,
  business_website TEXT,
  business_email TEXT,
  logo_url TEXT,
  
  -- Bot Configuration
  bot_name TEXT DEFAULT 'Assistant',
  bot_personality TEXT DEFAULT 'friendly and professional',
  welcome_message TEXT,
  welcome_offer TEXT,
  usps TEXT[] DEFAULT '{}',  -- Unique selling points array
  working_hours JSONB DEFAULT '{"mon-fri": "9:00-22:00", "sat-sun": "10:00-23:00"}',
  
  -- WhatsApp Cloud API Credentials (encrypted at app level)
  wa_phone_number_id TEXT,
  wa_access_token TEXT,
  wa_business_account_id TEXT,
  wa_app_secret TEXT,
  wa_verify_token TEXT DEFAULT encode(gen_random_bytes(16), 'hex'),
  wa_webhook_verified BOOLEAN DEFAULT false,
  wa_token_expired BOOLEAN DEFAULT false,
  
  -- Instagram Credentials
  ig_access_token TEXT,
  ig_page_id TEXT,
  
  -- Shopify Integration
  shopify_store_url TEXT,
  shopify_access_token TEXT,
  shopify_webhook_secret TEXT,
  
  -- Subscription & Billing
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'pro', 'enterprise')),
  plan_status TEXT DEFAULT 'active', -- active, past_due, cancelled, suspended
  razorpay_customer_id TEXT,
  razorpay_subscription_id TEXT,
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  
  -- Usage Tracking
  message_limit INTEGER DEFAULT 1000,
  messages_used_this_month INTEGER DEFAULT 0,
  ai_conversation_limit INTEGER DEFAULT 100,
  ai_conversations_this_month INTEGER DEFAULT 0,
  ai_tokens_used_this_month INTEGER DEFAULT 0,
  current_billing_period_start TIMESTAMPTZ DEFAULT NOW(),
  
  -- Staff Contacts
  staff_phone TEXT,
  staff_name TEXT,
  manager_phone TEXT,
  
  -- Follow-up Config
  followup_30min BOOLEAN DEFAULT true,
  followup_3hr BOOLEAN DEFAULT true,
  followup_24hr BOOLEAN DEFAULT true,
  followup_7day BOOLEAN DEFAULT false,
  escalation_timeout_mins INTEGER DEFAULT 30,
  
  -- Lead Scoring Keywords (overridable per tenant)
  hot_keywords TEXT[] DEFAULT ARRAY['today', 'tonight', 'now', 'asap', 'urgent', 'book', 'reserve', 'confirm'],
  warm_keywords TEXT[] DEFAULT ARRAY['interested', 'looking', 'when', 'available', 'weekend', 'plan', 'thinking'],
  
  -- Custom FAQs (Fix #7: tenant-specific Q&A for AI)
  custom_faqs JSONB DEFAULT '[]',  -- Array of {question, answer} objects
  
  -- Off-Hours Config (Fix #8)
  off_hours_message TEXT,
  off_hours_capture_lead BOOLEAN DEFAULT true,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for webhook routing (critical path)
CREATE UNIQUE INDEX idx_tenants_wa_phone ON tenants(wa_phone_number_id) WHERE wa_phone_number_id IS NOT NULL;
CREATE INDEX idx_tenants_active ON tenants(is_active);
CREATE INDEX idx_tenants_plan ON tenants(plan);

-- ═══════════════════════════════════════
-- 2. USERS (People who log into dashboards)
-- ═══════════════════════════════════════
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Auth (linked to Supabase Auth)
  auth_id UUID UNIQUE,  -- Supabase auth.users.id
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  
  -- Role
  role TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'staff', 'viewer')),
  
  -- Platform admin (us, not clients)
  is_platform_admin BOOLEAN DEFAULT false,
  
  -- Metadata
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE UNIQUE INDEX idx_users_auth ON users(auth_id) WHERE auth_id IS NOT NULL;
CREATE INDEX idx_users_email ON users(email);

-- ═══════════════════════════════════════
-- 3. LEADS (Customer contacts per tenant)
-- ═══════════════════════════════════════
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Contact Info
  name TEXT,
  phone TEXT,
  email TEXT,
  
  -- Source
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram_dm', 'instagram_comment', 'shopify', 'website', 'manual')),
  source_detail TEXT,  -- e.g., "Click-to-WhatsApp ad", "Instagram post #123"
  
  -- Qualification
  enquiry_type TEXT,
  guest_count TEXT,
  date_requested TEXT,
  occasion TEXT,
  lead_status TEXT DEFAULT 'new' CHECK (lead_status IN ('new', 'hot', 'warm', 'cold', 'converted', 'lost')),
  lead_score INTEGER DEFAULT 0,
  
  -- Assignment
  staff_assigned TEXT,
  notes TEXT,
  
  -- Shopify
  shopify_customer_id TEXT,
  total_order_value DECIMAL(10,2) DEFAULT 0,
  
  -- Metadata
  first_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_tenant ON leads(tenant_id);
CREATE INDEX idx_leads_tenant_status ON leads(tenant_id, lead_status);
CREATE INDEX idx_leads_tenant_channel ON leads(tenant_id, channel);
CREATE INDEX idx_leads_phone ON leads(tenant_id, phone);
CREATE INDEX idx_leads_created ON leads(tenant_id, created_at DESC);

-- ═══════════════════════════════════════
-- 4. CONVERSATIONS (Chat sessions)
-- ═══════════════════════════════════════
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Identifiers
  channel TEXT NOT NULL,
  sender_id TEXT NOT NULL,     -- WhatsApp phone or IG user ID
  sender_name TEXT,
  
  -- State Machine
  current_step TEXT DEFAULT 'greeting',
  flow_type TEXT,
  context JSONB DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  bot_paused BOOLEAN DEFAULT false,
  escalated BOOLEAN DEFAULT false,
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  
  -- AI
  ai_model_used TEXT DEFAULT 'gemini-2.0-flash',
  ai_tokens_used INTEGER DEFAULT 0,
  
  -- Metadata
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conv_tenant ON conversations(tenant_id);
CREATE INDEX idx_conv_active ON conversations(tenant_id, sender_id, channel, created_at DESC) WHERE is_active = true;
CREATE INDEX idx_conv_lead ON conversations(lead_id);
CREATE INDEX idx_conv_created ON conversations(tenant_id, created_at DESC);

-- ═══════════════════════════════════════
-- 5. MESSAGES (Individual chat messages)
-- ═══════════════════════════════════════
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Content
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'interactive', 'template', 'image', 'video', 'audio', 'document', 'location', 'reaction')),
  
  -- WhatsApp Metadata
  wa_message_id TEXT,        -- Meta's message ID
  channel TEXT NOT NULL,
  sender_id TEXT,
  
  -- Delivery Status
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  
  -- AI
  ai_generated BOOLEAN DEFAULT false,
  ai_latency_ms INTEGER,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_messages_wa_message_id ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX idx_msg_tenant ON messages(tenant_id);
CREATE INDEX idx_msg_conversation ON messages(conversation_id, created_at ASC);
CREATE INDEX idx_msg_conv_direction ON messages(conversation_id, created_at ASC) WHERE direction = 'inbound';
CREATE INDEX idx_msg_tenant_created ON messages(tenant_id, created_at DESC);

-- ═══════════════════════════════════════
-- 6. FOLLOW-UPS (Scheduled messages)
-- ═══════════════════════════════════════
CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  
  -- Schedule
  follow_up_type TEXT NOT NULL CHECK (follow_up_type IN ('30min', '3hr', '24hr', '7day', 'custom')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  
  -- Content
  message TEXT,
  ai_generated BOOLEAN DEFAULT false,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_followup_pending ON follow_ups(scheduled_at, status) WHERE status = 'pending';
CREATE INDEX idx_followup_tenant_pending ON follow_ups(tenant_id, scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_followup_tenant ON follow_ups(tenant_id);
CREATE INDEX idx_followup_lead ON follow_ups(lead_id);

-- ═══════════════════════════════════════
-- 7. BOOKINGS (Table reservations, events)
-- ═══════════════════════════════════════
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Booking Details
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  booking_date DATE,
  booking_time TIME,
  guest_count TEXT,
  occasion TEXT,
  special_requests TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  staff_assigned TEXT,
  confirmed_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_booking_tenant ON bookings(tenant_id);
CREATE INDEX idx_booking_date ON bookings(tenant_id, booking_date);
CREATE INDEX idx_booking_status ON bookings(tenant_id, status);

-- ═══════════════════════════════════════
-- 8. SHOPIFY EVENTS (Order/Cart tracking)
-- ═══════════════════════════════════════
CREATE TABLE shopify_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Event
  event_type TEXT NOT NULL CHECK (event_type IN ('order_created', 'order_fulfilled', 'order_cancelled', 'cart_abandoned', 'checkout_started')),
  shopify_order_id TEXT,
  order_value DECIMAL(10,2),
  currency TEXT DEFAULT 'INR',
  
  -- Cart Recovery
  cart_recovery_sent BOOLEAN DEFAULT false,
  cart_recovered BOOLEAN DEFAULT false,
  
  -- Raw Data
  payload JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shopify_tenant ON shopify_events(tenant_id);
CREATE INDEX idx_shopify_order ON shopify_events(shopify_order_id);

-- ═══════════════════════════════════════
-- 9. ANALYTICS EVENTS (Everything tracked)
-- ═══════════════════════════════════════
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Event
  event_type TEXT NOT NULL,
  channel TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_tenant ON analytics_events(tenant_id);
CREATE INDEX idx_analytics_type ON analytics_events(tenant_id, event_type);
CREATE INDEX idx_analytics_created ON analytics_events(tenant_id, created_at DESC);
CREATE INDEX idx_analytics_tenant_type_created ON analytics_events(tenant_id, event_type, created_at DESC);

-- ═══════════════════════════════════════
-- 10. PLATFORM STATS (Global admin metrics)
-- ═══════════════════════════════════════
CREATE TABLE platform_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_tenants INTEGER DEFAULT 0,
  active_tenants INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  total_leads INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0, -- Stored in Rupees (INR), NOT paise
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stat_date)
);

-- ═══════════════════════════════════════
-- 10.5 AUDIT LOGS (Compliance)
-- ═══════════════════════════════════════
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- 11. AUTO-UPDATE TIMESTAMPS
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_leads_updated BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_bookings_updated BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════
-- 12. ROW-LEVEL SECURITY (Tenant Isolation)
-- ═══════════════════════════════════════
-- This ensures Client A can NEVER see Client B's data,
-- even if there's a bug in the application code.

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (for webhooks and admin)
-- Client-side queries go through RLS automatically

-- Users can only see their own tenant's data
CREATE POLICY "Users see own tenant" ON users
  FOR ALL USING (
    auth.uid() = auth_id
    OR tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Leads scoped to tenant
CREATE POLICY "Leads scoped to tenant" ON leads
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Conversations scoped to tenant
CREATE POLICY "Conversations scoped to tenant" ON conversations
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Messages scoped to tenant
CREATE POLICY "Messages scoped to tenant" ON messages
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Follow-ups scoped to tenant
CREATE POLICY "Follow-ups scoped to tenant" ON follow_ups
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Bookings scoped to tenant
CREATE POLICY "Bookings scoped to tenant" ON bookings
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Shopify events scoped to tenant
CREATE POLICY "Shopify events scoped to tenant" ON shopify_events
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Analytics scoped to tenant
CREATE POLICY "Analytics scoped to tenant" ON analytics_events
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Tenants: users can see their own tenant
CREATE POLICY "Tenant owners see own tenant" ON tenants
  FOR ALL USING (
    id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- ═══════════════════════════════════════
-- 13. HELPER FUNCTIONS
-- ═══════════════════════════════════════

-- Get tenant ID for current authenticated user
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Increment message counter for a tenant
CREATE OR REPLACE FUNCTION increment_message_count(t_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET messages_used_this_month = messages_used_this_month + 1
  WHERE id = t_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_message_count(t_id UUID, count INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET messages_used_this_month = GREATEST(messages_used_this_month, count)
  WHERE id = t_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_ai_tokens(t_id UUID, token_count INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET ai_tokens_used_this_month = ai_tokens_used_this_month + token_count
  WHERE id = t_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_ai_conversations(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET ai_conversations_this_month = ai_conversations_this_month + 1
  WHERE id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset monthly counters (run via cron on 1st of each month)
CREATE OR REPLACE FUNCTION reset_monthly_counters()
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET messages_used_this_month = 0,
      ai_conversations_this_month = 0,
      current_billing_period_start = NOW(),
      updated_at = NOW()
  WHERE is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

```


## src/lib/email/service.ts
```ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key');

export async function sendNewLeadEmail(to: string, leadName: string, businessName: string) {
  try {
    await resend.emails.send({
      from: 'Project Bolt <notifications@projectbolt.dev>',
      to,
      subject: `New Lead: ${leadName}`,
      html: `<p>Great news! You have a new lead (<strong>${leadName}</strong>) for <strong>${businessName}</strong>.</p><p>Check your dashboard to view the conversation and lead details.</p>`,
    });
  } catch (error) {
    console.error('Failed to send new lead email:', error);
  }
}

export async function sendWeeklySummaryEmail(to: string, businessName: string, leadsCount: number, messagesCount: number) {
  try {
    await resend.emails.send({
      from: 'Project Bolt <analytics@projectbolt.dev>',
      to,
      subject: `Weekly Summary for ${businessName}`,
      html: `<p>Here is your weekly summary for <strong>${businessName}</strong>.</p><ul><li>New Leads: ${leadsCount}</li><li>Messages Sent: ${messagesCount}</li></ul><p>Keep up the great work!</p>`,
    });
  } catch (error) {
    console.error('Failed to send weekly summary email:', error);
  }
}

export async function sendBillingReceipt(to: string, businessName: string, amount: string, planName: string) {
  try {
    await resend.emails.send({
      from: 'Project Bolt Billing <billing@projectbolt.dev>',
      to,
      subject: `Receipt for ${planName} Plan`,
      html: `<p>Thank you for your payment, <strong>${businessName}</strong>.</p><p>We have successfully received your payment of <strong>${amount}</strong> for the <strong>${planName}</strong> plan.</p><p>You can download your full invoice from the billing dashboard.</p>`,
    });
  } catch (error) {
    console.error('Failed to send billing receipt:', error);
  }
}

export async function sendBotOfflineAlert(to: string, businessName: string) {
  try {
    await resend.emails.send({
      from: 'Project Bolt Alerts <alerts@projectbolt.dev>',
      to,
      subject: `URGENT: Your Bot is Offline`,
      html: `<p>Hello,</p><p>The WhatsApp connection for <strong>${businessName}</strong> has been disconnected (Meta token expired).</p><p>Your bot is currently <strong>offline</strong> and cannot reply to customers.</p><p>Please log in to your dashboard immediately to reconnect WhatsApp.</p>`,
    });
  } catch (error) {
    console.error('Failed to send bot offline alert:', error);
  }
}

```


## src/lib/followup/engine.ts
```ts
// ═══════════════════════════════════════════════════════════
// ⏰ Follow-Up Engine — BullMQ-Powered (Survives Restarts)
// ═══════════════════════════════════════════════════════════
// Replaces the old setInterval approach with proper BullMQ jobs.
// Each follow-up is a delayed job backed by Redis.
// If the server restarts, all pending jobs are preserved.
//
// Fallback: If Redis isn't configured, falls back to a
// database-polling approach (less reliable but functional).
// ═══════════════════════════════════════════════════════════

import { Queue, Worker, type Job } from 'bullmq';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantById, getTenantConfig } from '@/lib/tenant/manager';
import { sendTextMessage, sendTemplateMessage, isWhatsAppConfigured } from '@/lib/whatsapp/service';
import { generateFollowUpMessage } from '@/lib/ai/engine';
import { getRedisClient } from '@/lib/redis/client';
import type { Tenant } from '@/lib/types';
import * as Sentry from '@sentry/nextjs';

// ── Queue & Worker Names ──
const FOLLOWUP_QUEUE = 'follow-ups';
const CONVERSATION_TIMEOUT_QUEUE = 'conversation-timeouts';

// ── Queue Instances ──
let followUpQueue: Queue | null = null;
let timeoutQueue: Queue | null = null;
let followUpWorker: Worker | null = null;
let timeoutWorker: Worker | null = null;

// ── Fallback scheduler ──
let fallbackInterval: ReturnType<typeof setInterval> | null = null;

// ═══════════════════════════════════════
// Job Data Types
// ═══════════════════════════════════════

interface FollowUpJobData {
  followUpId: string;
  tenantId: string;
  leadId: string;
  conversationId: string | null;
  followUpType: string;
  message: string | null;
  leadPhone: string;
  leadName: string;
}

interface TimeoutJobData {
  conversationId: string;
  tenantId: string;
}

// ═══════════════════════════════════════
// INITIALIZE — Start queues and workers
// ═══════════════════════════════════════

export function initFollowUpEngine() {
  const redis = getRedisClient();

  if (redis) {
    initBullMQ(redis);
    console.log('⏰ Follow-up engine started (BullMQ + Redis)');
  } else {
    initFallbackScheduler();
    console.log('⏰ Follow-up engine started (database polling fallback)');
  }
}

function initBullMQ(connection: ReturnType<typeof getRedisClient>) {
  if (!connection) return;

  // ── Follow-Up Queue ──
  followUpQueue = new Queue(FOLLOWUP_QUEUE, { connection });

  followUpWorker = new Worker(
    FOLLOWUP_QUEUE,
    async (job: Job<FollowUpJobData>) => {
      await processFollowUpJob(job.data);
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000, // Max 10 follow-ups per second
      },
      lockDuration: 30000,
      stalledInterval: 30000,
      maxStalledCount: 1,
    }
  );

  followUpWorker.on('completed', (job) => {
    console.log(`✅ Follow-up job completed: ${job.id}`);
  });

  followUpWorker.on('failed', async (job, err) => {
    console.error(`❌ Follow-up job failed: ${job?.id}`, err.message);
    Sentry.captureException(err);
    if (job?.data?.tenantId) {
      try {
        await supabaseAdmin.from('analytics_events').insert({
          tenant_id: job.data.tenantId,
          event_type: 'queue_job_failed',
          channel: 'system',
          metadata: { job_id: job?.id, queue: FOLLOWUP_QUEUE, error: err.message },
        });
      } catch (e: unknown) {
        console.error('Failed to log queue error:', e);
      }
    }
  });

  // ── Conversation Timeout Queue ──
  timeoutQueue = new Queue(CONVERSATION_TIMEOUT_QUEUE, { connection });

  timeoutWorker = new Worker(
    CONVERSATION_TIMEOUT_QUEUE,
    async (job: Job<TimeoutJobData>) => {
      await processConversationTimeout(job.data);
    },
    { 
      connection, 
      concurrency: 10,
      lockDuration: 30000,
      stalledInterval: 30000,
      maxStalledCount: 1,
    }
  );

  timeoutWorker.on('failed', (job, err) => {
    console.error(`❌ Timeout job failed: ${job?.id}`, err.message);
    Sentry.captureException(err);
  });
}

function initFallbackScheduler() {
  if (fallbackInterval) return;

  // Poll database every 60 seconds for pending follow-ups
  fallbackInterval = setInterval(async () => {
    try {
      const sent = await processPendingFollowUps();
      if (sent > 0) console.log(`⏰ Fallback: Processed ${sent} follow-ups`);

      // Also check conversation timeouts
      await processStaleConversations();
    } catch (err) {
      console.error('❌ Fallback scheduler error:', err);
    }
  }, 60 * 1000);
}

// ═══════════════════════════════════════
// SCHEDULE: Add a follow-up to the queue
// ═══════════════════════════════════════

export async function scheduleFollowUp(data: {
  followUpId: string;
  tenantId: string;
  leadId: string;
  conversationId: string | null;
  followUpType: string;
  message: string | null;
  leadPhone: string;
  leadName: string;
  delayMs: number;
}): Promise<void> {
  if (followUpQueue) {
    // BullMQ: Add delayed job — survives server restart
    await followUpQueue.add(
      `followup:${data.followUpType}:${data.leadId}`,
      {
        followUpId: data.followUpId,
        tenantId: data.tenantId,
        leadId: data.leadId,
        conversationId: data.conversationId,
        followUpType: data.followUpType,
        message: data.message,
        leadPhone: data.leadPhone,
        leadName: data.leadName,
      },
      {
        delay: data.delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,
      }
    );
    console.log(`⏰ BullMQ: Scheduled ${data.followUpType} follow-up for ${data.leadName} (delay: ${Math.round(data.delayMs / 60000)}min)`);
  } else {
    // Fallback: Just save to database — the poller will pick it up
    console.log(`⏰ DB: Follow-up ${data.followUpType} for ${data.leadName} saved (polling will handle)`);
  }
}

// ═══════════════════════════════════════
// SCHEDULE: Conversation timeout
// ═══════════════════════════════════════

export async function scheduleConversationTimeout(
  conversationId: string,
  tenantId: string,
  delayMs: number = 24 * 60 * 60 * 1000 // 24 hours default
): Promise<void> {
  if (timeoutQueue) {
    // Remove any existing timeout for this conversation
    const jobId = `timeout:${conversationId}`;
    const existing = await timeoutQueue.getJob(jobId);
    if (existing) await existing.remove();

    await timeoutQueue.add(
      jobId,
      { conversationId, tenantId },
      {
        delay: delayMs,
        jobId, // Ensure only one timeout per conversation
        attempts: 2,
        removeOnComplete: true,
      }
    );
  }
}

// ═══════════════════════════════════════
// PROCESS: Follow-up job
// ═══════════════════════════════════════

async function processFollowUpJob(data: FollowUpJobData): Promise<void> {
  const { followUpId, tenantId, leadId, followUpType, leadPhone, leadName } = data;

  // Check if follow-up is still pending in DB
  const { data: followUp } = await supabaseAdmin
    .from('follow_ups')
    .select('status')
    .eq('id', followUpId)
    .single();

  if (!followUp || followUp.status !== 'pending') {
    console.log(`⏩ Follow-up ${followUpId} already ${followUp?.status || 'deleted'}, skipping`);
    return;
  }

  // Check lead status
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('lead_status')
    .eq('id', leadId)
    .single();

  if (lead?.lead_status === 'converted' || lead?.lead_status === 'lost') {
    await markFollowUpCancelled(followUpId, 'Lead status changed');
    return;
  }

  // Get tenant
  const tenant = await getTenantById(tenantId);
  if (!tenant || !tenant.is_active || !isWhatsAppConfigured(tenant)) {
    await markFollowUpCancelled(followUpId, tenant ? 'WhatsApp not configured' : 'Tenant inactive');
    return;
  }

  // Get or generate message
  let message = data.message;
  if (!message) {
    const tenantConfig = getTenantConfig(tenant);
    message = await generateFollowUpMessage(
      { name: leadName },
      followUpType,
      tenantConfig
    );
  }

  // Send the message
  const hoursSinceCreated = getHoursSince(
    (await supabaseAdmin.from('follow_ups').select('created_at').eq('id', followUpId).single()).data?.created_at || ''
  );

  if (hoursSinceCreated > 24) {
    await sendFollowUpWithTemplate(tenant, leadPhone, followUpType, leadName);
  } else {
    await sendTextMessage(tenant, leadPhone, message);
  }

  // Mark as sent
  await supabaseAdmin
    .from('follow_ups')
    .update({ status: 'sent', sent_at: new Date().toISOString(), message })
    .eq('id', followUpId);

  // Log analytics
  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenantId,
    event_type: 'follow_up_sent',
    channel: 'whatsapp',
    metadata: { follow_up_type: followUpType, lead_name: leadName, lead_phone: leadPhone },
  });

  console.log(`⏰ [${tenant.business_name}] Follow-up (${followUpType}) sent to ${leadName}`);
}

// ═══════════════════════════════════════
// PROCESS: Conversation timeout (Fix #14)
// ═══════════════════════════════════════

async function processConversationTimeout(data: TimeoutJobData): Promise<void> {
  const { conversationId } = data;

  // Check if conversation is still active
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('is_active, last_message_at')
    .eq('id', conversationId)
    .single();

  if (!conv || !conv.is_active) return;

  // Only timeout if no message in last 24 hours
  const hoursSinceLastMessage = getHoursSince(conv.last_message_at);
  if (hoursSinceLastMessage < 24) return;

  // Deactivate the conversation
  await supabaseAdmin
    .from('conversations')
    .update({
      is_active: false,
      current_step: 'timed_out',
    })
    .eq('id', conversationId);

  console.log(`⏰ Conversation ${conversationId} timed out (${Math.round(hoursSinceLastMessage)}h inactive)`);
}

// ═══════════════════════════════════════
// FALLBACK: Process pending follow-ups via DB polling
// ═══════════════════════════════════════

export async function processPendingFollowUps(): Promise<number> {
  const now = new Date().toISOString();

  const { data: followUps, error } = await supabaseAdmin
    .from('follow_ups')
    .select(`
      *,
      leads!inner (
        name, phone, channel, tenant_id, lead_status
      )
    `)
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .limit(50);

  if (error || !followUps || followUps.length === 0) return 0;

  let sent = 0;

  for (const followUp of followUps) {
    try {
      const lead = followUp.leads as unknown as {
        name: string;
        phone: string;
        channel: string;
        tenant_id: string;
        lead_status: string;
      };

      if (lead.lead_status === 'converted' || lead.lead_status === 'lost') {
        await markFollowUpCancelled(followUp.id, 'Lead status changed');
        continue;
      }

      const tenant = await getTenantById(followUp.tenant_id);
      if (!tenant || !tenant.is_active || !isWhatsAppConfigured(tenant)) {
        await markFollowUpCancelled(followUp.id, 'Tenant inactive or WA not configured');
        continue;
      }

      let message = followUp.message;
      if (!message) {
        const tenantConfig = getTenantConfig(tenant);
        message = await generateFollowUpMessage(
          { name: lead.name },
          followUp.follow_up_type,
          tenantConfig
        );
      }

      const hoursSinceScheduled = getHoursSince(followUp.created_at);
      if (hoursSinceScheduled > 24) {
        await sendFollowUpWithTemplate(tenant, lead.phone, followUp.follow_up_type, lead.name);
      } else {
        await sendTextMessage(tenant, lead.phone, message);
      }

      await supabaseAdmin
        .from('follow_ups')
        .update({ status: 'sent', sent_at: new Date().toISOString(), message })
        .eq('id', followUp.id);

      await supabaseAdmin.from('analytics_events').insert({
        tenant_id: tenant.id,
        event_type: 'follow_up_sent',
        channel: 'whatsapp',
        metadata: { follow_up_type: followUp.follow_up_type, lead_name: lead.name },
      });

      sent++;
    } catch (err) {
      console.error(`❌ Follow-up ${followUp.id} failed:`, err);
      Sentry.captureException(err);
      await supabaseAdmin
        .from('follow_ups')
        .update({ status: 'failed', error_message: err instanceof Error ? err.message : 'Unknown error' })
        .eq('id', followUp.id);
    }
  }

  return sent;
}

// ═══════════════════════════════════════
// PROCESS: Stale conversations (Fix #14)
// ═══════════════════════════════════════

async function processStaleConversations(): Promise<void> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: staleConvs } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('is_active', true)
    .lt('last_message_at', twentyFourHoursAgo)
    .limit(100);

  if (!staleConvs || staleConvs.length === 0) return;

  const ids = staleConvs.map((c) => c.id);

  await supabaseAdmin
    .from('conversations')
    .update({ is_active: false, current_step: 'timed_out' })
    .in('id', ids);

  console.log(`⏰ Timed out ${ids.length} stale conversations`);
}

// ═══════════════════════════════════════
// Cancel Follow-Ups
// ═══════════════════════════════════════

export async function cancelLeadFollowUps(leadId: string): Promise<void> {
  await supabaseAdmin
    .from('follow_ups')
    .update({ status: 'cancelled' })
    .eq('lead_id', leadId)
    .eq('status', 'pending');

  // Also remove from BullMQ if available
  if (followUpQueue) {
    try {
      const jobs = await followUpQueue.getDelayed();
      for (const job of jobs) {
        if (job.data.leadId === leadId) {
          await job.remove();
        }
      }
    } catch {
      // Non-critical
    }
  }
}

export async function cancelTenantFollowUps(tenantId: string): Promise<void> {
  await supabaseAdmin
    .from('follow_ups')
    .update({ status: 'cancelled' })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending');
}

// ═══════════════════════════════════════
// SHUTDOWN
// ═══════════════════════════════════════

export async function shutdownFollowUpEngine(): Promise<void> {
  if (followUpWorker) await followUpWorker.close();
  if (timeoutWorker) await timeoutWorker.close();
  if (followUpQueue) await followUpQueue.close();
  if (timeoutQueue) await timeoutQueue.close();
  if (fallbackInterval) clearInterval(fallbackInterval);
  console.log('⏰ Follow-up engine shut down');
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

async function markFollowUpCancelled(followUpId: string, reason: string) {
  await supabaseAdmin
    .from('follow_ups')
    .update({ status: 'cancelled', error_message: reason })
    .eq('id', followUpId);
}

function getHoursSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  return (Date.now() - then) / (1000 * 60 * 60);
}

async function sendFollowUpWithTemplate(
  tenant: Tenant,
  phone: string,
  followUpType: string,
  name: string
) {
  try {
    await sendTemplateMessage(tenant, phone, 'follow_up_reminder', 'en', [
      { type: 'body', parameters: [{ type: 'text', text: name || 'there' }] },
    ]);
  } catch {
    console.warn(`⚠️ [${tenant.business_name}] Template message failed for ${followUpType}, skipping`);
  }
}

```


## src/lib/instagram/processor.ts
```ts
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantByIgPageId, getTenantConfig, incrementMessageCount, checkUsageLimits } from '@/lib/tenant/manager';
import { processMessageWithAI } from '@/lib/ai/engine';
import { sendInstagramMessage, markInstagramAsRead } from '@/lib/instagram/service';
import { sendStaffAlert } from '@/lib/whatsapp/service';
import { scheduleConversationTimeout } from '@/lib/followup/engine';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { v4 as uuidv4 } from 'uuid';
import type { Tenant, ConversationContext } from '@/lib/types';

export async function processIncomingIGMessage(igPageId: string, senderId: string, messageText: string, messageId: string) {
  // ── Step 1: Find the tenant ──
  const tenant = await getTenantByIgPageId(igPageId);
  if (!tenant) {
    console.warn(`⚠️ No tenant found for ig_page_id: ${igPageId}`);
    return;
  }

  if (!tenant.is_active || tenant.plan_status === 'cancelled' || tenant.plan_status === 'suspended') {
    return;
  }

  // ── Rate limit per sender ──
  const rateCheck = await checkRedisRateLimit(`ig_sender:${senderId}`, 30, 60000);
  if (!rateCheck.allowed) return;

  // ── Check usage limits ──
  const usage = await checkUsageLimits(tenant);
  if (!usage.withinLimits) {
    try { await sendInstagramMessage(tenant, senderId, `Thank you for reaching out! Our team will get back to you shortly. 🙏`); } catch {}
    return;
  }

  console.log(`📥 [${tenant.business_name}] IG User (${senderId}): ${messageText}`);

  // ── Step 2: Mark as read ──
  await markInstagramAsRead(tenant, senderId);

  // ── Step 3: Increment usage counter ──
  await incrementMessageCount(tenant.id);

  // ── Step 4: Find or create conversation ──
  let conversation = await getActiveConversation(tenant.id, senderId, 'instagram_dm');
  
  if (!conversation) {
    conversation = await createNewConversation(tenant, senderId, messageText);
    return;
  }

  // ── Step 5: Load conversation history ──
  const history = await getConversationHistory(conversation.id);

  // ── Step 6: Process through AI engine ──
  const tenantConfig = getTenantConfig(tenant);
  const context: ConversationContext = conversation.context || {};

  const aiResponse = await processMessageWithAI(messageText, history, context, tenantConfig, tenant.id);

  // ── Step 7: Log & Send ──
  await logMessage(tenant.id, conversation.id, 'inbound', messageText, 'instagram_dm', senderId);
  await sendInstagramMessage(tenant, senderId, aiResponse.reply);
  await logMessage(tenant.id, conversation.id, 'outbound', aiResponse.reply, 'instagram_dm', 'bot', true);

  // ── Step 8: Update state ──
  const updatedContext: ConversationContext = { ...context, ...aiResponse.extractedData };
  await updateConversation(conversation.id, aiResponse.nextStep, updatedContext);

  // ── Step 9: Timeouts, Escalations, Leads, Followups ──
  await scheduleConversationTimeout(conversation.id, tenant.id);

  if (aiResponse.shouldEscalate) {
    await handleEscalation(tenant, conversation.id, senderId, aiResponse, updatedContext);
  }

  if (aiResponse.nextStep === 'confirmation' || aiResponse.nextStep === 'completed') {
    await saveLead(tenant, conversation, updatedContext, senderId);
    await scheduleFollowUps(tenant, conversation, updatedContext);
  }
}

// ═══════════════════════════════════════
// DB Helpers
// ═══════════════════════════════════════
async function getActiveConversation(tenantId: string, senderId: string, channel: string) {
  const { data } = await supabaseAdmin.from('conversations')
    .select('*').eq('tenant_id', tenantId).eq('sender_id', senderId)
    .eq('channel', channel).eq('is_active', true)
    .order('created_at', { ascending: false }).limit(1).single();
  if (data && typeof data.context === 'string') data.context = JSON.parse(data.context);
  return data;
}

async function createNewConversation(tenant: Tenant, senderId: string, firstMessage: string) {
  const leadId = uuidv4();
  const convId = uuidv4();
  const senderName = `IG User ${senderId.slice(-4)}`;

  await supabaseAdmin.from('leads').insert({
    id: leadId, tenant_id: tenant.id, name: senderName,
    channel: 'instagram_dm', lead_status: 'new',
  });

  const context: ConversationContext = { name: senderName };
  await supabaseAdmin.from('conversations').insert({
    id: convId, tenant_id: tenant.id, lead_id: leadId,
    channel: 'instagram_dm', sender_id: senderId,
    sender_name: senderName, current_step: 'greeting', context,
  });

  await logMessage(tenant.id, convId, 'inbound', firstMessage, 'instagram_dm', senderId);

  const tenantConfig = getTenantConfig(tenant);
  const greeting = `Hey there 👋 Welcome to ${tenantConfig.businessName}!\n\nI'm ${tenantConfig.botName}, your personal assistant.\n\nHow can I help you today?`;
  
  await sendInstagramMessage(tenant, senderId, greeting);
  await logMessage(tenant.id, convId, 'outbound', greeting, 'instagram_dm', 'bot');

  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenant.id, event_type: 'new_lead',
    channel: 'instagram_dm', metadata: { source: senderId },
  });

  // Increment the monthly AI conversation counter
  await supabaseAdmin.rpc('increment_ai_conversations', { p_tenant_id: tenant.id });

  await scheduleConversationTimeout(convId, tenant.id);
  const { data } = await supabaseAdmin.from('conversations').select('*').eq('id', convId).single();
  return data;
}

async function getConversationHistory(conversationId: string) {
  const { data } = await supabaseAdmin.from('messages').select('direction, content')
    .eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(40);
  return (data || []).map((m) => ({ role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const, content: m.content }));
}

async function logMessage(tenantId: string, conversationId: string, direction: 'inbound'|'outbound', content: string, channel: string, senderId: string, aiGenerated = false) {
  await supabaseAdmin.from('messages').insert({ tenant_id: tenantId, conversation_id: conversationId, direction, content, channel, sender_id: senderId, ai_generated: aiGenerated });
  await supabaseAdmin.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
}

async function updateConversation(conversationId: string, nextStep: string, context: ConversationContext) {
  await supabaseAdmin.from('conversations').update({ current_step: nextStep, context, last_message_at: new Date().toISOString() }).eq('id', conversationId);
}

async function handleEscalation(tenant: Tenant, conversationId: string, senderId: string, aiResponse: any, context: ConversationContext) {
  await supabaseAdmin.from('conversations').update({ escalated: true, escalated_at: new Date().toISOString(), escalation_reason: aiResponse.escalationReason }).eq('id', conversationId);
  await sendStaffAlert(tenant, `🔔 IG ESCALATION\n\n👤 IG User (${senderId})\n⚠️ Reason: ${aiResponse.escalationReason}\n🏢 ${tenant.business_name}`);
}

async function saveLead(tenant: Tenant, conversation: any, context: ConversationContext, senderId: string) {
  await supabaseAdmin.from('leads').update({
    name: context.name, phone: context.phone, email: context.email,
    enquiry_type: context.enquiry_type, guest_count: context.guest_count,
    date_requested: context.date_requested, occasion: context.occasion,
    lead_status: 'warm', last_message_at: new Date().toISOString(),
  }).eq('id', conversation.lead_id);
}

async function scheduleFollowUps(tenant: Tenant, conversation: any, context: ConversationContext) {
  const now = Date.now();
  const leadId = conversation.lead_id as string;
  const convId = conversation.id as string;
  const leadPhone = (context.instagram_id || conversation.sender_id) as string;
  const leadName = context.name || 'Customer';

  const followUpsToCreate = [];

  if (tenant.followup_30min) {
    const delayMs = 30 * 60 * 1000;
    const id = require('crypto').randomUUID();
    followUpsToCreate.push({ id, tenant_id: tenant.id, lead_id: leadId, conversation_id: convId, follow_up_type: '30min', scheduled_at: new Date(now + delayMs).toISOString(), message: null, ai_generated: true, delayMs });
  }
  if (tenant.followup_24hr) {
    const delayMs = 24 * 60 * 60 * 1000;
    const id = require('crypto').randomUUID();
    followUpsToCreate.push({ id, tenant_id: tenant.id, lead_id: leadId, conversation_id: convId, follow_up_type: '24hr', scheduled_at: new Date(now + delayMs).toISOString(), message: null, ai_generated: true, delayMs });
  }

  if (followUpsToCreate.length === 0) return;

  const { scheduleFollowUp } = await import('@/lib/followup/engine');
  await supabaseAdmin.from('follow_ups').insert(followUpsToCreate.map(({ delayMs: _d, ...f }) => f));
  for (const fu of followUpsToCreate) {
    await scheduleFollowUp({ followUpId: fu.id, tenantId: tenant.id, leadId, conversationId: convId, followUpType: fu.follow_up_type, message: null, leadPhone, leadName, delayMs: fu.delayMs });
  }
}

```


## src/lib/instagram/service.ts
```ts
import type { Tenant } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';

// ═══════════════════════════════════════════════════════════
// 📸 Instagram Service
// ═══════════════════════════════════════════════════════════

export function isInstagramConfigured(tenant: Tenant): boolean {
  return Boolean(tenant.ig_access_token && tenant.ig_page_id);
}

export async function sendInstagramMessage(tenant: Tenant, recipientId: string, text: string) {
  if (!isInstagramConfigured(tenant)) {
    throw new Error('Instagram is not configured for this tenant.');
  }

  const token = decryptToken(tenant.ig_access_token);
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${token}`;

  const payload = {
    recipient: { id: recipientId },
    message: { text }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Instagram API Error:', data);
    throw new Error(data.error?.message || 'Failed to send Instagram message');
  }

  return data;
}

export async function markInstagramAsRead(tenant: Tenant, messageId: string) {
  if (!isInstagramConfigured(tenant)) return;

  const token = decryptToken(tenant.ig_access_token);
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${token}`;

  const payload = {
    recipient: { id: messageId }, // For IG, read receipts are sent slightly differently, often 'sender_action': 'mark_seen'
    sender_action: 'mark_seen'
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('Failed to mark IG message as read', error);
  }
}

```


## src/lib/redis/client.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🔴 Redis Client — Shared Connection (Upstash Compatible)
// ═══════════════════════════════════════════════════════════
// Single Redis connection used for:
//  - BullMQ job queue (follow-ups, broadcasts)
//  - Webhook deduplication (survives server restarts)
//  - Rate limiting (per-sender, per-tenant)
//  - Tenant config caching
// ═══════════════════════════════════════════════════════════

import IORedis from 'ioredis';

// ── Singleton connection ──
let redisInstance: IORedis | null = null;
let connectionFailed = false;

export function getRedisClient(): IORedis | null {
  if (connectionFailed) return null;
  if (redisInstance) return redisInstance;

  const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn('⚠️ Redis not configured — falling back to in-memory. Set REDIS_URL or UPSTASH_REDIS_URL.');
    return null;
  }

  try {
    redisInstance = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      family: 0, // Force IPv4 for Upstash compatibility
      retryStrategy: (times) => {
        if (times > 10) return null; // Stop retrying after 10 attempts
        return Math.min(times * 200, 5000); // Exponential backoff
      },
      lazyConnect: true,
    });

    redisInstance.on('error', (err) => {
      console.error('❌ Redis connection error:', err.message);
    });

    redisInstance.on('connect', () => {
      console.log('✅ Redis connected');
    });

    // Connect eagerly
    redisInstance.connect().catch((err) => {
      console.error('❌ Redis initial connect failed:', err.message);
      connectionFailed = true;
      redisInstance = null;
    });

    return redisInstance;
  } catch (err) {
    console.error('❌ Redis client creation failed:', err);
    return null;
  }
}

// ═══════════════════════════════════════
// DEDUPLICATION — Redis-backed message dedup
// ═══════════════════════════════════════
// Stores wa_message_id with a 24-hour TTL.
// Survives server restarts unlike in-memory Set.

const DEDUP_PREFIX = 'dedup:wa:';
const DEDUP_TTL_SECONDS = 86400; // 24 hours

// In-memory fallback when Redis is unavailable
const inMemoryDedup = new Set<string>();
const MAX_INMEMORY_SIZE = 10000;

export async function isDuplicateMessage(messageId: string): Promise<boolean> {
  const redis = getRedisClient();

  if (redis) {
    try {
      // SETNX returns 1 if key was set (not duplicate), 0 if already exists (duplicate)
      const result = await redis.set(
        `${DEDUP_PREFIX}${messageId}`,
        '1',
        'EX',
        DEDUP_TTL_SECONDS,
        'NX'
      );
      return result === null; // null means key already existed = duplicate
    } catch (err) {
      console.warn('⚠️ Redis dedup failed, falling back to in-memory:', err);
    }
  }

  // Database fallback when Redis is unavailable
  try {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const { data } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('wa_message_id', messageId)
      .limit(1);
      
    if (data && data.length > 0) {
      console.warn(`⏩ Duplicate detected via DB fallback: ${messageId}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error('❌ DB dedup fallback failed:', err);
    return false; // Let it process, better than dropping messages
  }
}

// ═══════════════════════════════════════
// GENERIC CACHE — Redis-backed with fallback
// ═══════════════════════════════════════

export async function cacheGet(key: string): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(key, value, 'EX', ttlSeconds);
  } catch {
    // Ignore cache failures
  }
}

// ═══════════════════════════════════════
// RATE LIMITING — Redis-backed per-key
// ═══════════════════════════════════════

export async function checkRedisRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedisClient();
  if (!redis) {
    // Fallback: always allow when Redis is down
    return { allowed: true, remaining: maxRequests };
  }

  try {
    const fullKey = `ratelimit:${key}`;
    const pipeline = redis.pipeline();
    pipeline.incr(fullKey);
    pipeline.expire(fullKey, windowSeconds);
    const results = await pipeline.exec();

    if (!results) {
      return { allowed: true, remaining: maxRequests };
    }

    const current = results[0][1] as number;

    return {
      allowed: current <= maxRequests,
      remaining: Math.max(0, maxRequests - current),
    };
  } catch {
    return { allowed: true, remaining: maxRequests };
  }
}

```


## src/lib/supabase/admin.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🔌 Supabase Client — Server-Side (API Routes, Webhooks)
// ═══════════════════════════════════════════════════════════
// Uses the SERVICE ROLE key — bypasses Row-Level Security.
// ONLY use this in server-side code (API routes, webhooks).
// NEVER expose this in client-side code.
//
// Lazy-initialized so the build succeeds without env vars.
// Throws at runtime if env vars are missing when actually used.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin;

  const supabaseUrl = process.env.SUPABASE_POOLER_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseServiceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

  _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  return _supabaseAdmin;
}

// Proxy that lazily initializes on first property access
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

```


## src/lib/supabase/client.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🔌 Supabase Client — Browser-Side (Dashboard UI)
// ═══════════════════════════════════════════════════════════
// Uses the ANON key — respects Row-Level Security.
// Safe to use in client components. Each user only sees
// their own tenant's data thanks to RLS policies.

import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export function createBrowserSupabaseClient() {
  if (!isSupabaseConfigured) {
    // Return a placeholder that won't crash — pages handle this gracefully
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    );
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

```


## src/lib/supabase/server.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🔌 Supabase Client — Server Components & API Routes
// ═══════════════════════════════════════════════════════════
// Uses cookies for auth session. Respects RLS.
// Use this in Server Components and Route Handlers.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );
}

```


## src/lib/tenant/manager.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🏢 Tenant Manager — Multi-Tenancy Core
// ═══════════════════════════════════════════════════════════
// Handles tenant CRUD, lookup, caching, and config resolution.
// The webhook dispatcher uses getTenantByPhoneNumberId() to
// route incoming WhatsApp messages to the correct tenant.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Tenant } from '@/lib/types';
import { cacheGet, cacheSet, getRedisClient } from '@/lib/redis/client';

// ── Redis Cache (5 min TTL) ──
// Works across serverless invocations.
const CACHE_TTL_SECONDS = 300; // 5 minutes

async function getCached(key: string): Promise<Tenant | null> {
  const cachedStr = await cacheGet(`tenant_cache:${key}`);
  if (!cachedStr) return null;
  try {
    return JSON.parse(cachedStr) as Tenant;
  } catch {
    return null;
  }
}

async function setCache(key: string, tenant: Tenant) {
  await cacheSet(`tenant_cache:${key}`, JSON.stringify(tenant), CACHE_TTL_SECONDS);
}

export async function invalidateCache(tenantId: string) {
  // Try to get tenant to find all associated keys to invalidate
  const tenant = await getTenantById(tenantId);
  const redis = getRedisClient();
  if (!redis || !tenant) return;
  
  const keysToDelete = [`tenant_cache:id:${tenantId}`];
  if (tenant.wa_phone_number_id) keysToDelete.push(`tenant_cache:phone:${tenant.wa_phone_number_id}`);
  if (tenant.ig_page_id) keysToDelete.push(`tenant_cache:ig:${tenant.ig_page_id}`);
  if (tenant.shopify_store_url) keysToDelete.push(`tenant_cache:shopify:${tenant.shopify_store_url}`);
  
  try {
    await redis.del(...keysToDelete);
  } catch (err) {
    console.warn('⚠️ Failed to invalidate tenant cache:', err);
  }
}

// ── Stampede Protection ──
const inFlightPromises = new Map<string, Promise<Tenant | null>>();

// ═══════════════════════════════════════
// LOOKUP: By Tenant ID
// ═══════════════════════════════════════
export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const cacheKey = `id:${tenantId}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  if (inFlightPromises.has(cacheKey)) return inFlightPromises.get(cacheKey)!;

  const promise = (async () => {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (error || !data) return null;

    const tenant = data as Tenant;
    await setCache(cacheKey, tenant);
    if (tenant.wa_phone_number_id) await setCache(`phone:${tenant.wa_phone_number_id}`, tenant);
    if (tenant.ig_page_id) await setCache(`ig:${tenant.ig_page_id}`, tenant);
    return tenant;
  })();

  inFlightPromises.set(cacheKey, promise);
  try { return await promise; } finally { inFlightPromises.delete(cacheKey); }
}

// ═══════════════════════════════════════
// LOOKUP: By WhatsApp Phone Number ID
// ═══════════════════════════════════════
// This is the CRITICAL function used by the webhook dispatcher.
// When Meta sends a webhook, we extract phone_number_id from
// the payload and look up which tenant owns that number.
export async function getTenantByPhoneNumberId(phoneNumberId: string): Promise<Tenant | null> {
  const cacheKey = `phone:${phoneNumberId}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const redis = getRedisClient();
  const lockKey = `lock:tenant:${phoneNumberId}`;
  if (redis) {
    const locked = await redis.set(lockKey, '1', 'EX', 5, 'NX');
    if (!locked) {
      await new Promise(r => setTimeout(r, 200));
      return getCached(cacheKey).then(c => c ? (c as Tenant) : null);
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('wa_phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;

    const tenant = data as Tenant;
    await setCache(cacheKey, tenant);
    await setCache(`id:${tenant.id}`, tenant);
    return tenant;
  } finally {
    if (redis) await redis.del(lockKey);
  }
}

// ═══════════════════════════════════════
// LOOKUP: By Instagram Page ID
// ═══════════════════════════════════════
export async function getTenantByIgPageId(igPageId: string): Promise<Tenant | null> {
  const cacheKey = `ig:${igPageId}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  if (inFlightPromises.has(cacheKey)) return inFlightPromises.get(cacheKey)!;

  const promise = (async () => {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('ig_page_id', igPageId)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;

    const tenant = data as Tenant;
    await setCache(cacheKey, tenant);
    await setCache(`id:${tenant.id}`, tenant);
    return tenant;
  })();

  inFlightPromises.set(cacheKey, promise);
  try { return await promise; } finally { inFlightPromises.delete(cacheKey); }
}

// ═══════════════════════════════════════
// LOOKUP: By Shopify Store URL
// ═══════════════════════════════════════
export async function getTenantByShopifyUrl(storeUrl: string): Promise<Tenant | null> {
  const cached = await getCached(`shopify:${storeUrl}`);
  if (cached) return cached;

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('shopify_store_url', storeUrl)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;

  const tenant = data as Tenant;
  await setCache(`shopify:${storeUrl}`, tenant);
  return tenant;
}

// ═══════════════════════════════════════
// CREATE: New Tenant
// ═══════════════════════════════════════
export async function createTenant(input: {
  business_name: string;
  business_type?: string;
  business_email?: string;
  business_phone?: string;
  bot_name?: string;
  plan?: Tenant['plan'];
}): Promise<Tenant> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .insert({
      business_name: input.business_name,
      business_type: input.business_type || 'Restaurant',
      business_email: input.business_email,
      business_phone: input.business_phone,
      bot_name: input.bot_name || 'Assistant',
      plan: input.plan || 'starter',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create tenant: ${error.message}`);
  return data as Tenant;
}

// ═══════════════════════════════════════
// UPDATE: Tenant Config
// ═══════════════════════════════════════
export async function updateTenant(
  tenantId: string,
  updates: Partial<Tenant>
): Promise<Tenant> {
  // Remove fields that shouldn't be directly updated
  const { id, created_at, ...safeUpdates } = updates as Record<string, unknown>;

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update(safeUpdates)
    .eq('id', tenantId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update tenant: ${error.message}`);

  const tenant = data as Tenant;
  invalidateCache(tenantId);
  return tenant;
}

// ═══════════════════════════════════════
// LIST: All Tenants (Admin only)
// ═══════════════════════════════════════
export async function listTenants(options?: {
  limit?: number;
  offset?: number;
  plan?: string;
  status?: string;
}): Promise<{ tenants: Tenant[]; total: number }> {
  let query = supabaseAdmin
    .from('tenants')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options?.plan) query = query.eq('plan', options.plan);
  if (options?.status) query = query.eq('plan_status', options.status);
  if (options?.limit) query = query.limit(options.limit);
  if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to list tenants: ${error.message}`);
  return { tenants: (data || []) as Tenant[], total: count || 0 };
}

// ═══════════════════════════════════════
// CONNECT: WhatsApp Credentials
// ═══════════════════════════════════════
export async function connectWhatsApp(
  tenantId: string,
  credentials: {
    wa_phone_number_id: string;
    wa_access_token: string;
    wa_business_account_id?: string;
    wa_app_secret?: string;
  }
): Promise<Tenant> {
  return updateTenant(tenantId, {
    ...credentials,
    wa_webhook_verified: false,
    onboarding_completed: true,
  } as Partial<Tenant>);
}

// ═══════════════════════════════════════
// USAGE: Increment Message Counter
// ═══════════════════════════════════════
export async function incrementMessageCount(tenantId: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const key = `usage:msg:${tenantId}:${currentMonth}`;
    const count = await redis.incr(key);
    await redis.expire(key, 86400 * 32);

    if (count % 10 === 0) {
      supabaseAdmin.rpc('set_message_count', { t_id: tenantId, count }).then(({ error }) => { if (error) console.error(error); });
    }
  } else {
    await supabaseAdmin.rpc('increment_message_count', { p_tenant_id: tenantId });
  }
}

// ═══════════════════════════════════════
// CHECK: Is tenant within usage limits?
// ═══════════════════════════════════════
export async function checkUsageLimits(tenant: Tenant): Promise<{
  withinLimits: boolean;
  messagesRemaining: number;
  usagePercent: number;
}> {
  let currentUsage = tenant.messages_used_this_month;
  const currentConvos = tenant.ai_conversations_this_month ?? 0;
  const conversationLimit = tenant.ai_conversation_limit ?? 100;

  const redis = getRedisClient();
  if (redis) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const key = `usage:msg:${tenant.id}:${currentMonth}`;
    const cachedCount = await redis.get(key);
    if (cachedCount) {
      currentUsage = parseInt(cachedCount, 10);
    } else {
      const { data } = await supabaseAdmin.from('tenants').select('messages_used_this_month').eq('id', tenant.id).single();
      if (data) {
        currentUsage = data.messages_used_this_month;
        await redis.set(key, currentUsage.toString(), 'EX', 86400 * 32);
      }
    }
  }

  const messagesRemaining = tenant.message_limit - currentUsage;
  const convosRemaining = conversationLimit - currentConvos;
  
  const usagePercent = Math.round((currentUsage / tenant.message_limit) * 100);

  return {
    withinLimits: messagesRemaining > 0 && convosRemaining > 0,
    messagesRemaining: Math.max(0, messagesRemaining),
    usagePercent: Math.min(100, usagePercent),
  };
}

// ═══════════════════════════════════════
// TENANT CONFIG: For Conversation Engine
// ═══════════════════════════════════════
// Returns a clean config object for the AI conversation engine.
export function getTenantConfig(tenant: Tenant) {
  return {
    businessName: tenant.business_name,
    businessType: tenant.business_type,
    botName: tenant.bot_name,
    botPersonality: tenant.bot_personality,
    phone: tenant.business_phone || '',
    address: tenant.business_address || '',
    website: tenant.business_website || '',
    welcomeOffer: tenant.welcome_offer || '',
    usps: tenant.usps || [],
    staffName: tenant.staff_name || 'our team',
    workingHours: tenant.working_hours,
    hotKeywords: tenant.hot_keywords,
    warmKeywords: tenant.warm_keywords,
    // Fix #7: Custom FAQs flow to AI engine
    customFaqs: tenant.custom_faqs || [],
    // Fix #8: Off-hours config
    offHoursMessage: tenant.off_hours_message,
    offHoursCaptureLead: tenant.off_hours_capture_lead ?? true,
  };
}

```


## src/lib/types/index.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🏗️  Core TypeScript Types — Multi-Tenant SaaS
// ═══════════════════════════════════════════════════════════

// ── Tenant (Client Business) ──
export interface Tenant {
  id: string;
  business_name: string;
  business_type: string;
  business_phone: string | null;
  business_address: string | null;
  business_website: string | null;
  business_email: string | null;
  logo_url: string | null;

  // Bot
  bot_name: string;
  bot_personality: string;
  welcome_message: string | null;
  welcome_offer: string | null;
  usps: string[];
  working_hours: Record<string, string>;

  // WhatsApp
  wa_phone_number_id: string | null;
  wa_access_token: string | null;
  wa_business_account_id: string | null;
  wa_app_secret: string | null;
  wa_verify_token: string;
  wa_webhook_verified: boolean;
  wa_token_expired: boolean;

  // Instagram
  ig_access_token: string | null;
  ig_page_id: string | null;

  // Shopify
  shopify_store_url: string | null;
  shopify_access_token: string | null;
  shopify_webhook_secret: string | null;

  // Billing
  plan: Plan;
  plan_status: PlanStatus;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  trial_ends_at: string;

  // Usage
  messages_used_this_month: number;
  ai_conversations_this_month: number;
  message_limit: number;
  ai_conversation_limit: number;
  current_billing_period_start: string;

  // Staff
  staff_phone: string | null;
  staff_name: string | null;
  manager_phone: string | null;

  // Follow-up Config
  followup_30min: boolean;
  followup_3hr: boolean;
  followup_24hr: boolean;
  followup_7day: boolean;
  escalation_timeout_mins: number;

  // Lead Scoring
  hot_keywords: string[];
  warm_keywords: string[];

  // Custom FAQs (Fix #7)
  custom_faqs: Array<{ question: string; answer: string }>;

  // Off-Hours Config (Fix #8)
  off_hours_message: string | null;
  off_hours_capture_lead: boolean;

  // Meta
  is_active: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export type Plan = 'starter' | 'growth' | 'pro' | 'enterprise';
export type PlanStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';

// ── User (Dashboard login) ──
export interface User {
  id: string;
  tenant_id: string;
  auth_id: string | null;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_platform_admin: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'owner' | 'admin' | 'staff' | 'viewer';

// ── Lead (Customer contact) ──
export interface Lead {
  id: string;
  tenant_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  channel: Channel;
  source_detail: string | null;
  enquiry_type: string | null;
  guest_count: string | null;
  date_requested: string | null;
  occasion: string | null;
  lead_status: LeadStatus;
  lead_score: number;
  staff_assigned: string | null;
  notes: string | null;
  shopify_customer_id: string | null;
  total_order_value: number;
  first_message_at: string;
  last_message_at: string;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Channel = 'whatsapp' | 'instagram_dm' | 'instagram_comment' | 'shopify' | 'website' | 'manual';
export type LeadStatus = 'new' | 'hot' | 'warm' | 'cold' | 'converted' | 'lost';

// ── Conversation ──
export interface Conversation {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  channel: string;
  sender_id: string;
  sender_name: string | null;
  current_step: string;
  flow_type: string | null;
  context: ConversationContext;
  is_active: boolean;
  bot_paused: boolean;
  escalated: boolean;
  escalated_at: string | null;
  escalation_reason: string | null;
  ai_model_used: string;
  ai_tokens_used: number;
  message_count: number;
  last_message_at: string;
  created_at: string;
}

export interface ConversationContext {
  name?: string;
  phone?: string;
  email?: string;
  enquiry_type?: string;
  guest_count?: string;
  date_requested?: string;
  occasion?: string;
  event_type?: string;
  company_name?: string;
  lead_status?: string;
  notes?: string;
  channel?: string;
  instagram_id?: string;
  from_comment?: boolean;
  [key: string]: unknown;
}

// ── Message ──
export interface Message {
  id: string;
  tenant_id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  message_type: MessageType;
  wa_message_id: string | null;
  channel: string;
  sender_id: string | null;
  status: MessageStatus;
  error_message: string | null;
  ai_generated: boolean;
  ai_latency_ms: number | null;
  created_at: string;
}

export type MessageType = 'text' | 'interactive' | 'template' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'reaction';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

// ── Follow-Up ──
export interface FollowUp {
  id: string;
  tenant_id: string;
  lead_id: string;
  conversation_id: string | null;
  follow_up_type: FollowUpType;
  scheduled_at: string;
  message: string | null;
  ai_generated: boolean;
  status: FollowUpStatus;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export type FollowUpType = '30min' | '3hr' | '24hr' | '7day' | 'custom';
export type FollowUpStatus = 'pending' | 'sent' | 'cancelled' | 'failed';

// ── Booking ──
export interface Booking {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  booking_date: string | null;
  booking_time: string | null;
  guest_count: string | null;
  occasion: string | null;
  special_requests: string | null;
  status: BookingStatus;
  staff_assigned: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

// ── Shopify Event ──
export interface ShopifyEvent {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  event_type: ShopifyEventType;
  shopify_order_id: string | null;
  order_value: number | null;
  currency: string;
  cart_recovery_sent: boolean;
  cart_recovered: boolean;
  payload: Record<string, unknown>;
  created_at: string;
}

export type ShopifyEventType = 'order_created' | 'order_fulfilled' | 'order_cancelled' | 'cart_abandoned' | 'checkout_started';

// ── Analytics Event ──
export interface AnalyticsEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  channel: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ═══════════════════════════════════════
// API Request/Response Types
// ═══════════════════════════════════════

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ── Dashboard Stats ──
export interface DashboardStats {
  totalLeads: number;
  newLeadsToday: number;
  activeConversations: number;
  confirmedBookings: number;
  conversionRate: string;
  messagesThisMonth: number;
  messageLimit: number;
  topChannel: string;
  peakHour: string;
  leadsByStatus: { status: string; count: number }[];
  leadsByChannel: { channel: string; count: number }[];
  dailyLeads: { date: string; count: number }[];
}

// ── Admin Stats ──
export interface AdminStats {
  totalTenants: number;
  activeTenants: number;
  totalLeads: number;
  totalMessages: number;
  mrr: number;
  trialConversions: number;
  churnRate: string;
  tenantsByPlan: { plan: string; count: number }[];
  revenueByMonth: { month: string; revenue: number }[];
}

// ── Plan Details ──
export const PLAN_DETAILS: Record<Plan, {
  name: string;
  price: number;
  messageLimit: number;
  aiConversationLimit: number;
  features: string[];
}> = {
  starter: {
    name: 'Starter',
    price: 2499,
    messageLimit: 1000,
    aiConversationLimit: 1000,
    features: ['1 WhatsApp number', 'AI-powered bot', 'Basic dashboard', 'Email support'],
  },
  growth: {
    name: 'Growth',
    price: 4999,
    messageLimit: 5000,
    aiConversationLimit: 5000,
    features: ['Everything in Starter', 'Shopify integration', 'Smart follow-ups', 'Advanced analytics', 'Priority support'],
  },
  pro: {
    name: 'Pro',
    price: 9999,
    messageLimit: 999999,
    aiConversationLimit: 999999,
    features: ['Everything in Growth', 'Unlimited conversations', 'Custom AI personality', 'Green tick assistance', 'Instagram automation', 'Dedicated support'],
  },
  enterprise: {
    name: 'Enterprise',
    price: 0, // Custom
    messageLimit: 999999,
    aiConversationLimit: 999999,
    features: ['Everything in Pro', 'Multi-location', 'Custom integrations', 'Dedicated account manager', 'SLA guarantee'],
  },
};

```


## src/lib/utils/crypto.ts
```ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// We hash the ENCRYPTION_KEY to ensure it's always exactly 32 bytes for aes-256-gcm
function getKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('CRITICAL: ENCRYPTION_KEY environment variable is missing.');
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypts a plaintext string into a secure aes-256-gcm format.
 * Format: iv:authTag:encryptedData
 */
export function encryptToken(text: string | null): string | null {
  if (!text) return null;
  // If it looks like it's already encrypted (has 2 colons), don't double-encrypt
  if (text.split(':').length === 3) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a previously encrypted token. 
 * If it's not encrypted (legacy plain text), it returns it as-is.
 */
export function decryptToken(encryptedText: string | null): string | null {
  if (!encryptedText) return null;
  
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText; // Legacy plaintext or malformed

  try {
    const [ivHex, authTagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv(
      ALGORITHM, 
      getKey(), 
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('❌ Failed to decrypt token (check ENCRYPTION_KEY):', err);
    return encryptedText; // Fallback so we don't completely break if key rotates
  }
}

```


## src/lib/utils/logger.ts
```ts
// ═══════════════════════════════════════════════════════════
// 📋 STRUCTURED LOGGER
// ═══════════════════════════════════════════════════════════
// Provides a structured JSON logging format suitable for 
// ingestion by Datadog, Axiom, or CloudWatch.
// ═══════════════════════════════════════════════════════════

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata,
  };
  
  if (process.env.NODE_ENV === 'development') {
    // Human readable in dev
    const metaStr = metadata ? JSON.stringify(metadata) : '';
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
    console[level](`${prefix} [${level.toUpperCase()}] ${message} ${metaStr}`);
  } else {
    // JSON in production
    console[level](JSON.stringify(payload));
  }
}

export const logger = {
  info: (message: string, metadata?: Record<string, unknown>) => log('info', message, metadata),
  warn: (message: string, metadata?: Record<string, unknown>) => log('warn', message, metadata),
  error: (message: string, metadata?: Record<string, unknown>) => log('error', message, metadata),
  debug: (message: string, metadata?: Record<string, unknown>) => log('debug', message, metadata),
};

```


## src/lib/utils/safety.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🛡️ Error Handling — Crash-Proof Utilities
// ═══════════════════════════════════════════════════════════
// The bot should NEVER crash. These utilities ensure every
// operation is wrapped in error boundaries with logging.
// ═══════════════════════════════════════════════════════════

// ── Safe async wrapper — catches all errors ──
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: string,
  fallback?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    console.error(`❌ [${context}]`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

// ── Retry wrapper — retries on failure ──
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    backoff?: boolean;
    context?: string;
  } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, backoff = true, context = 'operation' } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`❌ [${context}] Failed after ${maxRetries} attempts`);
        throw error;
      }

      const delay = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;
      console.warn(`⚠️ [${context}] Attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw new Error('Unreachable');
}

// ── Timeout wrapper — fails if too slow ──
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  fallback?: T
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (fallback !== undefined) {
        resolve(fallback);
      } else {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        if (fallback !== undefined) {
          resolve(fallback);
        } else {
          reject(error);
        }
      });
  });
}

// ── Rate limiter — per-key limits ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

if (typeof setInterval !== 'undefined') {
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    }
  }, 60000);
  if (cleanup.unref) cleanup.unref();
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetIn: entry.resetAt - now };
}

// ── Sleep utility ──
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Sanitize input ──
export function sanitizeInput(input: string, maxLength = 2000): string {
  return input
    .slice(0, maxLength)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

// ── Validate phone number ──
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

// ── Validate email ──
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

```


## src/lib/webhook/queue.ts
```ts
import { Queue, Worker, type Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { processIncomingMessage } from '@/lib/whatsapp/processor';
import { processIncomingIGMessage } from '@/lib/instagram/processor';
import type { ParsedWhatsAppMessage } from '@/lib/whatsapp/service';
import * as Sentry from '@sentry/nextjs';

const WEBHOOK_QUEUE = 'incoming-webhooks';
let webhookQueue: Queue | null = null;
let webhookWorker: Worker | null = null;

const IG_WEBHOOK_QUEUE = 'ig-incoming-webhooks';
let igWebhookQueue: Queue | null = null;
let igWebhookWorker: Worker | null = null;

export function initWebhookEngine() {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('⚠️ Redis not available, incoming webhooks will be processed synchronously');
    return;
  }

  webhookQueue = new Queue(WEBHOOK_QUEUE, { connection: redis });

  webhookWorker = new Worker(
    WEBHOOK_QUEUE,
    async (job: Job<ParsedWhatsAppMessage>) => {
      await processIncomingMessage(job.data);
    },
    { 
      connection: redis, 
      concurrency: 10,
      lockDuration: 30000,
      stalledInterval: 30000,
      maxStalledCount: 1,
    }
  );

  webhookWorker.on('completed', (job) => {
    console.log(`✅ Webhook job completed: ${job.id}`);
  });

  webhookWorker.on('failed', async (job, err) => {
    console.error(`❌ Webhook job failed: ${job?.id}`, err.message);
    Sentry.captureException(err);
    if (process.env.SLACK_WEBHOOK_URL) {
      fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🚨 *Webhook Job Failed*\nJob ID: ${job?.id}\nError: ${err.message}` })
      }).catch(console.error);
    }
  });

  igWebhookQueue = new Queue(IG_WEBHOOK_QUEUE, { connection: redis });
  igWebhookWorker = new Worker(
    IG_WEBHOOK_QUEUE,
    async (job: Job<{ igPageId: string, senderId: string, messageText: string, messageId: string }>) => {
      await processIncomingIGMessage(job.data.igPageId, job.data.senderId, job.data.messageText, job.data.messageId);
    },
    { 
      connection: redis, 
      concurrency: 10,
      lockDuration: 30000,
      stalledInterval: 30000,
      maxStalledCount: 1,
    }
  );

  igWebhookWorker.on('failed', (job, err) => {
    console.error(`❌ IG Webhook job failed: ${job?.id}`, err.message);
    Sentry.captureException(err);
  });
  
  console.log('🔗 Webhook queue engine started (BullMQ + Redis)');
}

export async function enqueueWebhookMessage(msg: ParsedWhatsAppMessage) {
  if (webhookQueue) {
    await webhookQueue.add('webhook-message', msg, {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });
  } else {
    // Fallback if Redis is not configured
    processIncomingMessage(msg).catch((err) => {
      console.error(err);
      Sentry.captureException(err);
    });
  }
}

export async function enqueueIGWebhookMessage(data: { igPageId: string, senderId: string, messageText: string, messageId: string }) {
  if (igWebhookQueue) {
    await igWebhookQueue.add('ig-webhook-message', data, {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });
  } else {
    processIncomingIGMessage(data.igPageId, data.senderId, data.messageText, data.messageId).catch(console.error);
  }
}

```


## src/lib/whatsapp/processor.ts
```ts
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantByPhoneNumberId, getTenantConfig, incrementMessageCount, checkUsageLimits } from '@/lib/tenant/manager';
import { processMessageWithAI, generateFollowUpMessage } from '@/lib/ai/engine';
import { sendTextMessage, markAsRead, sendStaffAlert, isWhatsAppConfigured, type ParsedWhatsAppMessage } from '@/lib/whatsapp/service';
import { scheduleFollowUp, scheduleConversationTimeout } from '@/lib/followup/engine';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { v4 as uuidv4 } from 'uuid';
import type { Tenant, ConversationContext } from '@/lib/types';

// ═══════════════════════════════════════
// Off-Hours Check
// ═══════════════════════════════════════
function isWithinWorkingHours(tenant: Tenant): { isOpen: boolean; openTime: string; closeTime: string } {
  const workingHours = tenant.working_hours;
  if (!workingHours || Object.keys(workingHours).length === 0) {
    return { isOpen: true, openTime: '09:00', closeTime: '22:00' };
  }

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  const currentTime = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata', // IST for Indian businesses
  });

  const dayMap: Record<number, string[]> = {
    0: ['sun', 'sat-sun', 'weekend'],
    1: ['mon', 'mon-fri', 'weekday'],
    2: ['tue', 'mon-fri', 'weekday'],
    3: ['wed', 'mon-fri', 'weekday'],
    4: ['thu', 'mon-fri', 'weekday'],
    5: ['fri', 'mon-fri', 'weekday'],
    6: ['sat', 'sat-sun', 'weekend'],
  };

  const possibleKeys = dayMap[dayOfWeek] || [];
  let todayHours = '';

  for (const key of possibleKeys) {
    if (workingHours[key]) {
      todayHours = workingHours[key];
      break;
    }
  }

  if (!todayHours) {
    const firstKey = Object.keys(workingHours)[0];
    todayHours = workingHours[firstKey] || '09:00-22:00';
  }

  const [openTime, closeTime] = todayHours.split('-').map((t) => t.trim());

  if (!openTime || !closeTime) {
    return { isOpen: true, openTime: '09:00', closeTime: '22:00' };
  }

  const isOpen = currentTime >= openTime && currentTime <= closeTime;
  return { isOpen, openTime, closeTime };
}

function getOffHoursMessage(tenant: Tenant, senderName: string, openTime: string): string {
  const name = (senderName || 'there').split(' ')[0];
  const welcomeMessage = tenant.welcome_message;

  if (welcomeMessage && welcomeMessage.includes('{off_hours}')) {
    return welcomeMessage
      .replace('{off_hours}', '')
      .replace('{customer_name}', name)
      .replace('{business_name}', tenant.business_name)
      .replace('{open_time}', openTime);
  }

  return `Hi ${name}! 🌙 Thanks for reaching out to ${tenant.business_name}.\n\nWe're currently closed (open from ${openTime}). I've noted your enquiry and our team will get back to you first thing when we open.\n\nIn the meantime, can I get your name and what you're looking for? We'll make sure to prioritize your request! 🙏`;
}

// ═══════════════════════════════════════
// Core Message Processor
// ═══════════════════════════════════════
export async function processIncomingMessage(msg: ParsedWhatsAppMessage) {
  const senderId = msg.from;
  const senderName = msg.profileName;
  const messageText = msg.text;
  const messageId = msg.messageId;
  const phoneNumberId = msg.phoneNumberId;

  // ── Step 1: Find the tenant ──
  const tenant = await getTenantByPhoneNumberId(phoneNumberId);
  if (!tenant) {
    console.warn(`⚠️ No tenant found for phone_number_id: ${phoneNumberId}`);
    return;
  }

  if (!tenant.is_active || tenant.plan_status === 'cancelled' || tenant.plan_status === 'suspended') {
    console.warn(`⚠️ [${tenant.business_name}] Tenant inactive or plan suspended, skipping`);
    return;
  }

  // ── Rate limit per sender ──
  const rateCheck = await checkRedisRateLimit(`sender:${senderId}`, 30, 60000);
  if (!rateCheck.allowed) {
    console.warn(`⚠️ Rate limit hit for sender ${senderId}`);
    return;
  }

  // ── Check usage limits ──
  const usage = await checkUsageLimits(tenant);
  if (!usage.withinLimits) {
    console.warn(`⚠️ [${tenant.business_name}] Message limit exceeded`);
    try {
      await sendTextMessage(tenant, senderId, `Thank you for reaching out! Our team will get back to you shortly. 🙏`);
    } catch { /* ignore */ }
    return;
  }

  console.log(`📥 [${tenant.business_name}] ${senderName} (${senderId}): ${messageText}`);

  // ── Step 2: Mark as read ──
  await markAsRead(tenant, messageId);

  // ── Step 3: Increment usage counter ──
  await incrementMessageCount(tenant.id);

  // ── Step 4: Find or create conversation ──
  let conversation = await getActiveConversation(tenant.id, senderId, 'whatsapp');

  if (conversation) {
    // ── Fix: Conversation Context Timeout ──
    const hoursSinceLastMessage = (Date.now() - new Date(conversation.last_message_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastMessage > 24) {
      console.log(`⏰ [${tenant.business_name}] Conversation ${conversation.id} timed out. Resetting context.`);
      await updateConversation(conversation.id, 'timed_out', conversation.context || {});
      await supabaseAdmin.from('conversations').update({ is_active: false }).eq('id', conversation.id);
      
      conversation = await createNewConversation(tenant, senderId, senderName, messageText, messageId);
      return;
    }
  } else {
    conversation = await createNewConversation(tenant, senderId, senderName, messageText, messageId);
    return;
  }

  // ── Step 5: Check off-hours ──
  const { isOpen, openTime } = isWithinWorkingHours(tenant);
  if (!isOpen) {
    const offHoursReply = getOffHoursMessage(tenant, senderName, openTime);
    await logMessage(tenant.id, conversation.id, 'inbound', messageText, 'whatsapp', senderId, false, messageId);
    await sendTextMessage(tenant, senderId, offHoursReply);
    await logMessage(tenant.id, conversation.id, 'outbound', offHoursReply, 'whatsapp', 'bot', true);
    await updateConversation(conversation.id, conversation.current_step, conversation.context || {});
    console.log(`🌙 [${tenant.business_name}] Off-hours response sent to ${senderName}`);
    return;
  }

  // ── Step 6: Handle Human Handoff ──
  if (conversation.bot_paused) {
    await logMessage(tenant.id, conversation.id, 'inbound', messageText, 'whatsapp', senderId, false, messageId);
    console.log(`⏸️ [${tenant.business_name}] Bot is paused. Ignored message from ${senderName}.`);
    return;
  }

  // ── Step 7: Load conversation history ──
  const history = await getConversationHistory(conversation.id);

  // ── Step 8: Process through AI engine ──
  const tenantConfig = getTenantConfig(tenant);
  const context: ConversationContext = conversation.context || {};

  const aiResponse = await processMessageWithAI(
    messageText,
    history,
    context,
    tenantConfig,
    tenant.id
  );

  // ── Step 8: Log inbound message ──
  await logMessage(tenant.id, conversation.id, 'inbound', messageText, 'whatsapp', senderId, false, messageId);

  // ── Step 9: Send reply ──
  let sendError: Error | null = null;
  try {
    await sendTextMessage(tenant, senderId, aiResponse.reply);
  } catch (err) {
    sendError = err as Error;
  }
  
  await logMessage(tenant.id, conversation.id, 'outbound', sendError ? `[FAILED TO SEND] ${aiResponse.reply}` : aiResponse.reply, 'whatsapp', 'bot', true);
  if (sendError) throw sendError;

  // ── Step 10: Update conversation state ──
  const updatedContext: ConversationContext = { ...context, ...aiResponse.extractedData };
  await updateConversation(conversation.id, aiResponse.nextStep, updatedContext);

  // ── Step 11: Schedule conversation timeout ──
  await scheduleConversationTimeout(conversation.id, tenant.id);

  // ── Step 12: Handle escalation ──
  if (aiResponse.shouldEscalate) {
    await handleEscalation(tenant, conversation.id, senderId, senderName, aiResponse, updatedContext);
  }

  // ── Step 13: Save lead when enough data ──
  if (aiResponse.nextStep === 'confirmation' || aiResponse.nextStep === 'completed') {
    await saveLead(tenant, conversation, updatedContext, senderId);
  }

  // ── Step 14: Schedule follow-ups via BullMQ ──
  if (aiResponse.nextStep === 'confirmation') {
    await scheduleFollowUps(tenant, conversation, updatedContext);
  }
}

// ═══════════════════════════════════════
// Database Helpers
// ═══════════════════════════════════════

async function getActiveConversation(tenantId: string, senderId: string, channel: string) {
  const { data } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('sender_id', senderId)
    .eq('channel', channel)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (data) {
    data.context = typeof data.context === 'string' ? JSON.parse(data.context) : data.context;
  }
  return data;
}

async function createNewConversation(
  tenant: Tenant,
  senderId: string,
  senderName: string,
  firstMessage: string,
  messageId?: string
) {
  const leadId = uuidv4();
  const convId = uuidv4();

  await supabaseAdmin.from('leads').insert({
    id: leadId,
    tenant_id: tenant.id,
    name: senderName,
    phone: senderId,
    channel: 'whatsapp',
    lead_status: 'new',
  });

  const context: ConversationContext = { name: senderName };
  await supabaseAdmin.from('conversations').insert({
    id: convId,
    tenant_id: tenant.id,
    lead_id: leadId,
    channel: 'whatsapp',
    sender_id: senderId,
    sender_name: senderName,
    current_step: 'greeting',
    context,
  });

  await logMessage(tenant.id, convId, 'inbound', firstMessage, 'whatsapp', senderId, false, messageId);

  const { isOpen, openTime } = isWithinWorkingHours(tenant);

  let greeting: string;
  if (!isOpen) {
    greeting = getOffHoursMessage(tenant, senderName, openTime);
  } else {
    const tenantConfig = getTenantConfig(tenant);
    greeting = `Hey ${(senderName || 'there').split(' ')[0]} 👋 Welcome to ${tenantConfig.businessName}!\n\nI'm ${tenantConfig.botName}, your automated AI assistant.\n\nHow can I help you today?\n\n🍽️ Reserve a Table\n🎉 Plan an Event\n💼 Corporate Booking\n📋 General Enquiry`;
  }

  if (isWhatsAppConfigured(tenant)) {
    await sendTextMessage(tenant, senderId, greeting);
  }

  await logMessage(tenant.id, convId, 'outbound', greeting, 'whatsapp', 'bot');

  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenant.id,
    event_type: 'new_lead',
    channel: 'whatsapp',
    metadata: { name: senderName, phone: senderId },
  });

  // Increment the monthly AI conversation counter
  await supabaseAdmin.rpc('increment_ai_conversations', { p_tenant_id: tenant.id });

  await scheduleConversationTimeout(convId, tenant.id);

  console.log(`✨ [${tenant.business_name}] New lead: ${senderName} (${senderId})`);

  const { data } = await supabaseAdmin.from('conversations').select('*').eq('id', convId).single();
  return data;
}

async function getConversationHistory(conversationId: string) {
  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('direction, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(40);

  return (messages || []).map((m) => ({
    role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content: m.content,
  }));
}

async function logMessage(
  tenantId: string,
  conversationId: string,
  direction: 'inbound' | 'outbound',
  content: string,
  channel: string,
  senderId: string,
  aiGenerated = false,
  waMessageId?: string
) {
  await supabaseAdmin.from('messages').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    direction,
    content,
    channel,
    sender_id: senderId,
    ai_generated: aiGenerated,
    wa_message_id: waMessageId || null,
  });

  await supabaseAdmin
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
}

async function updateConversation(conversationId: string, nextStep: string, context: ConversationContext) {
  await supabaseAdmin
    .from('conversations')
    .update({
      current_step: nextStep,
      context,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
}

async function handleEscalation(
  tenant: Tenant,
  conversationId: string,
  senderId: string,
  senderName: string,
  aiResponse: Awaited<ReturnType<typeof processMessageWithAI>>,
  context: ConversationContext
) {
  await supabaseAdmin
    .from('conversations')
    .update({
      escalated: true,
      escalated_at: new Date().toISOString(),
      escalation_reason: aiResponse.escalationReason,
    })
    .eq('id', conversationId);

  const alertMsg = `🔔 ESCALATION\n\n👤 ${senderName} (${senderId})\n📲 Channel: WhatsApp\n⚠️ Reason: ${aiResponse.escalationReason}\n🏢 ${tenant.business_name}\n\nContext: ${context.enquiry_type || 'General'}`;
  await sendStaffAlert(tenant, alertMsg);

  console.log(`⚠️ [${tenant.business_name}] Escalated: ${senderName} — ${aiResponse.escalationReason}`);
}

async function saveLead(
  tenant: Tenant,
  conversation: Record<string, unknown>,
  context: ConversationContext,
  senderId: string
) {
  await supabaseAdmin
    .from('leads')
    .update({
      name: context.name,
      phone: context.phone || senderId,
      email: context.email,
      enquiry_type: context.enquiry_type,
      guest_count: context.guest_count,
      date_requested: context.date_requested,
      occasion: context.occasion,
      lead_status: 'warm',
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversation.lead_id);

  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenant.id,
    event_type: 'lead_captured',
    channel: 'whatsapp',
    metadata: context,
  });

  console.log(`💾 [${tenant.business_name}] Lead saved: ${context.name}`);
}

async function scheduleFollowUps(
  tenant: Tenant,
  conversation: Record<string, unknown>,
  context: ConversationContext
) {
  const now = Date.now();
  const tenantConfig = getTenantConfig(tenant);
  const leadId = conversation.lead_id as string;
  const convId = conversation.id as string;
  const leadPhone = (context.phone || conversation.sender_id) as string;
  const leadName = context.name || 'Customer';

  const followUps: Array<{
    id: string;
    tenant_id: string;
    lead_id: string;
    conversation_id: string;
    follow_up_type: string;
    scheduled_at: string;
    message: string | null;
    ai_generated: boolean;
    delayMs: number;
  }> = [];

  if (tenant.followup_30min) {
    const delayMs = 30 * 60 * 1000;
    const id = uuidv4();
    followUps.push({
      id,
      tenant_id: tenant.id,
      lead_id: leadId,
      conversation_id: convId,
      follow_up_type: '30min',
      scheduled_at: new Date(now + delayMs).toISOString(),
      message: null,
      ai_generated: true,
      delayMs,
    });
  }

  if (tenant.followup_3hr) {
    const delayMs = 3 * 60 * 60 * 1000;
    const id = uuidv4();
    followUps.push({
      id,
      tenant_id: tenant.id,
      lead_id: leadId,
      conversation_id: convId,
      follow_up_type: '3hr',
      scheduled_at: new Date(now + delayMs).toISOString(),
      message: null,
      ai_generated: true,
      delayMs,
    });
  }

  if (tenant.followup_24hr) {
    const delayMs = 24 * 60 * 60 * 1000;
    const id = uuidv4();
    followUps.push({
      id,
      tenant_id: tenant.id,
      lead_id: leadId,
      conversation_id: convId,
      follow_up_type: '24hr',
      scheduled_at: new Date(now + delayMs).toISOString(),
      message: null,
      ai_generated: true,
      delayMs,
    });
  }

  if (tenant.followup_7day) {
    const delayMs = 7 * 24 * 60 * 60 * 1000;
    const id = uuidv4();
    followUps.push({
      id,
      tenant_id: tenant.id,
      lead_id: leadId,
      conversation_id: convId,
      follow_up_type: '7day',
      scheduled_at: new Date(now + delayMs).toISOString(),
      message: null,
      ai_generated: true,
      delayMs,
    });
  }

  if (followUps.length > 0) {
    await supabaseAdmin.from('follow_ups').insert(
      followUps.map(({ delayMs, ...f }) => f) // eslint-disable-line @typescript-eslint/no-unused-vars
    );

    for (const fu of followUps) {
      await scheduleFollowUp({
        followUpId: fu.id,
        tenantId: tenant.id,
        leadId: leadId,
        conversationId: convId,
        followUpType: fu.follow_up_type,
        message: fu.message,
        leadPhone,
        leadName,
        delayMs: fu.delayMs,
      });
    }

    console.log(`⏰ [${tenant.business_name}] ${followUps.length} follow-ups scheduled (BullMQ)`);
  }
}

```


## src/lib/whatsapp/service.ts
```ts
// ═══════════════════════════════════════════════════════════
// 📲 WhatsApp Cloud API Service — Multi-Tenant
// ═══════════════════════════════════════════════════════════
// Every function takes a `tenant` parameter so it uses
// THAT client's WhatsApp credentials, not a global config.
// ═══════════════════════════════════════════════════════════

import crypto from 'crypto';
import axios from 'axios';
import type { Tenant } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { withRetry } from '@/lib/utils/safety';
import { decryptToken } from '@/lib/utils/crypto';
import { Resend } from 'resend';
import { invalidateCache } from '@/lib/tenant/manager';

const WA_API_VERSION = 'v21.0';
const WA_API_BASE = `https://graph.facebook.com/${WA_API_VERSION}`;

// ── Headers for a specific tenant ──
function getHeaders(tenant: Tenant) {
  return {
    Authorization: `Bearer ${decryptToken(tenant.wa_access_token)}`,
    'Content-Type': 'application/json',
  };
}

function getMessagesUrl(tenant: Tenant) {
  return `${WA_API_BASE}/${tenant.wa_phone_number_id}/messages`;
}

export function isWhatsAppConfigured(tenant: Tenant): boolean {
  return !!(tenant.wa_phone_number_id && tenant.wa_access_token);
}

// ═══════════════════════════════════════
// SEND: Text Message
// ═══════════════════════════════════════
export async function sendTextMessage(tenant: Tenant, to: string, text: string) {
  const phone = to.replace(/[^0-9]/g, '');

  if (!isWhatsAppConfigured(tenant)) {
    console.log(`📤 [DEMO] ${tenant.business_name} → ${phone}: ${text.slice(0, 80)}...`);
    return { messaging_product: 'whatsapp', status: 'demo', to: phone };
  }

  try {
    const { data } = await withRetry(async () => {
      return await axios.post(
        getMessagesUrl(tenant),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { preview_url: true, body: text },
        },
        { headers: getHeaders(tenant), timeout: 10000 }
      );
    }, { maxRetries: 3, delayMs: 1000, context: 'sendTextMessage' });

    console.log(`📤 [${tenant.business_name}] WA → ${phone} (${data.messages?.[0]?.id})`);
    return data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: { error?: { message?: string; code?: number } }; status?: number }; message?: string };
    const errData = axiosError.response?.data?.error;
    const httpStatus = axiosError.response?.status;
    console.error(`❌ [${tenant.business_name}] WA send error:`, errData?.message || axiosError.message);

    // ── Fix #13: Detect expired token (401) ──
    if (httpStatus === 401 || errData?.code === 190) {
      console.error(`🔑 [${tenant.business_name}] ACCESS TOKEN EXPIRED — flagging tenant`);
      await handleTokenExpiry(tenant);
    }

    if (errData?.code === 131047) {
      console.error('   → 24h window expired. Use a template message.');
    }
    throw error;
  }
}

// ═══════════════════════════════════════
// SEND: Interactive Buttons (max 3)
// ═══════════════════════════════════════
export async function sendButtonMessage(
  tenant: Tenant,
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[]
) {
  const phone = to.replace(/[^0-9]/g, '');
  if (!isWhatsAppConfigured(tenant)) {
    console.log(`📤 [DEMO] ${tenant.business_name} Buttons → ${phone}`);
    return { status: 'demo' };
  }

  const buttonRows = buttons.slice(0, 3).map((btn, i) => ({
    type: 'reply',
    reply: { id: btn.id || `btn_${i}`, title: btn.title.slice(0, 20) },
  }));

  try {
    const { data } = await axios.post(
      getMessagesUrl(tenant),
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: { buttons: buttonRows },
        },
      },
      { headers: getHeaders(tenant), timeout: 10000 }
    );

    console.log(`📤 [${tenant.business_name}] Buttons → ${phone}`);
    return data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { status?: number, data?: { error?: { code?: number } } } };
    if (axiosError.response?.status === 401 || axiosError.response?.data?.error?.code === 190) {
      await handleTokenExpiry(tenant);
    }
    throw error;
  }
}

// ═══════════════════════════════════════
// SEND: Interactive List
// ═══════════════════════════════════════
export async function sendListMessage(
  tenant: Tenant,
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
) {
  const phone = to.replace(/[^0-9]/g, '');
  if (!isWhatsAppConfigured(tenant)) {
    console.log(`📤 [DEMO] ${tenant.business_name} List → ${phone}`);
    return { status: 'demo' };
  }

  try {
    const { data } = await axios.post(
      getMessagesUrl(tenant),
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: bodyText },
          action: {
            button: buttonLabel.slice(0, 20),
            sections: sections.map((sec) => ({
              title: sec.title,
              rows: sec.rows.map((r) => ({
                id: r.id,
                title: r.title.slice(0, 24),
                description: r.description?.slice(0, 72),
              })),
            })),
          },
        },
      },
      { headers: getHeaders(tenant), timeout: 10000 }
    );

    console.log(`📤 [${tenant.business_name}] List → ${phone}`);
    return data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { status?: number, data?: { error?: { code?: number } } } };
    if (axiosError.response?.status === 401 || axiosError.response?.data?.error?.code === 190) {
      await handleTokenExpiry(tenant);
    }
    throw error;
  }
}

// ═══════════════════════════════════════
// SEND: Template Message (for 24h+ window)
// ═══════════════════════════════════════
export async function sendTemplateMessage(
  tenant: Tenant,
  to: string,
  templateName: string,
  languageCode = 'en',
  components: Record<string, unknown>[] = []
) {
  const phone = to.replace(/[^0-9]/g, '');
  if (!isWhatsAppConfigured(tenant)) {
    console.log(`📤 [DEMO] ${tenant.business_name} Template → ${phone}: ${templateName}`);
    return { status: 'demo' };
  }

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };

  if (components.length > 0) {
    (payload.template as Record<string, unknown>).components = components;
  }

  try {
    const { data } = await axios.post(getMessagesUrl(tenant), payload, {
      headers: getHeaders(tenant),
      timeout: 10000,
    });

    console.log(`📤 [${tenant.business_name}] Template → ${phone} (${templateName})`);
    return data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { status?: number, data?: { error?: { code?: number } } } };
    if (axiosError.response?.status === 401 || axiosError.response?.data?.error?.code === 190) {
      await handleTokenExpiry(tenant);
    }
    throw error;
  }
}

// ═══════════════════════════════════════
// SEND: Mark as Read
// ═══════════════════════════════════════
export async function markAsRead(tenant: Tenant, messageId: string) {
  if (!isWhatsAppConfigured(tenant)) return;

  try {
    await axios.post(
      getMessagesUrl(tenant),
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers: getHeaders(tenant), timeout: 5000 }
    );
  } catch {
    // Non-critical, don't throw
  }
}

// ═══════════════════════════════════════
// SEND: Staff Alert
// ═══════════════════════════════════════
export async function sendStaffAlert(tenant: Tenant, alertText: string) {
  if (tenant.staff_phone) {
    await sendTextMessage(tenant, tenant.staff_phone, alertText).catch(() => {});
  }
  if (tenant.manager_phone && tenant.manager_phone !== tenant.staff_phone) {
    await sendTextMessage(tenant, tenant.manager_phone, alertText).catch(() => {});
  }
}

// ═══════════════════════════════════════
// WEBHOOK: Verify (GET)
// ═══════════════════════════════════════
export function verifyWebhook(
  queryParams: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string },
  expectedToken: string
): { valid: boolean; challenge?: string } {
  const mode = queryParams['hub.mode'];
  const token = queryParams['hub.verify_token'];
  const challenge = queryParams['hub.challenge'];

  if (mode === 'subscribe' && token === expectedToken) {
    return { valid: true, challenge };
  }
  return { valid: false };
}

// ═══════════════════════════════════════
// WEBHOOK: Verify Signature
// ═══════════════════════════════════════
export function verifySignature(rawBody: string, signature: string, appSecret: string): boolean {
  if (!appSecret) return true; // Skip in dev

  const decryptedSecret = decryptToken(appSecret) || appSecret;
  const expected = crypto.createHmac('sha256', decryptedSecret).update(rawBody).digest('hex');
  return signature === `sha256=${expected}`;
}

// ═══════════════════════════════════════
// WEBHOOK: Parse Incoming Payload
// ═══════════════════════════════════════
export interface ParsedWhatsAppMessage {
  messageId: string;
  from: string;
  timestamp: string;
  profileName: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  type: string;
  text: string;
  buttonReplyId: string | null;
  buttonReplyTitle: string | null;
  listReplyId: string | null;
  listReplyTitle: string | null;
  isReaction: boolean;
  isStatusUpdate: boolean;
  media: Record<string, unknown> | null;
  location: Record<string, unknown> | null;
  referral: Record<string, unknown> | null;
  status?: string;
  recipientId?: string;
  errors?: unknown[];
}

export function parseWebhookPayload(body: Record<string, unknown>): ParsedWhatsAppMessage[] {
  const messages: ParsedWhatsAppMessage[] = [];
  const entries = (body?.entry as Record<string, unknown>[]) || [];

  for (const entry of entries) {
    const changes = (entry.changes as Record<string, unknown>[]) || [];

    for (const change of changes) {
      if (change.field !== 'messages') continue;

      const value = change.value as Record<string, unknown>;
      if (!value) continue;

      const metadata = (value.metadata as Record<string, string>) || {};
      const contacts = (value.contacts as Record<string, unknown>[]) || [];
      const msgs = (value.messages as Record<string, unknown>[]) || [];

      for (const msg of msgs) {
        const contact = contacts.find(
          (c) => (c as Record<string, string>).wa_id === (msg as Record<string, string>).from
        ) as Record<string, unknown> | undefined;
        const profileName = ((contact?.profile as Record<string, string>)?.name) || '';

        const parsed: ParsedWhatsAppMessage = {
          messageId: msg.id as string,
          from: msg.from as string,
          timestamp: msg.timestamp as string,
          profileName,
          phoneNumberId: metadata.phone_number_id || '',
          displayPhoneNumber: metadata.display_phone_number || '',
          type: msg.type as string,
          text: '',
          buttonReplyId: null,
          buttonReplyTitle: null,
          listReplyId: null,
          listReplyTitle: null,
          isReaction: false,
          isStatusUpdate: false,
          media: null,
          location: null,
          referral: (msg.referral as Record<string, unknown>) || null,
        };

        switch (msg.type) {
          case 'text':
            parsed.text = ((msg.text as Record<string, string>)?.body) || '';
            break;
          case 'interactive': {
            const interactive = msg.interactive as Record<string, unknown>;
            if (interactive?.type === 'button_reply') {
              const reply = interactive.button_reply as Record<string, string>;
              parsed.buttonReplyId = reply.id;
              parsed.buttonReplyTitle = reply.title;
              parsed.text = reply.title;
            } else if (interactive?.type === 'list_reply') {
              const reply = interactive.list_reply as Record<string, string>;
              parsed.listReplyId = reply.id;
              parsed.listReplyTitle = reply.title;
              parsed.text = reply.title;
            }
            break;
          }
          case 'button': {
            const button = msg.button as Record<string, string>;
            parsed.text = button?.text || '';
            parsed.buttonReplyId = button?.payload || '';
            break;
          }
          case 'image':
          case 'video':
          case 'audio':
          case 'document':
          case 'sticker':
            parsed.media = (msg[msg.type as string] as Record<string, unknown>) || null;
            parsed.text = ((msg[msg.type as string] as Record<string, string>)?.caption) || `[${msg.type}]`;
            break;
          case 'location':
            parsed.location = msg.location as Record<string, unknown>;
            parsed.text = `📍 Location shared`;
            break;
          case 'reaction':
            parsed.isReaction = true;
            parsed.text = ((msg.reaction as Record<string, string>)?.emoji) || '';
            break;
          default:
            parsed.text = `[${msg.type}]`;
        }

        messages.push(parsed);
      }

      // Status updates
      const statuses = (value.statuses as Record<string, unknown>[]) || [];
      for (const status of statuses) {
        messages.push({
          messageId: status.id as string,
          from: '',
          timestamp: status.timestamp as string,
          profileName: '',
          phoneNumberId: metadata.phone_number_id || '',
          displayPhoneNumber: '',
          type: 'status_update',
          text: '',
          buttonReplyId: null,
          buttonReplyTitle: null,
          listReplyId: null,
          listReplyTitle: null,
          isReaction: false,
          isStatusUpdate: true,
          media: null,
          location: null,
          referral: null,
          status: status.status as string,
          recipientId: status.recipient_id as string,
          errors: (status.errors as unknown[]) || [],
        });
      }
    }
  }

  return messages;
}

// ═══════════════════════════════════════
// Fix #13: Token Expiry Handler
// ═══════════════════════════════════════
// When a 401 is detected, flag the tenant and alert admin.
async function handleTokenExpiry(tenant: Tenant): Promise<void> {
  try {
    // Flag the tenant's token as expired and clear access token
    await supabaseAdmin
      .from('tenants')
      .update({
        wa_webhook_verified: false,
        wa_token_expired: true,
        wa_access_token: null,
      })
      .eq('id', tenant.id);
      
    await invalidateCache(tenant.id);

    // Log analytics event
    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenant.id,
      event_type: 'token_expired',
      channel: 'whatsapp',
      metadata: {
        business_name: tenant.business_name,
        phone_number_id: tenant.wa_phone_number_id,
        detected_at: new Date().toISOString(),
      },
    });

    if (process.env.RESEND_API_KEY && tenant.business_email) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'System Alerts <alerts@projectbolt.com>',
        to: tenant.business_email,
        subject: '⚠️ ACTION REQUIRED: WhatsApp Connection Disconnected',
        html: `
          <h2>WhatsApp Connection Error</h2>
          <p>Hello ${tenant.business_name},</p>
          <p>Your WhatsApp Cloud API token has expired or been revoked. Your AI Assistant is currently offline.</p>
          <p>Please log in to your dashboard and reconnect your WhatsApp account immediately to resume service.</p>
        `,
      }).catch(e => console.error('Failed to send expiry email:', e));
    }

    // Alert platform admin via WhatsApp if configured
    const adminPhone = process.env.PLATFORM_ADMIN_PHONE;
    if (adminPhone) {
      // Direct axios call to send alert to admin using global credentials if available
      console.log(`📱 Admin alert: Token expired for ${tenant.business_name}`);
    }

    console.error(`🔑 [${tenant.business_name}] Token flagged as expired in Supabase. Client needs to reconnect.`);
  } catch (err) {
    console.error('❌ Failed to handle token expiry:', err);
  }
}



```


## src/middleware.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🔒 Auth Proxy — Protect Dashboard Routes (Next.js 16)
// ═══════════════════════════════════════════════════════════
// Checks for a valid Supabase session on every dashboard
// and admin route. Redirects to /login if not authenticated.
// ═══════════════════════════════════════════════════════════

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that require authentication
const PROTECTED_ROUTES = ['/dashboard', '/admin'];
// Routes that should redirect to dashboard if already logged in
const AUTH_ROUTES = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-protected routes
  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (!isProtected && !isAuthRoute) {
    return NextResponse.next();
  }

  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'https://your-project.supabase.co') {
    // Supabase not configured — allow access in development
    return NextResponse.next();
  }

  // Create a Supabase client with cookies from the request
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Get the user session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected route but no session → redirect to login
  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Auth route but already logged in → redirect to dashboard
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Admin routes require platform admin check
  if (pathname.startsWith('/admin') && user) {
    // We can't easily check is_platform_admin in middleware without
    // a DB query. The admin page itself handles this via API.
    // But we ensure they're at least authenticated.
  }

  return response;
}

export const config = {
  matcher: [
    // Match all dashboard and admin routes
    '/dashboard/:path*',
    '/admin/:path*',
    '/login',
    '/signup',
  ],
};

```


## package.json
```json
{
  "name": "project-bolt",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@bull-board/api": "^7.0.0",
    "@bull-board/express": "^7.0.0",
    "@bull-board/ui": "^7.0.0",
    "@google/genai": "^1.50.1",
    "@sentry/nextjs": "^10.49.0",
    "@supabase/ssr": "^0.10.2",
    "@supabase/supabase-js": "^2.103.3",
    "axios": "^1.15.0",
    "bcryptjs": "^3.0.3",
    "bullmq": "^5.74.1",
    "express": "^5.2.1",
    "ioredis": "^5.10.1",
    "jsonwebtoken": "^9.0.3",
    "next": "16.2.4",
    "razorpay": "^2.9.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "recharts": "^3.8.1",
    "resend": "^6.12.2",
    "uuid": "^13.0.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/bcryptjs": "^2.4.6",
    "@types/express": "^5.0.6",
    "@types/jsonwebtoken": "^9.0.10",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/uuid": "^10.0.0",
    "eslint": "^9",
    "eslint-config-next": "16.2.4",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}

```


## next.config.ts
```ts
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://checkout.razorpay.com; connect-src 'self' https://api.razorpay.com wss://*; frame-src 'self' https://js.stripe.com https://checkout.razorpay.com; img-src 'self' data: https: blob:; style-src 'self' 'unsafe-inline';" },
      ],
    }];
  },
  async rewrites() {
    const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
    return [
      {
        source: '/admin/queue/:path*',
        destination: `${workerUrl}/admin/queue/:path*`, // Proxy to Bull-Board worker
      },
      {
        source: '/admin/queue',
        destination: `${workerUrl}/admin/queue`, // Handle the base route
      }
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "project-bolt",
  project: "project-bolt",
  silent: !process.env.CI,
  widenClientFileUpload: true,
});

```


## worker.ts
```ts
// ═══════════════════════════════════════════════════════════
// 🚀 STANDALONE BULLMQ WORKER
// ═══════════════════════════════════════════════════════════
// This must be run as a separate process on a persistent server
// (e.g. Render, Railway, EC2) via `npx tsx worker.ts`.
// It cannot run on Vercel Serverless.
// ═══════════════════════════════════════════════════════════

import { initFollowUpEngine, shutdownFollowUpEngine } from './src/lib/followup/engine';
import { initWebhookEngine } from './src/lib/webhook/queue';
import { initBroadcastEngine, shutdownBroadcastEngine } from './src/lib/broadcast/queue';

// Bull-Board Imports
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { getRedisClient } from './src/lib/redis/client';

console.log('🚀 Starting standalone BullMQ worker process...');

// Initialize all queue processors
initFollowUpEngine();
initWebhookEngine();
initBroadcastEngine();

// Setup Bull-Board
const redis = getRedisClient();
if (redis) {
  const webhookQueue = new Queue('incoming-webhooks', { connection: redis });
  const igWebhookQueue = new Queue('ig-incoming-webhooks', { connection: redis });
  const broadcastQueue = new Queue('broadcast-jobs', { connection: redis });
  const followupQueue = new Queue('follow-ups', { connection: redis });
  const timeoutQueue = new Queue('conversation-timeouts', { connection: redis });

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queue');

  createBullBoard({
    queues: [
      new BullMQAdapter(webhookQueue),
      new BullMQAdapter(igWebhookQueue),
      new BullMQAdapter(broadcastQueue),
      new BullMQAdapter(followupQueue),
      new BullMQAdapter(timeoutQueue),
    ],
    serverAdapter: serverAdapter,
  });

  const app = express();
  app.use('/admin/queue', serverAdapter.getRouter());
  app.listen(3001, () => {
    console.log('📊 Bull Board running on port 3001. Accessible via Next.js proxy at /admin/queue');
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received. Shutting down workers gracefully...');
  await shutdownFollowUpEngine();
  await shutdownBroadcastEngine();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received. Shutting down workers gracefully...');
  await shutdownFollowUpEngine();
  await shutdownBroadcastEngine();
  process.exit(0);
});

```


## .env.example
```example
# ═══════════════════════════════════════
# 🔧 Project Bolt — Environment Variables
# ═══════════════════════════════════════
# Copy this to .env.local and fill in your values

# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DB_URL=postgres://postgres.[YOUR-PROJECT-REF]:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres

# ── Google Gemini AI ──
GEMINI_API_KEY=your-gemini-api-key

# ── Razorpay Payments ──
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
RAZORPAY_WEBHOOK_SECRET=your-razorpay-webhook-secret
RAZORPAY_PLAN_STARTER=plan_XXXXXX
RAZORPAY_PLAN_GROWTH=plan_XXXXXX
RAZORPAY_PLAN_PRO=plan_XXXXXX

# ── Redis (Upstash or self-hosted) ──
# Used for: BullMQ job queue, webhook deduplication, rate limiting
# NOTE: Project uses ioredis which requires standard TCP Redis URL, NOT the REST API.
REDIS_URL=rediss://default:your-password@your-redis-host:6379

# ── Meta WhatsApp / Facebook ──
# Get these from: https://developers.facebook.com/apps/
NEXT_PUBLIC_META_APP_ID=your-meta-app-id
NEXT_PUBLIC_META_CONFIG_ID=your-embedded-signup-config-id
META_APP_SECRET=your-meta-app-secret
GLOBAL_WEBHOOK_VERIFY_TOKEN=generate-a-random-string-here
WA_CLOUD_API_PIN=generate-a-random-6-digit-pin

# ── App Config ──
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Project Bolt

# ── Security ──
JWT_SECRET=generate-a-random-64-char-string-here
CRON_SECRET=generate-a-random-string-for-cron-auth

# ── Platform Admin ──
PLATFORM_ADMIN_EMAIL=your-email@gmail.com
PLATFORM_ADMIN_PHONE=+919876543210

```


## vercel.json
```json
{
  "crons": [
    {
      "path": "/api/cron/timeout",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/instagram-refresh",
      "schedule": "0 2 * * *"
    }
  ]
}

```
