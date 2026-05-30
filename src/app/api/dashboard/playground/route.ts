import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { processMessageWithAI } from '@/lib/ai/engine';
import { getTenantById } from '@/lib/tenant/manager';

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { message, history = [], draftConfig = {} } = await req.json();

    if (!message) {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    // 1. Fetch current tenant details for business profile fallback
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    // 2. Fetch actual RAG documents from DB to support real-time training queries
    const { data: ragDocs } = await supabaseAdmin
      .from('knowledge_docs')
      .select('filename, content_text')
      .eq('tenant_id', tenantId)
      .neq('content_text', '')
      .limit(5);

    // 3. Assemble TenantAIConfig from draftConfig (with fallbacks to stored tenant config)
    const tenantConfig = {
      businessName: tenant.business_name,
      businessType: tenant.business_type,
      botName: draftConfig.bot_name || tenant.bot_name || 'Assistant',
      botPersonality: draftConfig.bot_personality || tenant.bot_personality || 'Premium Fine Dining',
      phone: tenant.business_phone || '',
      address: tenant.business_address || '',
      website: tenant.business_website || '',
      welcomeMessage: draftConfig.welcome_message || '',
      welcomeOffer: draftConfig.welcome_offer || '',
      usps: draftConfig.usps || [],
      staffName: tenant.staff_name || 'our team',
      isFirstMessage: history.length === 0,
      customFaqs: draftConfig.custom_faqs || [],
      knowledgeDocs: (ragDocs || []) as Array<{ filename: string; content_text: string }>,
      systemPrompt: draftConfig.system_prompt || '',
    };

    // 4. Run AI engine in sandbox
    const aiResponse = await processMessageWithAI(
      message,
      history,
      {}, // empty context for playground simulation to keep it deterministic
      tenantConfig,
      tenantId
    );

    return NextResponse.json({
      success: true,
      data: {
        reply: aiResponse.reply,
        intent: aiResponse.intent,
        sentiment: aiResponse.sentiment,
        nextStep: aiResponse.nextStep,
      },
    });

  } catch (err) {
    console.error('❌ Playground Sandbox Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
