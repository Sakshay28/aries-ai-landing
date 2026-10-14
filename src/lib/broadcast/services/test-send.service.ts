import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTemplateMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';
import { VariableEngineService } from './variable-engine.service';
import { MetaPayloadBuilderService } from './meta-payload-builder.service';
import { TemplateParserService } from './template-parser.service';
import { VariableConfig } from '@/app/dashboard/broadcast/types';

export class TestSendService {
  /**
   * Executes a high-fidelity outbound test send using real Meta credentials,
   * keeping the delivery enqueued under is_test=true to preserve campaign analytics.
   */
  static async sendTest(
    tenantId: string,
    templateName: string,
    variables: Record<string, VariableConfig>,
    detectedVarIndices: string[],
    testRecipientPhone: string,
    languageCode = 'en',
    customHeaderMediaUrl?: string,
    customRecipientName?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!templateName || !testRecipientPhone) {
        return { success: false, error: 'Template name and test phone number are required' };
      }

      // 1. Fetch Tenant credentials
      const { data: tenant, error: tenantErr } = await supabaseAdmin
        .from('tenants')
        .select('wa_access_token, wa_phone_number_id')
        .eq('id', tenantId)
        .single();

      if (tenantErr || !tenant) {
        return { success: false, error: 'Tenant business account details not found' };
      }

      if (!tenant.wa_access_token || !tenant.wa_phone_number_id) {
        return { success: false, error: 'Meta WhatsApp integration not active on this workspace' };
      }

      const decryptedToken = decryptToken(tenant.wa_access_token) as string;

      // 2. Resolve test recipient identity dynamically from CRM leads
      let recipientLeadName: string | null = null;
      let recipientEmail = 'test@example.com';
      let recipientNotes = 'Test recipient';
      let leadId = '00000000-0000-0000-0000-000000000000';

      const digitsOnly = testRecipientPhone.replace(/\D/g, '');
      const last10 = digitsOnly.slice(-10);

      if (last10.length === 10) {
        const { data: matchedLead } = await supabaseAdmin
          .from('leads')
          .select('id, name, email, notes')
          .eq('tenant_id', tenantId)
          .ilike('phone', `%${last10}%`)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (matchedLead) {
          leadId = matchedLead.id;
          recipientLeadName = matchedLead.name;
          if (matchedLead.email) recipientEmail = matchedLead.email;
          if (matchedLead.notes) recipientNotes = matchedLead.notes;
        }
      }

      // Priority:
      // 1. Explicit customRecipientName if provided
      // 2. Matched CRM lead name from database
      // 3. Fallback to null (greetingName resolves to single source of truth neutral greeting)
      const resolvedName = customRecipientName?.trim() || recipientLeadName || null;

      const testLead = {
        id: leadId,
        name: resolvedName,
        phone: testRecipientPhone,
        email: recipientEmail,
        notes: recipientNotes,
      };

      // 3. Resolve template headers & buttons from cache if available
      let headerConfig: any;
      let buttonsConfig: any;

      const { data: tmpl } = await supabaseAdmin
        .from('broadcast_templates_cache')
        .select('template_json')
        .eq('tenant_id', tenantId)
        .eq('name', templateName)
        .maybeSingle();

      if (tmpl?.template_json) {
        const parsed = TemplateParserService.parse({
          ...tmpl.template_json,
          name: templateName,
        });
        if (parsed.headerType !== 'NONE') {
          headerConfig = {
            type: parsed.headerType,
            mediaUrl: customHeaderMediaUrl || parsed.headerMediaUrl,
            text: parsed.headerText,
          };
        }
        if (parsed.buttons && parsed.buttons.length > 0) {
          buttonsConfig = parsed.buttons;
        }
      }

      // 4. Resolve components via MetaPayloadBuilderService
      const metaComponents = MetaPayloadBuilderService.buildPayload(
        variables,
        detectedVarIndices,
        testLead,
        headerConfig,
        buttonsConfig
      );

      // 4. Dispatch actual Meta Outbound message
      const result = await sendTemplateMessage(
        decryptedToken,
        tenant.wa_phone_number_id,
        testRecipientPhone,
        templateName,
        metaComponents,
        languageCode
      );

      if (!result.messageId) {
        return { success: false, error: 'Meta Cloud API did not return a valid messageId' };
      }

      // 5. Log test send — skip broadcast_deliveries (FK requires a real campaign_id).
      //    Store in broadcast_events instead which has a nullable campaign_id.
      try {
        await supabaseAdmin.from('broadcast_events').insert({
          tenant_id: tenantId,
          campaign_id: null,
          event_type: 'test_send',
          payload: {
            is_test: true,
            phone: testRecipientPhone,
            template_name: templateName,
            message_id: result.messageId,
            resolved_variables: VariableEngineService.resolveAll(variables, testLead),
          },
        });
      } catch { /* non-critical logging */ }

      return { success: true, messageId: result.messageId };

    } catch (e) {
      console.error('❌ Test send failed:', e);
      return { success: false, error: (e as Error).message || 'Meta test send failed' };
    }
  }
}
