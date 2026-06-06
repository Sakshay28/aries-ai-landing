// ═══════════════════════════════════════════════════════════
// 📈 Meta Ads — ROI Analytics Engine
// ═══════════════════════════════════════════════════════════
// Aggregates campaign_analytics + campaign_leads into the ROI
// dashboard payload: KPI cards, daily series, conversion funnel.
// ?filter=today|yesterday|last_7_days|last_30_days|custom
// &date_from=&date_to=&campaign_id=
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireUser, errorResponse } from '@/lib/meta-ads/guard';
import { dateFilterSchema } from '@/lib/meta-ads/validation';
import { resolveDateRange, enumerateDays } from '@/lib/meta-ads/dates';
import type { ROIDashboard } from '@/lib/meta-ads/types';

export async function GET(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    const { searchParams } = new URL(req.url);
    const parsed = dateFilterSchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid filter', details: parsed.error.flatten() }, { status: 400 });
    }
    const { from, to } = resolveDateRange(parsed.data.filter, parsed.data.date_from, parsed.data.date_to);
    const campaignId = searchParams.get('campaign_id');

    // ── Daily analytics rows ──
    let analyticsQuery = supabaseAdmin
      .from('campaign_analytics')
      .select('date, impressions, clicks, spend, leads, conversations, bookings, revenue')
      .eq('tenant_id', tenantId)
      .gte('date', from)
      .lte('date', to);
    if (campaignId) analyticsQuery = analyticsQuery.eq('campaign_id', campaignId);

    const { data: rows, error } = await analyticsQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ── Aggregate per-day (sum across campaigns) ──
    const byDay = new Map<string, {
      date: string; impressions: number; clicks: number; spend: number;
      leads: number; conversations: number; bookings: number; revenue: number;
    }>();

    for (const day of enumerateDays(from, to)) {
      byDay.set(day, { date: day, impressions: 0, clicks: 0, spend: 0, leads: 0, conversations: 0, bookings: 0, revenue: 0 });
    }

    let totalSpend = 0, totalImpressions = 0, totalClicks = 0;
    let totalLeads = 0, totalConversations = 0, totalBookings = 0, totalRevenue = 0;

    for (const r of rows || []) {
      const bucket = byDay.get(r.date) || { date: r.date, impressions: 0, clicks: 0, spend: 0, leads: 0, conversations: 0, bookings: 0, revenue: 0 };
      bucket.impressions += Number(r.impressions) || 0;
      bucket.clicks += Number(r.clicks) || 0;
      bucket.spend += Number(r.spend) || 0;
      bucket.leads += Number(r.leads) || 0;
      bucket.conversations += Number(r.conversations) || 0;
      bucket.bookings += Number(r.bookings) || 0;
      bucket.revenue += Number(r.revenue) || 0;
      byDay.set(r.date, bucket);

      totalImpressions += Number(r.impressions) || 0;
      totalClicks += Number(r.clicks) || 0;
      totalSpend += Number(r.spend) || 0;
      totalLeads += Number(r.leads) || 0;
      totalConversations += Number(r.conversations) || 0;
      totalBookings += Number(r.bookings) || 0;
      totalRevenue += Number(r.revenue) || 0;
    }

    // ── WhatsApp opens (from campaign_leads with ctwa source in range) ──
    let leadsQuery = supabaseAdmin
      .from('campaign_leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', from)
      .lte('created_at', `${to}T23:59:59`);
    if (campaignId) leadsQuery = leadsQuery.eq('campaign_id', campaignId);
    const { count: whatsappOpens } = await leadsQuery;

    const dashboard: ROIDashboard = {
      total_spend: Math.round(totalSpend * 100) / 100,
      total_leads: totalLeads,
      total_conversations: totalConversations,
      total_bookings: totalBookings,
      cost_per_lead: totalLeads > 0 ? Math.round((totalSpend / totalLeads) * 100) / 100 : 0,
      cost_per_booking: totalBookings > 0 ? Math.round((totalSpend / totalBookings) * 100) / 100 : 0,
      roas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0,
      daily_metrics: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)) as ROIDashboard['daily_metrics'],
      funnel: {
        impressions: totalImpressions,
        clicks: totalClicks,
        whatsapp_opens: whatsappOpens || 0,
        conversations: totalConversations,
        bookings: totalBookings,
      },
    };

    return NextResponse.json(dashboard);
  } catch (err) {
    return errorResponse(err);
  }
}
