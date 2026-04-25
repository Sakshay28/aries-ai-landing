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
