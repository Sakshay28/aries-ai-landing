import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { BroadcastRecipientService } from '@/lib/broadcast/services/broadcast-recipient.service';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId, audience } = await req.json();
    if (!audience) {
      return NextResponse.json({ success: false, error: 'Audience config is required' }, { status: 400 });
    }

    const result = await BroadcastRecipientService.resolveBroadcastAudience(
      tenantId,
      campaignId || 'temp-preview',
      audience
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('API Broadcast Recipients POST Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message || 'Failed to resolve audience' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');
    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId is required' }, { status: 400 });
    }

    const result = await BroadcastRecipientService.getCampaignRecipients(tenantId, campaignId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('API Broadcast Recipients GET Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message || 'Failed to retrieve recipients' }, { status: 500 });
  }
}
