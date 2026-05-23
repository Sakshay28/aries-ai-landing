import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

// ── helpers ──────────────────────────────────────────────────────────────────
function getMediaType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType === 'application/pdf' ||
    mimeType.includes('document') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('presentation') ||
    mimeType === 'text/plain' ||
    mimeType === 'text/csv'
  ) return 'document';
  return 'file';
}

function getMessageType(mimeType: string): string {
  const t = getMediaType(mimeType);
  if (t === 'image') return 'image';
  if (t === 'video') return 'video';
  if (t === 'audio') return 'audio';
  if (t === 'document') return 'document';
  return 'document'; // generic files as document type
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  // Videos
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/webm',
  'audio/x-m4a', 'audio/aac',
  // Documents
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  // Archives
  'application/zip', 'application/x-rar-compressed', 'application/x-zip-compressed',
  'application/octet-stream', // fallback for unknown
]);

// ── Upload handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const conversationId = formData.get('conversationId') as string | null;
    const caption = (formData.get('caption') as string | null) || '';

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }
    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'No conversationId provided' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: `File too large. Max size is 50 MB.` }, { status: 413 });
    }

    // Determine MIME type (use detected type or file.type fallback)
    const mimeType = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      console.warn(`[upload] Unrecognized mime type: ${mimeType}, allowing as octet-stream`);
    }

    // Verify conversation belongs to this tenant
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id, tenant_id, channel')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single();

    if (convErr || !conv) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    // Build storage path: tenantId/conversationId/timestamp_filename
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${tenantId}/${conversationId}/${timestamp}_${safeName}`;

    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
      .from('chat-attachments')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadErr || !uploadData) {
      console.error('[upload] Storage error:', uploadErr);
      return NextResponse.json({ success: false, error: 'File upload failed' }, { status: 500 });
    }

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('chat-attachments')
      .getPublicUrl(storagePath);

    const mediaUrl = publicUrlData.publicUrl;
    const messageType = getMessageType(mimeType);

    // Insert message record with media metadata
    const { data: insertedMsg, error: insertErr } = await supabaseAdmin
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'outbound',
        content: caption || file.name, // fallback content for search/display
        message_type: messageType,
        channel: conv.channel || 'whatsapp',
        sender_id: null,
        status: 'sent',
        ai_generated: false,
        media_url: mediaUrl,
        file_name: file.name,
        file_size: file.size,
        mime_type: mimeType,
        media_caption: caption || null,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[upload] DB insert error:', insertErr);
      // Clean up uploaded file on insert failure
      await supabaseAdmin.storage.from('chat-attachments').remove([storagePath]);
      return NextResponse.json({ success: false, error: 'Failed to save message' }, { status: 500 });
    }

    // Update conversation last_message_at
    await supabaseAdmin
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    console.log(`[upload] ✅ Uploaded ${file.name} (${file.size} bytes) → ${mediaUrl}`);

    return NextResponse.json({
      success: true,
      message: insertedMsg,
      mediaUrl,
      fileName: file.name,
      fileSize: file.size,
      mimeType,
    });

  } catch (err) {
    console.error('[upload] Unexpected error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
