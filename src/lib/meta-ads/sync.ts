// ═══════════════════════════════════════════════════════════
// 🔄 Meta Asset Sync
// ═══════════════════════════════════════════════════════════
// Discovers and persists a tenant's ad accounts, pages, Instagram
// accounts, and WhatsApp Business numbers from the Graph API.
// Called after OAuth connect and on manual re-sync.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  fetchAdAccounts,
  fetchPages,
  fetchWhatsAppBusinessAccounts,
} from './oauth';
import { encryptToken } from '@/lib/utils/crypto';

export interface SyncResult {
  ad_accounts: number;
  pages: number;
  instagram: number;
  whatsapp_numbers: number;
}

export async function syncMetaAssets(
  tenantId: string,
  connectionId: string,
  plainToken: string,
  businessId: string | null
): Promise<SyncResult> {
  const result: SyncResult = { ad_accounts: 0, pages: 0, instagram: 0, whatsapp_numbers: 0 };

  // ── Ad accounts ──
  try {
    const adAccounts = await fetchAdAccounts(plainToken);
    for (const acc of adAccounts) {
      await supabaseAdmin.from('meta_ad_accounts').upsert(
        {
          tenant_id: tenantId,
          connection_id: connectionId,
          account_id: acc.account_id || acc.id?.replace('act_', '') || acc.id,
          account_name: acc.name,
          currency: acc.currency || 'INR',
          timezone: acc.timezone_name || 'Asia/Kolkata',
          account_status: acc.account_status ?? 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,account_id' }
      );
      result.ad_accounts++;
    }
    // Auto-select the first ad account if none selected
    if (result.ad_accounts > 0) {
      const { data: selected } = await supabaseAdmin
        .from('meta_ad_accounts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_selected', true)
        .maybeSingle();
      if (!selected) {
        const { data: first } = await supabaseAdmin
          .from('meta_ad_accounts')
          .select('id')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (first) {
          await supabaseAdmin.from('meta_ad_accounts').update({ is_selected: true }).eq('id', first.id);
        }
      }
    }
  } catch (e) {
    console.warn('Ad account sync failed:', e);
  }

  // ── Pages + Instagram ──
  try {
    const pages = await fetchPages(plainToken);
    for (const page of pages) {
      const igId = page.instagram_business_account?.id || null;
      if (igId) result.instagram++;
      await supabaseAdmin.from('meta_pages').upsert(
        {
          tenant_id: tenantId,
          connection_id: connectionId,
          page_id: page.id,
          page_name: page.name,
          page_token: page.access_token ? encryptToken(page.access_token) : null,
          instagram_id: igId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,page_id' }
      );
      result.pages++;
    }
    if (result.pages > 0) {
      await autoSelectFirst('meta_pages', tenantId);
    }
  } catch (e) {
    console.warn('Page sync failed:', e);
  }

  // ── WhatsApp Business numbers ──
  if (businessId) {
    try {
      const wabas = await fetchWhatsAppBusinessAccounts(plainToken, businessId);
      for (const waba of wabas) {
        for (const phone of waba.phone_numbers) {
          await supabaseAdmin.from('meta_whatsapp_numbers').upsert(
            {
              tenant_id: tenantId,
              connection_id: connectionId,
              waba_id: waba.id,
              phone_number_id: phone.id,
              display_phone: phone.display_phone_number,
              verified_name: phone.verified_name,
              quality_rating: phone.quality_rating,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_id,phone_number_id' }
          );
          result.whatsapp_numbers++;
        }
      }
      if (result.whatsapp_numbers > 0) {
        await autoSelectFirst('meta_whatsapp_numbers', tenantId);
      }
    } catch (e) {
      console.warn('WhatsApp number sync failed:', e);
    }
  }

  return result;
}

async function autoSelectFirst(table: string, tenantId: string): Promise<void> {
  const { data: selected } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_selected', true)
    .maybeSingle();
  if (selected) return;

  const { data: first } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (first) {
    await supabaseAdmin.from(table).update({ is_selected: true }).eq('id', first.id);
  }
}
