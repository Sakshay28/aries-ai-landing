import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { decryptToken } from '@/lib/utils/crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { deleteMetaTemplate, buildMetaComponents, createMetaTemplate } from '@/lib/meta/templates';

// ── PATCH: Edit/update a template ──────────────
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;

    // Verify ownership
    const { data: existing } = await supabaseAdmin
      .from('draft_templates')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    // Update local draft
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const allowedFields = [
      'category', 'subtype', 'language', 'header_type', 'header_text',
      'header_media_url', 'body', 'footer', 'buttons_json', 'variables_json',
      'delivery_mode', 'validity_period',
    ];
    for (const field of allowedFields) {
      const bodyKey = field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
        .replace('Json', '');
      // Map camelCase body keys to snake_case DB fields
      if (field === 'buttons_json' && body.buttons !== undefined) updateData.buttons_json = body.buttons;
      else if (field === 'variables_json' && body.variableMap !== undefined) updateData.variables_json = body.variableMap;
      else if (field === 'header_type' && body.headerType !== undefined) updateData.header_type = body.headerType;
      else if (field === 'header_text' && body.headerText !== undefined) updateData.header_text = body.headerText;
      else if (field === 'header_media_url' && body.headerMediaUrl !== undefined) updateData.header_media_url = body.headerMediaUrl;
      else if (field === 'delivery_mode' && body.otpMode !== undefined) updateData.delivery_mode = body.otpMode;
      else if (field === 'validity_period' && body.validityPeriod !== undefined) updateData.validity_period = body.validityPeriod;
      else if (body[bodyKey] !== undefined) updateData[field] = body[bodyKey];
    }
    // Handle body separately (avoid conflict with request.json body variable)
    if (body.bodyText !== undefined) updateData.body = body.bodyText;
    if (body.status !== undefined) updateData.status = body.status;

    await supabaseAdmin
      .from('draft_templates')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId);

    // If resubmitting to Meta (status was REJECTED or user explicitly wants to resubmit)
    if (body.resubmit === true) {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('wa_access_token, wa_business_account_id')
        .eq('id', tenantId)
        .single();

      if (tenant?.wa_access_token && tenant?.wa_business_account_id) {
        const apiKey = decryptToken(tenant.wa_access_token as string);
        if (apiKey) {
          const current = { ...existing, ...updateData };
          const components = buildMetaComponents({
            headerType: current.header_type as string,
            headerText: current.header_text as string | undefined,
            headerMediaUrl: current.header_media_url as string | undefined,
            body: current.body as string,
            footer: current.footer as string | undefined,
            buttons: ((current.buttons_json as unknown[]) ?? []) as { type: string; text: string; url?: string; urlType?: string; phoneNumber?: string }[],
            variableMap: (current.variables_json as Record<string, number>) ?? {},
            category: current.category as string,
            otpMode: current.delivery_mode as string | undefined,
            securityRecommendation: true,
            validityPeriod: current.validity_period as number | undefined,
          });

          try {
            const result = await createMetaTemplate(apiKey, tenant.wa_business_account_id as string, {
              name: current.normalized_name as string,
              category: current.category as string,
              language: current.language as string,
              components,
            });
            await supabaseAdmin
              .from('draft_templates')
              .update({
                meta_template_id: result.id,
                status: result.status,
                submitted_at: new Date().toISOString(),
                rejection_reason: null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', id);
            return NextResponse.json({ success: true, data: { status: result.status, metaTemplateId: result.id } });
          } catch (metaErr) {
            return NextResponse.json({ success: false, error: (metaErr as Error).message }, { status: 502 });
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ── DELETE: Remove template from Meta + local DB ──
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const url = new URL(_request.url);
    const queryName = url.searchParams.get('name');

    // Is id a valid UUID format?
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

    let template: { id?: string; normalized_name?: string; meta_template_id?: string } | null = null;

    if (isUuid) {
      const { data } = await supabaseAdmin
        .from('draft_templates')
        .select('id, normalized_name, meta_template_id')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      template = data;
    } else {
      const { data } = await supabaseAdmin
        .from('draft_templates')
        .select('id, normalized_name, meta_template_id')
        .eq('meta_template_id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      template = data;
    }

    const templateName = template?.normalized_name || queryName;

    // Delete from Meta (best-effort — don't fail if Meta call fails)
    if (templateName) {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('wa_access_token, wa_business_account_id')
        .eq('id', tenantId)
        .single();

      if (tenant?.wa_access_token && tenant?.wa_business_account_id) {
        const apiKey = decryptToken(tenant.wa_access_token as string);
        if (apiKey) {
          try {
            await deleteMetaTemplate(
              apiKey,
              tenant.wa_business_account_id as string,
              templateName
            );
          } catch (e) {
            console.error('Meta delete failed (non-blocking):', (e as Error).message);
          }
        }
      }
    }

    // Delete from local DB if it was found
    if (template?.id) {
      await supabaseAdmin
        .from('draft_templates')
        .delete()
        .eq('id', template.id)
        .eq('tenant_id', tenantId);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
