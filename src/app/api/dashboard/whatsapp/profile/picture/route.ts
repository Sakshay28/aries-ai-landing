import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';

const META_BASE = 'https://graph.facebook.com/v21.0';

async function getMetaCreds(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('wa_phone_number_id, wa_business_account_id, wa_access_token')
    .eq('id', tenantId)
    .single();

  if (error || !data?.wa_phone_number_id || !data?.wa_access_token) {
    throw new Error('WhatsApp credentials not configured');
  }

  const token = decryptToken(data.wa_access_token);
  if (!token) throw new Error('Failed to decrypt access token');

  return {
    phoneNumberId: data.wa_phone_number_id,
    businessAccountId: data.wa_business_account_id as string | null,
    token,
  };
}

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { phoneNumberId, businessAccountId, token } = await getMetaCreds(tenantId);

    if (!businessAccountId) {
      return NextResponse.json(
        { error: 'WhatsApp Business Account ID not configured' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      return NextResponse.json({ error: 'Only JPG and PNG images are supported' }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 });
    }

    // Step 1: Create an upload session
    const sessionRes = await fetch(
      `${META_BASE}/${businessAccountId}/uploads?file_length=${file.size}&file_type=${encodeURIComponent(file.type)}&access_token=${token}`,
      { method: 'POST' }
    );
    const sessionJson = await sessionRes.json();
    if (!sessionRes.ok || !sessionJson.id) {
      return NextResponse.json(
        { error: sessionJson.error?.message ?? 'Failed to create upload session' },
        { status: 500 }
      );
    }

    // Step 2: Upload the file bytes
    const fileBuffer = await file.arrayBuffer();
    const uploadRes = await fetch(
      `https://upload.facebook.com/resumable_upload/${sessionJson.id}`,
      {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${token}`,
          file_offset: '0',
          'Content-Type': 'application/octet-stream',
        },
        body: fileBuffer,
      }
    );
    const uploadJson = await uploadRes.json();
    if (!uploadRes.ok || !uploadJson.h) {
      return NextResponse.json(
        { error: uploadJson.error?.message ?? 'File upload failed' },
        { status: 500 }
      );
    }

    // Step 3: Set the handle on the WhatsApp Business profile
    const profileRes = await fetch(`${META_BASE}/${phoneNumberId}/whatsapp_business_profile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', profile_picture_handle: uploadJson.h }),
    });
    const profileJson = await profileRes.json();
    if (!profileRes.ok) {
      return NextResponse.json(
        { error: profileJson.error?.message ?? 'Profile picture update failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
