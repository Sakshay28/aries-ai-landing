import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';

interface MetaTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<{
    type: string;
    text: string;
    url?: string;
    phone_number?: string;
  }>;
  example?: {
    header_handle?: string[];
    body_text?: string[][];
  };
}

interface MetaTemplateRaw {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: MetaTemplateComponent[];
}

export class MetaTemplateSyncService {
  /**
   * Fetches Approved Meta WhatsApp templates from Meta's API and syncs them to the cache table.
   */
  static async syncTemplates(tenantId: string): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      // 1. Fetch credentials
      const { data: tenant, error: tenantErr } = await supabaseAdmin
        .from('tenants')
        .select('wa_access_token, wa_phone_number_id, wa_business_account_id')
        .eq('id', tenantId)
        .single();

      if (tenantErr || !tenant) {
        return { success: false, error: 'Tenant business account details not found' };
      }

      if (!tenant.wa_access_token || !tenant.wa_business_account_id) {
        return { success: false, error: 'Meta WhatsApp integrations credentials not active yet' };
      }

      const accessToken = decryptToken(tenant.wa_access_token) as string;
      const wabaId = tenant.wa_business_account_id;

      // 2. Query Meta API
      const res = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=250`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { success: false, error: `Meta API returned status ${res.status}: ${errorText}` };
      }

      const data = await res.json();
      const metaTemplates: MetaTemplateRaw[] = data.data || [];

      let syncedCount = 0;

      // 3. Normalize and cache each template
      for (const t of metaTemplates) {
        const bodyComponent = t.components?.find(c => c.type === 'BODY');
        const headerComponent = t.components?.find(c => c.type === 'HEADER');
        const footerComponent = t.components?.find(c => c.type === 'FOOTER');
        const buttonComponent = t.components?.find(c => c.type === 'BUTTONS');

        const normalizedTemplate = {
          tenant_id: tenantId,
          meta_template_id: t.id,
          name: t.name,
          category: t.category,
          language: t.language,
          status: t.status,
          template_json: {
            name: t.name,
            category: t.category,
            language: t.language,
            status: t.status,
            body: bodyComponent?.text || '',
            headerType: headerComponent?.format || 'NONE',
            headerText: headerComponent?.text || undefined,
            headerMediaUrl: headerComponent?.example?.header_handle?.[0] || undefined,
            footer: footerComponent?.text || undefined,
            buttons: buttonComponent?.buttons?.map(b => ({
              type: b.type,
              text: b.text,
              url: b.url,
              phoneNumber: b.phone_number
            })) || [],
            components: t.components
          },
          synced_at: new Date().toISOString()
        };

        // Cache database update (using conflict mapping on tenant + template name + language)
        const { error: upsertErr } = await supabaseAdmin
          .from('broadcast_templates_cache')
          .upsert(normalizedTemplate, {
            onConflict: 'tenant_id, name, language'
          });

        if (upsertErr) {
          console.error(`❌ Failed to cache template ${t.name}:`, upsertErr.message);
        } else {
          syncedCount++;
        }
      }

      return { success: true, count: syncedCount };

    } catch (e) {
      console.error('❌ Template sync error:', e);
      return { success: false, error: (e as Error).message || 'Meta template synchronization failed' };
    }
  }
}
