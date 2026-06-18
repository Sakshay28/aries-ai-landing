import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { processMessageWithAI, getProviderStatus } from '@/lib/ai/engine';
import { getTenantById } from '@/lib/tenant/manager';
import { retrieveRelevantDocs } from '@/lib/ai/rag';

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

    // 2. Fetch semantically relevant RAG documents from DB for sandbox query grounding
    let ragDocs: Array<{ filename: string; content_text: string }> = [];
    try {
      ragDocs = await retrieveRelevantDocs(tenantId, message, 3);
    } catch (e) {
      console.error('Playground RAG retrieval error:', e);
    }

    // Fallback to latest 5 docs if RAG similarity search returns empty
    if (!ragDocs || ragDocs.length === 0) {
      const { data: fallback } = await supabaseAdmin
        .from('knowledge_docs')
        .select('filename, content_text')
        .eq('tenant_id', tenantId)
        .neq('content_text', '')
        .limit(5);
      ragDocs = (fallback || []) as Array<{ filename: string; content_text: string }>;
    }

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
      // AI Behavior Controls — mirror the live webhook so the simulator matches.
      languageMode: (draftConfig.bot_language_mode || tenant.bot_language_mode || 'auto') as 'auto' | 'english' | 'hindi',
      responseLength: (draftConfig.response_length || tenant.response_length || 'short') as 'short' | 'medium' | 'detailed',
      prohibitedTopics: draftConfig.prohibited_topics || tenant.prohibited_topics || [],
      alwaysMentionRules: draftConfig.always_mention_rules || tenant.always_mention_rules || [],
      competitors: draftConfig.competitors || tenant.competitors || [],
      competitorDeflectionReply: draftConfig.competitor_deflection_reply || tenant.competitor_deflection_reply || '',
    };

    // 3b. Check scripted replies — exact keyword intercepts that bypass AI.
    // Must mirror the webhook behaviour exactly (simulator parity).
    const { data: scriptedRepliesRows } = await supabaseAdmin
      .from('scripted_replies')
      .select('keywords, reply, media_url')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (scriptedRepliesRows && scriptedRepliesRows.length > 0) {
      const lowerMsgForScript = message.toLowerCase();
      type ScriptedRow = { keywords: string[]; reply: string; media_url?: string | null };
      // Longest-keyword-match wins — more specific keywords beat broad single words
      let matchedScript: ScriptedRow | undefined;
      let bestMatchLen = 0;
      for (const r of scriptedRepliesRows as ScriptedRow[]) {
        if (!Array.isArray(r.keywords)) continue;
        for (const kw of r.keywords) {
          if (kw && lowerMsgForScript.includes(kw.toLowerCase()) && kw.length > bestMatchLen) {
            bestMatchLen = kw.length;
            matchedScript = r;
          }
        }
      }
      if (matchedScript) {
        const mUrl = matchedScript.media_url || null;
        const mType = mUrl
          ? /\.(mp4|mov|webm|m4v|avi)$/i.test(mUrl.split('?')[0]) ? 'video'
          : /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i.test(mUrl.split('?')[0]) ? 'document'
          : 'image'
          : null;
        return NextResponse.json({
          success: true,
          data: {
            reply: matchedScript.reply,
            mediaUrl: mUrl,
            mediaType: mType,
            intent: 'scripted',
            sentiment: 'neutral',
            nextStep: null,
          },
          activeAgent: null,
          scriptedReply: true,
          providerStatus: { available: true, consecutiveFailures: 0, lastError: null },
        });
      }
    }

    // 3c. Apply AI Flows agent routing EXACTLY as the live webhook does.
    // Without this the simulator silently diverges from real WhatsApp: an active
    // agent_configs row whose keywords match (or a keyword-less catch-all agent)
    // overrides bot_name / personality / system_prompt in production, but the
    // playground would keep showing the AI Assistant config. Mirroring it here
    // means "what you test is what customers get" — and a hijacking agent is
    // visible in the simulator instead of only surfacing in real chats.
    const { data: agentRows } = await supabaseAdmin
      .from('agent_configs')
      .select('agent_name, routing_keywords, bot_name, bot_personality, system_prompt')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    const lowerMsg = message.toLowerCase();
    type AgentRow = { agent_name: string; routing_keywords: string[] | null; bot_name?: string; bot_personality?: string; system_prompt?: string };
    const activeAgents = (agentRows as AgentRow[] | null) ?? [];
    const matchedAgent =
      activeAgents.find(a =>
        (a.routing_keywords?.length ?? 0) > 0 &&
        a.routing_keywords!.some(kw => lowerMsg.includes(kw.toLowerCase()))
      ) ??
      activeAgents.find(a => !a.routing_keywords || a.routing_keywords.length === 0) ??
      null;

    if (matchedAgent) {
      tenantConfig.botName = matchedAgent.bot_name || tenantConfig.botName;
      tenantConfig.botPersonality = matchedAgent.bot_personality || tenantConfig.botPersonality;
      tenantConfig.systemPrompt = matchedAgent.system_prompt || tenantConfig.systemPrompt;
    }

    // 4. Debug: log what config is being injected so stale context is immediately visible
    console.log(`🔍 Playground config [tenant=${tenantId}]:`, {
      botName: tenantConfig.botName,
      businessName: tenantConfig.businessName,
      businessType: tenantConfig.businessType,
      personality: tenantConfig.botPersonality,
      faqCount: tenantConfig.customFaqs?.length ?? 0,
      kbDocCount: tenantConfig.knowledgeDocs?.length ?? 0,
      kbDocNames: tenantConfig.knowledgeDocs?.map((d: { filename: string }) => d.filename) ?? [],
      hasSystemPrompt: !!(tenantConfig.systemPrompt?.length),
      isFirstMessage: tenantConfig.isFirstMessage,
    });

    // 5. Run AI engine in sandbox
    const aiResponse = await processMessageWithAI(
      message,
      history,
      {}, // empty context for playground simulation to keep it deterministic
      tenantConfig,
      tenantId
    );

    const providerStatus = await getProviderStatus();
    return NextResponse.json({
      success: true,
      data: {
        reply: aiResponse.reply,
        intent: aiResponse.intent,
        sentiment: aiResponse.sentiment,
        nextStep: aiResponse.nextStep,
      },
      // When an AI Flows agent overrode the base config, tell the UI so the
      // user understands why the reply may differ from their AI Assistant setup.
      activeAgent: matchedAgent ? matchedAgent.agent_name : null,
      providerStatus: {
        available: providerStatus.available,
        consecutiveFailures: providerStatus.consecutiveFailures,
        lastError: providerStatus.lastError,
      },
    });

  } catch (err) {
    console.error('❌ Playground Sandbox Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
