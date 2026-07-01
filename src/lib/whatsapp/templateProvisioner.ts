// ═══════════════════════════════════════════════════════════
// 🛠️ Auto-Template Provisioner — self-healing template system
// ═══════════════════════════════════════════════════════════
// Automatically registers and binds staff keepalive & alert templates
// in Meta WABA and local draft_templates to guarantee zero missed alerts.
// Uses a unique constraint lock on draft_templates to guarantee 
// race-condition safety under concurrent execution.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';
import { createMetaTemplate, listMetaTemplates, buildMetaComponents } from '@/lib/meta/templates';
import type { SystemEventType } from './templateManager';
import { notifyAdmin } from '@/lib/alerts/admin';
import crypto from 'crypto';

export interface ProvisionConfig {
  name: string;
  eventType: SystemEventType;
  category: 'UTILITY';
  language: string;
  headerType: 'NONE' | 'TEXT';
  headerText?: string;
  body: string;
  variableMap: Record<string, number>;
  buttons: any[];
}

const REQUIRED_TEMPLATES: ProvisionConfig[] = [
  {
    name: 'staff_keepalive',
    eventType: 'staff_keepalive',
    category: 'UTILITY',
    language: 'en',
    headerType: 'NONE',
    body: '📋 Aries AI alert portal check-in for *{{1}}*.\n\nTap below to confirm you are receiving booking and handoff alerts on this number.',
    variableMap: { business_name: 1 },
    buttons: [{ type: 'QUICK_REPLY', text: 'Got It' }],
  },
  {
    name: 'staff_alert',
    eventType: 'human_assistance',
    category: 'UTILITY',
    language: 'en',
    headerType: 'TEXT',
    headerText: 'Staff Alert',
    body: 'New alert for *{{1}}*.\n\n👤 Customer: {{2}}\n📌 Reason: {{3}}\n💬 Details:\n{{4}}\n\nPlease assist the customer.',
    variableMap: { business_name: 1, customer_name: 2, reason: 3, message: 4 },
    buttons: [],
  },
];

/**
 * Ensures all required alert templates are provisioned in Meta and local DB.
 * Safe to call concurrently from multiple workers — placeholder inserts act
 * as distributed lock keys.
 */
export async function ensureRequiredTemplates(tenantId: string): Promise<void> {
  try {
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, wa_access_token, wa_business_account_id, business_name')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant || !tenant.wa_access_token || !tenant.wa_business_account_id) {
      return;
    }

    const token = decryptToken(tenant.wa_access_token);
    if (!token) return;

    for (const config of REQUIRED_TEMPLATES) {
      // 1. Check if we already have an approved, bound template locally
      const { data: existingBound } = await supabaseAdmin
        .from('draft_templates')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .eq('event_type', config.eventType)
        .eq('status', 'APPROVED')
        .maybeSingle();

      if (existingBound) continue;

      // 2. Atomically insert a placeholder row to act as a lock key.
      const placeholderId = crypto.randomUUID();
      const { error: insertErr } = await supabaseAdmin
        .from('draft_templates')
        .insert({
          id: placeholderId,
          tenant_id: tenantId,
          template_name: config.name,
          normalized_name: config.name,
          category: config.category,
          subtype: 'Default',
          language: config.language,
          header_type: config.headerType,
          header_text: config.headerText ?? null,
          body: config.body,
          buttons_json: config.buttons,
          variables_json: config.variableMap,
          status: 'PENDING',
          event_type: config.eventType,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertErr) {
        // Code 23505 is PostgreSQL unique_violation (concurrency lock acquired by another thread)
        if (insertErr.code === '23505' || insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique')) {
          console.log(`[template-provisioner] Concurrency lock active for "${config.name}" on tenant ${tenantId}. Skipping duplicate run.`);
          
          // Self-healing: if the template exists, status is APPROVED, but not bound to event_type yet, bind it now.
          const { data: existingLocal } = await supabaseAdmin
            .from('draft_templates')
            .select('id, status, event_type')
            .eq('tenant_id', tenantId)
            .eq('normalized_name', config.name)
            .maybeSingle();
            
          if (existingLocal && existingLocal.status === 'APPROVED' && existingLocal.event_type !== config.eventType) {
            await supabaseAdmin
              .from('draft_templates')
              .update({ event_type: config.eventType, updated_at: new Date().toISOString() })
              .eq('id', existingLocal.id);
          }
          continue;
        }
        
        console.error(`[template-provisioner] Placeholder insert failed for "${config.name}":`, insertErr.message);
        continue;
      }

      console.log(`[template-provisioner] Acquired provision lock for "${config.name}" on tenant ${tenantId}`);

      // 3. Check if the template already exists in Meta WABA
      let metaRecord: any = null;
      try {
        const { templates } = await listMetaTemplates(token, tenant.wa_business_account_id);
        metaRecord = templates.find((t: any) => t.name === config.name);
      } catch (err) {
        console.error(`[template-provisioner] Meta list failed for ${tenant.business_name}:`, (err as Error).message);
      }

      if (metaRecord) {
        const status = metaRecord.status?.toUpperCase() || 'PENDING';
        await supabaseAdmin
          .from('draft_templates')
          .update({
            status,
            meta_template_id: metaRecord.id,
            approved_at: status === 'APPROVED' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', placeholderId);
        console.log(`[template-provisioner] Found template "${config.name}" on Meta (status=${status}). Synced local placeholder.`);
        continue;
      }

      // 4. Create the template on Meta
      try {
        const metaPayload = {
          name: config.name,
          category: config.category,
          language: config.language,
          components: buildMetaComponents({
            headerType: config.headerType,
            headerText: config.headerText,
            body: config.body,
            variableMap: config.variableMap,
            category: config.category,
            buttons: config.buttons,
          }),
        };

        const result = await createMetaTemplate(token, tenant.wa_business_account_id, metaPayload);
        
        await supabaseAdmin
          .from('draft_templates')
          .update({
            status: result.status,
            meta_template_id: result.id,
            approved_at: result.status === 'APPROVED' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', placeholderId);
        
        console.log(`[template-provisioner] Successfully registered template "${config.name}" on Meta (status=${result.status})`);
      } catch (createErr) {
        console.error(`[template-provisioner] Failed to register template "${config.name}" on Meta:`, (createErr as Error).message);
        
        // Remove the local placeholder so subsequent retries can run
        await supabaseAdmin
          .from('draft_templates')
          .delete()
          .eq('id', placeholderId);

        // Alert administrators immediately
        notifyAdmin({
          dedupeKey: `template_provisioning_failed:${tenantId}:${config.name}`,
          subject: `WABA Template Provisioning Failed — ${config.name}`,
          summary: `Failed to register template "${config.name}" on Meta for tenant "${tenant.business_name}": ${(createErr as Error).message}. Will retry on next keepalive cron execution.`,
          context: { tenantId, templateName: config.name, error: (createErr as Error).message },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[template-provisioner] unexpected error:', (err as Error).message);
  }
}
