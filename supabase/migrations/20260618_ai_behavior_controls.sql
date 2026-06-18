-- AI Behavior Controls — per-tenant customization of the assistant's behavior.
-- All columns are nullable / defaulted so existing tenants keep their current
-- behavior until an owner explicitly changes a setting in the dashboard.

ALTER TABLE tenants
  -- Language mode: 'auto' = mirror the customer's language/script (default,
  -- current behavior), 'english' = always reply in English, 'hindi' = always
  -- reply in Hindi (Devanagari).
  ADD COLUMN IF NOT EXISTS bot_language_mode TEXT DEFAULT 'auto',

  -- Response length: 'short' (1-2 lines, default), 'medium' (3-4 lines),
  -- 'detailed' (thorough, up to ~6-8 lines).
  ADD COLUMN IF NOT EXISTS response_length TEXT DEFAULT 'short',

  -- Topics the bot must NEVER discuss (competitor disputes, politics, etc.).
  ADD COLUMN IF NOT EXISTS prohibited_topics TEXT[] DEFAULT '{}',

  -- "When topic X comes up, always mention Y" rules.
  -- Array of { "topic": string, "mention": string }.
  ADD COLUMN IF NOT EXISTS always_mention_rules JSONB DEFAULT '[]'::jsonb,

  -- Competitor names the bot should gracefully deflect instead of comparing.
  ADD COLUMN IF NOT EXISTS competitors TEXT[] DEFAULT '{}',

  -- Optional custom line used when deflecting a competitor mention.
  ADD COLUMN IF NOT EXISTS competitor_deflection_reply TEXT DEFAULT NULL;

COMMENT ON COLUMN tenants.bot_language_mode IS 'auto = mirror customer language (default), english = always English, hindi = always Hindi';
COMMENT ON COLUMN tenants.response_length IS 'short (1-2 lines), medium (3-4 lines), detailed (up to ~6-8 lines)';
COMMENT ON COLUMN tenants.prohibited_topics IS 'Topics the AI assistant must never discuss';
COMMENT ON COLUMN tenants.always_mention_rules IS 'Array of {topic, mention}: when a topic comes up, the AI always mentions the paired note';
COMMENT ON COLUMN tenants.competitors IS 'Competitor names the AI should deflect rather than compare against';
COMMENT ON COLUMN tenants.competitor_deflection_reply IS 'Optional custom line used when a competitor is mentioned';
