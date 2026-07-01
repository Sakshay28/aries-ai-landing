import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { decryptToken } from '@/lib/utils/crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  listMetaTemplates,
  createMetaTemplate,
  buildMetaComponents,
} from '@/lib/meta/templates';

// ── HELPERS: Parse Meta components array format into flat fields ──
function parseMetaComponents(components: any[] = []) {
  let headerType: string = 'NONE';
  let headerText: string = '';
  let headerMediaUrl: string = '';
  let body: string = '';
  let footer: string = '';
  let buttons: any[] = [];

  const headerComp = components.find((c) => c.type === 'HEADER');
  if (headerComp) {
    if (headerComp.format === 'TEXT') {
      headerType = 'TEXT';
      headerText = headerComp.text ?? '';
    } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerComp.format)) {
      headerType = headerComp.format;
      headerMediaUrl = headerComp.example?.header_handle?.[0] ?? '';
    }
  }

  const bodyComp = components.find((c) => c.type === 'BODY');
  if (bodyComp) {
    body = bodyComp.text ?? '';
  }

  const footerComp = components.find((c) => c.type === 'FOOTER');
  if (footerComp) {
    footer = footerComp.text ?? '';
  }

  const buttonsComp = components.find((c) => c.type === 'BUTTONS');
  if (buttonsComp && Array.isArray(buttonsComp.buttons)) {
    buttons = buttonsComp.buttons.map((b: any, index: number) => {
      let type = 'QUICK_REPLY';
      if (b.type === 'URL') type = 'URL';
      else if (b.type === 'PHONE_NUMBER') type = 'PHONE_NUMBER';
      else if (b.type === 'COPY_CODE') type = 'COPY_CODE';

      return {
        id: `btn-${index}-${Date.now()}`,
        type,
        text: b.text ?? '',
        url: b.url,
        phoneNumber: b.phone_number,
        urlType: b.url ? (b.example ? 'DYNAMIC' : 'STATIC') : undefined,
      };
    });
  }

  return { headerType, headerText, headerMediaUrl, body, footer, buttons };
}

function parseVariables(bodyText: string) {
  const map: Record<string, number> = {};
  if (!bodyText) return map;
  const matches = bodyText.matchAll(/\{\{(\d+)\}\}/g);
  for (const match of matches) {
    const idx = parseInt(match[1]);
    map[`variable_${idx}`] = idx;
  }
  return map;
}

// ── GET: List templates (Meta + local drafts merged) ──
export async function GET() {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_business_account_id')
      .eq('id', tenantId)
      .single();

    // Fetch local drafts (always, regardless of Meta config)
    const { data: localDrafts } = await supabaseAdmin
      .from('draft_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false });

    const drafts = (localDrafts ?? []).map((d) => ({
      id: d.meta_template_id || d.id,
      localId: d.id,
      name: d.normalized_name,
      category: d.category,
      subtype: d.subtype,
      language: d.language,
      status: d.status,
      rejectionReason: d.rejection_reason,
      headerType: d.header_type,
      headerText: d.header_text,
      headerMediaUrl: d.header_media_url,
      body: d.body,
      footer: d.footer,
      buttons: d.buttons_json ?? [],
      variableMap: d.variables_json ?? {},
      eventType: d.event_type ?? null,
      usageCount: d.usage_count ?? 0,
      updatedAt: d.updated_at,
      createdAt: d.created_at,
    }));

    // If no Meta credentials, return drafts only
    if (!tenant?.wa_access_token || !tenant?.wa_business_account_id) {
      return NextResponse.json({ success: true, data: drafts });
    }

    const apiKey = decryptToken(tenant.wa_access_token as string);
    if (!apiKey) {
      return NextResponse.json({ success: true, data: drafts });
    }

    // Fetch from Meta and merge with local data
    let metaTemplates: Record<string, unknown>[] = [];
    try {
      const result = await listMetaTemplates(apiKey, tenant.wa_business_account_id as string);
      metaTemplates = result.templates;
    } catch (err) {
      console.error('Meta template list fetch failed:', (err as Error).message);
      // Return drafts on Meta failure — don't fail completely
      return NextResponse.json({ success: true, data: drafts, metaError: true });
    }

    // Merge: local drafts have priority for metadata, Meta has priority for status
    const metaById = new Map<string, Record<string, unknown>>();
    const metaByName = new Map<string, Record<string, unknown>>();
    for (const t of metaTemplates) {
      if (t.id) metaById.set(t.id as string, t);
      if (t.name) metaByName.set(t.name as string, t);
    }

    // Update local drafts with Meta status
    const merged = drafts.map((d) => {
      const metaRecord = (d.id && metaById.get(d.id)) || (d.name && metaByName.get(d.name));
      if (metaRecord) {
        const parsed = metaRecord.components ? parseMetaComponents(metaRecord.components as any[]) : {
          headerType: 'NONE',
          headerText: '',
          headerMediaUrl: '',
          body: '',
          footer: '',
          buttons: [],
        };
        return {
          ...d,
          status: (metaRecord.status as string) ?? d.status,
          rejectionReason: (metaRecord.rejected_reason as string) ?? d.rejectionReason,
          id: (metaRecord.id as string) ?? d.id,
          // Fallbacks for draft properties from Meta
          body: d.body || parsed.body,
          headerType: d.headerType === 'NONE' || !d.headerType ? parsed.headerType : d.headerType,
          headerText: d.headerText || parsed.headerText,
          headerMediaUrl: d.headerMediaUrl || parsed.headerMediaUrl,
          footer: d.footer || parsed.footer,
          buttons: d.buttons && d.buttons.length > 0 ? d.buttons : parsed.buttons,
          variableMap: d.variableMap && Object.keys(d.variableMap).length > 0 ? d.variableMap : parseVariables(d.body || parsed.body),
        };
      }
      return d;
    });

    // Include any Meta templates not in local DB (created via Meta UI)
    const localNames = new Set(drafts.map((d) => d.name));
    const metaOnly = metaTemplates
      .filter((t) => t.name && !localNames.has(t.name as string))
      .map((t) => {
        const parsed = t.components ? parseMetaComponents(t.components as any[]) : {
          headerType: 'NONE',
          headerText: '',
          headerMediaUrl: '',
          body: '',
          footer: '',
          buttons: [],
        };
        const variableMap = parseVariables(parsed.body);
        return {
          id: t.id as string,
          localId: undefined,
          name: t.name as string,
          category: t.category as string,
          language: t.language as string,
          status: t.status as string,
          rejectionReason: t.rejected_reason as string | undefined,
          usageCount: 0,
          updatedAt: undefined,
          createdAt: undefined,
          // Flattened properties
          body: parsed.body,
          headerType: parsed.headerType,
          headerText: parsed.headerText,
          headerMediaUrl: parsed.headerMediaUrl,
          footer: parsed.footer,
          buttons: parsed.buttons,
          variableMap,
        };
      });

    return NextResponse.json({ success: true, data: [...merged, ...metaOnly] });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('GET /api/dashboard/templates error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ── POST: Create template (save locally + submit to Meta) ──
export async function POST(request: Request) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as {
      name: string;
      normalizedName: string;
      category: string;
      subtype?: string;
      language: string;
      headerType: string;
      headerText?: string;
      headerMediaUrl?: string;
      bodyText: string;
      footer?: string;
      buttons: unknown[];
      variableMap: Record<string, number>;
      otpMode?: string;
      securityRecommendation?: boolean;
      validityPeriod?: number;
      saveDraftOnly?: boolean;
      localDraftId?: string;
    };

    const {
      normalizedName,
      category,
      subtype = 'Default',
      language,
      headerType,
      headerText,
      headerMediaUrl,
      bodyText,
      footer,
      buttons = [],
      variableMap = {},
      otpMode,
      securityRecommendation,
      validityPeriod,
      saveDraftOnly = false,
      localDraftId,
    } = body;

    if (!normalizedName || !bodyText || !category) {
      return NextResponse.json(
        { success: false, error: 'name, bodyText, and category are required' },
        { status: 400 }
      );
    }

    // ── Upsert local draft ──
    const draftData = {
      tenant_id: tenantId,
      normalized_name: normalizedName,
      category,
      subtype,
      language,
      header_type: headerType,
      header_text: headerText ?? null,
      header_media_url: headerMediaUrl ?? null,
      body: bodyText,
      footer: footer ?? null,
      buttons_json: buttons,
      variables_json: variableMap,
      delivery_mode: otpMode ?? null,
      validity_period: validityPeriod ?? null,
      updated_at: new Date().toISOString(),
    };

    let savedDraftId = localDraftId;

    if (localDraftId) {
      await supabaseAdmin
        .from('draft_templates')
        .update(draftData)
        .eq('id', localDraftId)
        .eq('tenant_id', tenantId);
    } else {
      const { data: inserted } = await supabaseAdmin
        .from('draft_templates')
        .insert({ ...draftData, status: 'DRAFT', created_at: new Date().toISOString() })
        .select('id')
        .single();
      savedDraftId = inserted?.id;
    }

    // If saving draft only, return here
    if (saveDraftOnly) {
      return NextResponse.json({ success: true, localDraftId: savedDraftId });
    }

    // ── Submit to Meta ──
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_business_account_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_business_account_id) {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp not configured. Please connect WhatsApp in Settings.',
        localDraftId: savedDraftId,
      }, { status: 400 });
    }

    const apiKey = decryptToken(tenant.wa_access_token as string);
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Invalid access token', localDraftId: savedDraftId }, { status: 500 });
    }

    // Build Meta components
    const typedButtons = (buttons as { type: string; text: string; url?: string; urlType?: string; phoneNumber?: string }[]);
    const components = buildMetaComponents({
      headerType,
      headerText,
      headerMediaUrl,
      body: bodyText,
      footer,
      buttons: typedButtons,
      variableMap,
      category,
      otpMode,
      securityRecommendation,
      validityPeriod,
    });

    let metaResult: { id: string; status: string };
    try {
      metaResult = await createMetaTemplate(apiKey, tenant.wa_business_account_id as string, {
        name: normalizedName,
        category,
        language,
        components,
      });
    } catch (metaErr) {
      const msg = (metaErr as Error).message;
      // Still update draft with error info
      if (savedDraftId) {
        await supabaseAdmin
          .from('draft_templates')
          .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
          .eq('id', savedDraftId);
      }
      return NextResponse.json({ success: false, error: msg, localDraftId: savedDraftId }, { status: 502 });
    }

    // Update local draft with Meta result
    if (savedDraftId) {
      await supabaseAdmin
        .from('draft_templates')
        .update({
          meta_template_id: metaResult.id,
          status: metaResult.status,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', savedDraftId);
    }

    return NextResponse.json({
      success: true,
      data: { metaTemplateId: metaResult.id, status: metaResult.status },
      localDraftId: savedDraftId,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    console.error('POST /api/dashboard/templates error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
