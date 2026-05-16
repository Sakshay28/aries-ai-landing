import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Fetch Messages (last 7 days)
  const { data: messages } = await supabase
    .from('messages')
    .select('created_at, direction, ai_generated')
    .eq('tenant_id', tenantId)
    .gte('created_at', sevenDaysAgo);

  // 2. Fetch Leads
  const { data: leads } = await supabase
    .from('leads')
    .select('lead_status')
    .eq('tenant_id', tenantId);

  // 3. Process Message Data into daily chart format
  const volumeDataMap: Record<string, { date: string; inbound: number; outbound: number; ai: number }> = {};
  
  // Initialize last 7 days with 0
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    volumeDataMap[dateStr] = { date: dateStr, inbound: 0, outbound: 0, ai: 0 };
  }

  let totalAiMessages = 0;
  
  if (messages) {
    messages.forEach(m => {
      const dateStr = new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (volumeDataMap[dateStr]) {
        if (m.direction === 'inbound') volumeDataMap[dateStr].inbound++;
        if (m.direction === 'outbound') volumeDataMap[dateStr].outbound++;
        if (m.ai_generated) {
          volumeDataMap[dateStr].ai++;
          totalAiMessages++;
        }
      }
    });
  }

  const volumeData = Object.values(volumeDataMap);

  // 4. Process Lead Data
  let hot = 0, warm = 0, cold = 0;
  if (leads) {
    leads.forEach(l => {
      if (l.lead_status === 'hot') hot++;
      else if (l.lead_status === 'warm') warm++;
      else cold++; // cold or new
    });
  }

  const pipelineData = [
    { name: 'Hot', value: hot, color: '#EF4444' }, // Red
    { name: 'Warm', value: warm, color: '#F59E0B' }, // Amber
    { name: 'Cold', value: cold, color: '#3B82F6' }, // Blue
  ];

  return NextResponse.json({
    success: true,
    data: {
      volumeData,
      pipelineData,
      summary: {
        totalMessages: messages?.length || 0,
        totalLeads: leads?.length || 0,
        aiHandled: messages?.length ? Math.round((totalAiMessages / messages.filter(m => m.direction === 'outbound').length) * 100) || 0 : 0
      }
    }
  });
}
