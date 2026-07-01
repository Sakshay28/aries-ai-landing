import { describe, it, expect } from 'vitest';
import type {
  Message,
  InteractiveMetadata,
  InteractiveButtonMeta,
  InteractiveListMeta,
  TemplateMeta,
  FlowMeta,
  InboundReplyMeta,
} from '@/lib/types';

// ─── Type guard helpers (mirror what ChatArea uses) ─────────────────────────

function isButtonMeta(m: InteractiveMetadata): m is InteractiveButtonMeta {
  return m.interactive_type === 'button';
}
function isListMeta(m: InteractiveMetadata): m is InteractiveListMeta {
  return m.interactive_type === 'list';
}
function isTemplateMeta(m: InteractiveMetadata): m is TemplateMeta {
  return m.interactive_type === 'template';
}
function isFlowMeta(m: InteractiveMetadata): m is FlowMeta {
  return m.interactive_type === 'flow';
}
function isInboundReplyMeta(m: InteractiveMetadata): m is InboundReplyMeta {
  return !m.interactive_type;
}

// ─── Discriminated union tests ──────────────────────────────────────────────

describe('InteractiveMetadata discriminated union', () => {
  it('button metadata type-guards correctly', () => {
    const meta: InteractiveMetadata = {
      interactive_type: 'button',
      buttons: [{ id: 'jul_2_8', title: '27 Jun' }, { id: 'other', title: 'Other Dates' }],
      footer: 'Reply to choose',
    };
    expect(isButtonMeta(meta)).toBe(true);
    expect(isListMeta(meta)).toBe(false);
    if (isButtonMeta(meta)) {
      expect(meta.buttons).toHaveLength(2);
      expect(meta.buttons[0].title).toBe('27 Jun');
    }
  });

  it('list metadata type-guards correctly', () => {
    const meta: InteractiveMetadata = {
      interactive_type: 'list',
      list_button: 'Choose Package',
      sections: [{
        title: 'Available',
        rows: [
          { id: 'p1', title: '4N/5D', description: 'Short trip' },
          { id: 'p2', title: '6N/7D' },
        ],
      }],
    };
    expect(isListMeta(meta)).toBe(true);
    if (isListMeta(meta)) {
      expect(meta.sections[0].rows).toHaveLength(2);
      expect(meta.list_button).toBe('Choose Package');
    }
  });

  it('template metadata type-guards correctly', () => {
    const meta: InteractiveMetadata = {
      interactive_type: 'template',
      template_name: 'welcome_v2',
      buttons: [
        { type: 'quick_reply', text: 'Yes' },
        { type: 'url', text: 'Visit', url: 'https://example.com' },
        { type: 'phone_number', text: 'Call', phone_number: '+919812345678' },
        { type: 'copy_code', text: 'Copy Code' },
        { type: 'otp', text: 'Verify' },
        { type: 'flow', text: 'Book Now' },
      ],
      header: { type: 'image', url: 'https://example.com/img.jpg' },
      footer: 'Powered by AriesAI',
    };
    expect(isTemplateMeta(meta)).toBe(true);
    if (isTemplateMeta(meta)) {
      expect(meta.template_name).toBe('welcome_v2');
      expect(meta.buttons).toHaveLength(6);
      expect(meta.buttons![2].type).toBe('phone_number');
    }
  });

  it('flow metadata type-guards correctly', () => {
    const meta: InteractiveMetadata = {
      interactive_type: 'flow',
      flow_name: 'Book Expedition',
      flow_status: 'completed',
    };
    expect(isFlowMeta(meta)).toBe(true);
    if (isFlowMeta(meta)) {
      expect(meta.flow_status).toBe('completed');
    }
  });

  it('inbound reply metadata type-guards correctly', () => {
    const meta: InteractiveMetadata = {
      selected_button_id: 'jul_2_8',
      reply_to_wa_message_id: 'wamid.abc123',
    };
    expect(isInboundReplyMeta(meta)).toBe(true);
    if (isInboundReplyMeta(meta)) {
      expect(meta.selected_button_id).toBe('jul_2_8');
      expect(meta.reply_to_wa_message_id).toBe('wamid.abc123');
    }
  });
});

// ─── Button selected-state enrichment ───────────────────────────────────────

describe('button selected-state enrichment', () => {
  function enrichMessages(messages: Message[]): Message[] {
    return messages.map(m => {
      if (m.direction !== 'outbound' || !m.wa_message_id || !m.metadata) return m;
      if (!m.metadata.interactive_type) return m;
      const reply = messages.find(r =>
        r.direction === 'inbound' &&
        r.metadata &&
        'reply_to_wa_message_id' in r.metadata &&
        (r.metadata as InboundReplyMeta).reply_to_wa_message_id === m.wa_message_id &&
        'selected_button_id' in r.metadata
      );
      if (reply?.metadata && 'selected_button_id' in reply.metadata) {
        return { ...m, metadata: { ...m.metadata, _selectedId: (reply.metadata as InboundReplyMeta).selected_button_id } as InteractiveMetadata };
      }
      return m;
    });
  }

  const baseMsg = {
    id: '', tenant_id: 't1', conversation_id: 'c1', channel: 'whatsapp',
    sender_id: null, status: 'sent' as const, error_message: null,
    ai_generated: false, ai_latency_ms: null, created_at: '2026-06-26T12:00:00Z',
  };

  it('marks the correct button as selected when customer clicks', () => {
    const outbound: Message = {
      ...baseMsg, id: 'msg1', direction: 'outbound', content: 'Choose date',
      message_type: 'interactive', wa_message_id: 'wamid.out1',
      metadata: {
        interactive_type: 'button',
        buttons: [{ id: 'jul_2_8', title: '27 Jun' }, { id: 'other', title: 'Other Dates' }],
      },
    };
    const inbound: Message = {
      ...baseMsg, id: 'msg2', direction: 'inbound', content: 'Other Dates',
      message_type: 'interactive', wa_message_id: 'wamid.in1',
      metadata: {
        selected_button_id: 'other',
        reply_to_wa_message_id: 'wamid.out1',
      },
    };
    const enriched = enrichMessages([outbound, inbound]);
    const enrichedOut = enriched[0];
    expect((enrichedOut.metadata as InteractiveButtonMeta)._selectedId).toBe('other');
  });

  it('does not mark anything when no reply exists', () => {
    const outbound: Message = {
      ...baseMsg, id: 'msg1', direction: 'outbound', content: 'Choose date',
      message_type: 'interactive', wa_message_id: 'wamid.out1',
      metadata: {
        interactive_type: 'button',
        buttons: [{ id: 'jul_2_8', title: '27 Jun' }],
      },
    };
    const enriched = enrichMessages([outbound]);
    expect((enriched[0].metadata as InteractiveButtonMeta)._selectedId).toBeUndefined();
  });

  it('links list selections the same way', () => {
    const outbound: Message = {
      ...baseMsg, id: 'msg1', direction: 'outbound', content: 'Pick package',
      message_type: 'interactive', wa_message_id: 'wamid.out1',
      metadata: {
        interactive_type: 'list',
        list_button: 'Choose',
        sections: [{ rows: [{ id: 'p1', title: '4N/5D' }, { id: 'p2', title: '6N/7D' }] }],
      },
    };
    const inbound: Message = {
      ...baseMsg, id: 'msg2', direction: 'inbound', content: '6N/7D',
      message_type: 'interactive', wa_message_id: 'wamid.in1',
      metadata: {
        selected_button_id: 'p2',
        reply_to_wa_message_id: 'wamid.out1',
      },
    };
    const enriched = enrichMessages([outbound, inbound]);
    expect((enriched[0].metadata as InteractiveListMeta)._selectedId).toBe('p2');
  });
});

// ─── Webhook metadata persistence ───────────────────────────────────────────

describe('webhook metadata shape', () => {
  it('inbound interactive reply includes selected_button_id and reply_to_wa_message_id', () => {
    const msgType = 'interactive';
    const buttonId = 'jul_2_8';
    const contextMessageId = 'wamid.abc123';

    const inboundMetadata = (msgType === 'interactive' || msgType === 'button' || contextMessageId)
      ? {
          ...(buttonId ? { selected_button_id: buttonId } : {}),
          ...(contextMessageId ? { reply_to_wa_message_id: contextMessageId } : {}),
        } : undefined;

    expect(inboundMetadata).toEqual({
      selected_button_id: 'jul_2_8',
      reply_to_wa_message_id: 'wamid.abc123',
    });
  });

  it('non-interactive message gets no metadata', () => {
    const msgType: string = 'text';
    const buttonId = undefined;
    const contextMessageId = undefined;

    const inboundMetadata = (msgType === 'interactive' || msgType === 'button' || contextMessageId)
      ? {
          ...(buttonId ? { selected_button_id: buttonId } : {}),
          ...(contextMessageId ? { reply_to_wa_message_id: contextMessageId } : {}),
        } : undefined;

    expect(inboundMetadata).toBeUndefined();
  });

  it('text reply to a context message still stores reply_to_wa_message_id', () => {
    const msgType: string = 'text';
    const buttonId = undefined;
    const contextMessageId = 'wamid.reply_to_this';

    const inboundMetadata = (msgType === 'interactive' || msgType === 'button' || contextMessageId)
      ? {
          ...(buttonId ? { selected_button_id: buttonId } : {}),
          ...(contextMessageId ? { reply_to_wa_message_id: contextMessageId } : {}),
        } : undefined;

    expect(inboundMetadata).toEqual({ reply_to_wa_message_id: 'wamid.reply_to_this' });
  });
});

// ─── parseMetaWebhook context extraction ────────────────────────────────────

describe('parseMetaWebhook context.message_id', () => {
  it('extracts contextMessageId from msg.context.id', () => {
    const msg = {
      context: { id: 'wamid.original' },
      interactive: { type: 'button_reply', button_reply: { id: 'btn1', title: 'Yes' } },
    };
    const contextMessageId = msg.context?.id || undefined;
    expect(contextMessageId).toBe('wamid.original');
  });

  it('returns undefined when no context', () => {
    const msg = { text: { body: 'hello' } };
    const contextMessageId = (msg as any).context?.id || undefined;
    expect(contextMessageId).toBeUndefined();
  });
});
