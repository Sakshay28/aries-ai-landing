import { describe, it, expect } from 'vitest';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runFlowsForMessage } from '@/lib/flows/engine';
import { supabaseAdmin } from '@/lib/supabase/admin';

describe('I need to think flow override intercept', () => {
  it('should intercept "cost_think" and yield to AI, clearing pending flow state', async () => {
    const tenantId = 'e29f53cf-4855-4571-93f4-9abd2cc116bd'; // Globesome India
    const testPhone = '918888888888';
    
    // Clean up
    const { data: existingConvs } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('sender_id', testPhone);

    if (existingConvs && existingConvs.length > 0) {
      const convIds = existingConvs.map(c => c.id);
      await supabaseAdmin.from('messages').delete().in('conversation_id', convIds);
      await supabaseAdmin.from('conversations').delete().in('id', convIds);
    }

    // Create conversation with pending_flow_node: gr5 (Cost OK?)
    const { data: conversation, error: convErr } = await supabaseAdmin
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        sender_id: testPhone,
        channel: 'whatsapp',
        is_active: true,
        message_count: 1,
        context: {
          pending_flow_node: 'gr5',
          _pending_pause_type: 'buttons',
        }
      })
      .select('*')
      .single();

    expect(convErr).toBeNull();

    // Trigger message with buttonId: cost_think ("I need to think")
    const flowHandled = await runFlowsForMessage(
      tenantId,
      'I need to think',
      testPhone,
      conversation.id,
      null,
      false,
      'interactive',
      'cost_think'
    );

    // Should return false (meaning yielded, not handled by flow, falls back to AI)
    expect(flowHandled).toBe(false);

    // Fetch conversation context from DB
    const { data: updatedConv } = await supabaseAdmin
      .from('conversations')
      .select('context')
      .eq('id', conversation.id)
      .single();

    const ctx = (updatedConv?.context as Record<string, any>) || {};
    
    // pending_flow_node should be cleared/null
    expect(ctx.pending_flow_node || null).toBeNull();
    expect(ctx._pending_pause_type || null).toBeNull();
  });

  it('should also intercept text reply "need to think"', async () => {
    const tenantId = 'e29f53cf-4855-4571-93f4-9abd2cc116bd';
    const testPhone = '918888888888';

    const { data: existingConvs } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('sender_id', testPhone);

    const convId = existingConvs?.[0]?.id;
    if (convId) {
      // Update back to pending state gr5
      await supabaseAdmin
        .from('conversations')
        .update({
          context: {
            pending_flow_node: 'gr5',
            _pending_pause_type: 'buttons',
          }
        })
        .eq('id', convId);

      const flowHandled = await runFlowsForMessage(
        tenantId,
        'I need to think',
        testPhone,
        convId,
        null,
        false,
        'text'
      );

      expect(flowHandled).toBe(false);

      const { data: updatedConv } = await supabaseAdmin
        .from('conversations')
        .select('context')
        .eq('id', convId)
        .single();

      const ctx = (updatedConv?.context as Record<string, any>) || {};
      expect(ctx.pending_flow_node || null).toBeNull();
    }
  });
});
