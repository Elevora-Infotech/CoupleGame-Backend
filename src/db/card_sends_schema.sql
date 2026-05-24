-- ═══════════════════════════════════════════════════════════════
-- room_card_sends  (Card Game Engine)
-- Tracks the full lifecycle of every card sent between partners.
--
-- STATE MACHINE:
--   SENT → WAITING (24h) → PENALTY (48h)   [no-action path]
--   SENT → IN_PROGRESS (accepted)
--        → COMPLETED_BY_RECEIVER → COMPLETED (confirmed)
--   SENT/IN_PROGRESS → DEFLECTED
-- ═══════════════════════════════════════════════════════════════

-- Status enum
DO $$ BEGIN
  CREATE TYPE card_send_status AS ENUM (
    'SENT',                   -- Card sent, awaiting receiver action
    'WAITING',                -- 24h passed, no receiver action
    'PENALTY',                -- 48h passed, no action — penalty triggered
    'IN_PROGRESS',            -- Receiver accepted, working on it
    'COMPLETED_BY_RECEIVER',  -- Receiver marked done, waiting sender confirm
    'COMPLETED',              -- Sender confirmed — fully done ✅
    'DEFLECTED'               -- Receiver used deflect card — closed, no penalty ✅
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.room_card_sends (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Context
  room_id         UUID    NOT NULL REFERENCES public.rooms(id)    ON DELETE CASCADE,
  sender_id       UUID    NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  receiver_id     UUID    NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  deck_card_id    UUID    NOT NULL REFERENCES public.user_card_deck(id) ON DELETE CASCADE,
  card_id         UUID    NOT NULL REFERENCES public.cards(id)    ON DELETE CASCADE,

  -- Optional short message (max 200 chars)
  message         TEXT    CHECK (char_length(message) <= 200),

  -- ── State Machine ─────────────────────────────────────────────
  status          card_send_status NOT NULL DEFAULT 'SENT',

  -- ── Deadlines ─────────────────────────────────────────────────
  -- Receiver must act within 24h or card moves to WAITING
  respond_deadline    TIMESTAMP WITH TIME ZONE NOT NULL,
  -- If still no action by 48h from sent_at → PENALTY
  penalty_deadline    TIMESTAMP WITH TIME ZONE NOT NULL,

  -- ── Timestamps per transition ──────────────────────────────────
  sent_at                  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  accepted_at              TIMESTAMP WITH TIME ZONE,  -- SENT → IN_PROGRESS
  deflected_at             TIMESTAMP WITH TIME ZONE,  -- any → DEFLECTED
  completed_by_receiver_at TIMESTAMP WITH TIME ZONE,  -- IN_PROGRESS → COMPLETED_BY_RECEIVER
  confirmed_at             TIMESTAMP WITH TIME ZONE,  -- → COMPLETED
  penalty_triggered_at     TIMESTAMP WITH TIME ZONE,  -- → PENALTY
  reminder_sent_at         TIMESTAMP WITH TIME ZONE,  -- last reminder sent by receiver
  is_seen                  BOOLEAN NOT NULL DEFAULT FALSE,
  seen_at                  TIMESTAMP WITH TIME ZONE,

  -- Prevent same deck card being sent twice
  CONSTRAINT uq_deck_card_sent UNIQUE (deck_card_id)
);

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rcs_room      ON public.room_card_sends(room_id);
CREATE INDEX IF NOT EXISTS idx_rcs_receiver  ON public.room_card_sends(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_rcs_sender    ON public.room_card_sends(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_rcs_deadline  ON public.room_card_sends(penalty_deadline, status);

-- ── Comments ───────────────────────────────────────────────────
COMMENT ON TABLE  public.room_card_sends IS 'Card game engine: tracks every send event and full lifecycle between partners.';
COMMENT ON COLUMN public.room_card_sends.respond_deadline IS 'sent_at + 24h. If status still SENT by this time, moves to WAITING.';
COMMENT ON COLUMN public.room_card_sends.penalty_deadline IS 'sent_at + 48h. If still SENT/WAITING, PENALTY is triggered.';
COMMENT ON COLUMN public.room_card_sends.message IS 'Optional short message sent with the card. Max 200 chars.';

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE public.room_card_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY rcs_select ON public.room_card_sends FOR SELECT
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY rcs_insert ON public.room_card_sends FOR INSERT
  WITH CHECK (sender_id = auth.uid());
CREATE POLICY rcs_update ON public.room_card_sends FOR UPDATE
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());
