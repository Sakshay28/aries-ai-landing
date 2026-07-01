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
    .select('lead_status, lead_score, ai_confidence, booking_probability, human_intervention_probability')
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

  // 4. Process Lead Data into 7 CRM stages
  let newCount = 0;
  let interestedCount = 0;
  let qualifiedCount = 0;
  let hotCount = 0;
  let convertedCount = 0;
  let coldCount = 0;
  let lostCount = 0;

  let totalScore = 0;
  let totalConfidence = 0;
  let totalBookingProb = 0;
  let totalHumanProb = 0;
  let leadsWithAI = 0;

  if (leads) {
    leads.forEach(l => {
      const status = l.lead_status;
      if (status === 'new') newCount++;
      else if (status === 'interested' || status === 'warm') interestedCount++;
      else if (status === 'qualified') qualifiedCount++;
      else if (status === 'hot') hotCount++;
      else if (status === 'converted') convertedCount++;
      else if (status === 'cold') coldCount++;
      else if (status === 'lost') lostCount++;

      if (l.lead_score !== null) {
        totalScore += l.lead_score;
      }
      if (l.ai_confidence !== null) {
        totalConfidence += l.ai_confidence;
        leadsWithAI++;
      }
      if (l.booking_probability !== null) {
        totalBookingProb += l.booking_probability;
      }
      if (l.human_intervention_probability !== null) {
        totalHumanProb += l.human_intervention_probability;
      }
    });
  }

  const pipelineData = [
    { name: 'New', value: newCount, color: '#3B82F6' },
    { name: 'Interested', value: interestedCount, color: '#FB923C' },
    { name: 'Qualified', value: qualifiedCount, color: '#8B5CF6' },
    { name: 'Hot', value: hotCount, color: '#EF4444' },
    { name: 'Converted', value: convertedCount, color: '#10B981' },
    { name: 'Cold', value: coldCount, color: '#64748B' },
    { name: 'Lost', value: lostCount, color: '#F87171' },
  ];

  const totalLeads = leads?.length || 0;
  const avgLeadScore = totalLeads ? Math.round(totalScore / totalLeads) : 0;
  const avgConfidence = leadsWithAI ? Math.round(totalConfidence / leadsWithAI) : 0;
  const avgBookingProb = totalLeads ? Math.round(totalBookingProb / totalLeads) : 0;
  const avgHumanProb = totalLeads ? Math.round(totalHumanProb / totalLeads) : 0;

  return NextResponse.json({
    success: true,
    data: {
      volumeData,
      pipelineData,
      summary: {
        totalMessages: messages?.length || 0,
        totalLeads,
        aiHandled: messages?.length ? Math.round((totalAiMessages / messages.filter(m => m.direction === 'outbound').length) * 100) || 0 : 0,
        avgLeadScore,
        avgConfidence,
        avgBookingProb,
        avgHumanProb,
      }
    }
  });
}
