import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTemplateMessage } from '@/lib/meta/service';
import { decryptToken } from '@/lib/utils/crypto';
import { VariableEngineService } from './variable-engine.service';
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
    languageCode = 'en'
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

      // 2. Mock a test lead record for जयपुर clock tower Jaipurs Sakshay Jaipur Rajasthan Rajasthani
      const testLead = {
        id: '00000000-0000-0000-0000-000000000000',
        name: 'Sakshay',
        phone: testRecipientPhone,
        email: 'test@aries.ai',
        notes: 'Test lead account configuration'
      };

      // 3. Resolve components via Variable Engine
      const metaComponents = VariableEngineService.buildMetaPayload(
        variables,
        detectedVarIndices,
        testLead
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

      // 5. Store delivery log in database flagged as is_test
      await supabaseAdmin.from('broadcast_deliveries').insert({
        tenant_id: tenantId,
        campaign_id: '00000000-0000-0000-0000-000000000000', // Mock campaign ID for test sends
        phone: testRecipientPhone,
        message_id: result.messageId,
        status: 'sent',
        metadata: {
          is_test: true,
          resolved_variables: VariableEngineService.resolveAll(variables, testLead)
        }
      });

      return { success: true, messageId: result.messageId };

    } catch (e) {
      console.error('❌ Test send failed:', e);
      return { success: false, error: (e as Error).message || 'Meta test send failed' };
    }
  }
}
