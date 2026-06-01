import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { sanitizeInput, isValidEmail } from '@/lib/utils/safety';
import { normalizePhone, isValidPhone } from '@/lib/utils/phone';

const updateContactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional().nullable(),
  phone: z.string().trim().min(7).max(20).optional(),
  email: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  defaultCountryCode: z.string().trim().max(5).optional(),
});

// ═════════════════════════════════════════════════════════
// PATCH — update single contact scoped to tenant
// ═════════════════════════════════════════════════════════
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, message: 'Unauthorized access.' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, message: 'Contact ID is required.' }, { status: 400 });
    }

    let rawBody;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Malformed JSON payload.' }, { status: 400 });
    }

    const parsed = updateContactSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, message: `${firstIssue.path.join('.')}: ${firstIssue.message}` },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const updatePayload: Record<string, any> = {};

    if (body.name !== undefined) {
      updatePayload.name = body.name ? sanitizeInput(body.name, 120) : null;
    }

    if (body.phone !== undefined) {
      const defaultCountryCode = body.defaultCountryCode ?? '91';
      const phone = normalizePhone(body.phone, defaultCountryCode);
      if (!isValidPhone(phone)) {
        return NextResponse.json({ success: false, message: 'Phone number format is invalid.' }, { status: 400 });
      }
      
      // Duplicate check: ensure we don't change this contact's phone to another contact's phone
      const { data: duplicate } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone', phone)
        .neq('id', id)
        .maybeSingle();

      if (duplicate) {
        return NextResponse.json({ success: false, message: 'Another contact with this phone number already exists.' }, { status: 409 });
      }
      updatePayload.phone = phone;
    }

    if (body.email !== undefined) {
      if (body.email && !isValidEmail(body.email)) {
        return NextResponse.json({ success: false, message: 'Email address is invalid.' }, { status: 400 });
      }
      updatePayload.email = body.email;
    }

    if (body.notes !== undefined) {
      updatePayload.notes = body.notes ? sanitizeInput(body.notes, 2000) : null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ success: false, message: 'No fields provided to update.' }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('leads')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      console.error('PATCH /api/dashboard/contacts/[id] error:', error);
      return NextResponse.json({ success: false, message: 'Failed to update contact.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Contact updated successfully.',
      data: updated,
    });
  } catch (err: any) {
    console.error('PATCH /api/dashboard/contacts/[id] crash:', err);
    return NextResponse.json({ success: false, message: 'An internal server error occurred.' }, { status: 500 });
  }
}

// ═════════════════════════════════════════════════════════
// DELETE — remove single contact scoped to tenant
// ═════════════════════════════════════════════════════════
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, message: 'Unauthorized access.' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, message: 'Contact ID is required.' }, { status: 400 });
    }

    // Securely delete scoped to the tenant
    const { error } = await supabaseAdmin
      .from('leads')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('DELETE /api/dashboard/contacts/[id] error:', error);
      return NextResponse.json({ success: false, message: 'Failed to delete contact.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Contact deleted successfully.',
    });
  } catch (err: any) {
    console.error('DELETE /api/dashboard/contacts/[id] crash:', err);
    return NextResponse.json({ success: false, message: 'An internal server error occurred.' }, { status: 500 });
  }
}
