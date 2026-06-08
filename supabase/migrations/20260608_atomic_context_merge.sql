-- Atomic conversation context merge after AI processing
--
-- Replaces the full-overwrite pattern with a row-locked merge.
-- PostgreSQL serializes concurrent UPDATEs on the same row via implicit
-- FOR UPDATE locking, so each call reads the current committed state,
-- applies its delta, and writes atomically.  No JS-side read-modify-write
-- race is possible.
--
-- p_context_delta        : flat top-level fields extracted by this AI call
-- p_booking_state_delta  : booking fields extracted by this AI call
-- p_booking_state_reset  : if TRUE, replace booking_state entirely (new booking
--                          started after a previous one completed)
-- remaining params        : non-context conversation column updates

CREATE OR REPLACE FUNCTION update_conversation_after_ai(
  p_conv_id              uuid,
  p_context_delta        jsonb,
  p_booking_state_delta  jsonb,
  p_booking_state_reset  boolean,
  p_current_step         text,
  p_last_message_at      timestamptz,
  p_escalated            boolean,
  p_escalated_at         timestamptz,
  p_escalation_reason    text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE conversations SET
    context = (
      -- Merge top-level fields: existing fields not in delta are untouched
      (context || p_context_delta)
      ||
      -- Merge booking_state: atomic read-and-merge within a single statement
      jsonb_build_object(
        'booking_state',
        CASE
          WHEN p_booking_state_reset
            -- New booking restarted: replace entirely with fresh delta
            THEN p_booking_state_delta
          WHEN p_booking_state_delta = '{}'::jsonb
            -- Nothing to merge: preserve existing booking_state
            THEN COALESCE(context -> 'booking_state', '{}'::jsonb)
          ELSE
            -- Merge: existing booking fields + new delta fields (delta wins)
            COALESCE(context -> 'booking_state', '{}'::jsonb) || p_booking_state_delta
        END
      )
    ),
    current_step         = p_current_step,
    last_message_at      = p_last_message_at,
    escalated            = p_escalated,
    escalated_at         = p_escalated_at,
    escalation_reason    = p_escalation_reason
  WHERE id = p_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_conversation_after_ai(
  uuid, jsonb, jsonb, boolean, text, timestamptz, boolean, timestamptz, text
) TO service_role;
