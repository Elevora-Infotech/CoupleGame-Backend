-- ═══════════════════════════════════════════════════════════════
-- room_card_sends
-- Records every card send event between partners inside a room.
-- A "send" = one partner picks a card from their deck and pushes
-- it to their partner in real-time with an optional short message.
-- The card is marked as used (is_used=TRUE) at the moment of send.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.room_card_sends (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,

  -- The room where this send happened
  room_id         UUID    NOT NULL
                          REFERENCES public.rooms(id)
                          ON DELETE CASCADE,

  -- Who sent the card
  sender_id       UUID    NOT NULL
                          REFERENCES public.users(id)
                          ON DELETE CASCADE,

  -- Who received the card
  receiver_id     UUID    NOT NULL
                          REFERENCES public.users(id)
                          ON DELETE CASCADE,

  -- The exact deck entry that was sent
  -- Links to user_card_deck so we have full card + purchase traceability
  deck_card_id    UUID    NOT NULL
                          REFERENCES public.user_card_deck(id)
                          ON DELETE CASCADE,

  -- The card template (denormalized for fast reads without joins)
  card_id         UUID    NOT NULL
                          REFERENCES public.cards(id)
                          ON DELETE CASCADE,

  -- Optional short message sent with the card (max 200 chars)
  message         TEXT    CHECK (char_length(message) <= 200),

  -- Has the receiver acknowledged/seen the card?
  is_seen         BOOLEAN NOT NULL DEFAULT FALSE,
  seen_at         TIMESTAMP WITH TIME ZONE,

  sent_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Prevent the same deck card being sent twice
  CONSTRAINT uq_deck_card_sent UNIQUE (deck_card_id)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rcs_room_id     ON public.room_card_sends(room_id);
CREATE INDEX IF NOT EXISTS idx_rcs_receiver    ON public.room_card_sends(receiver_id, is_seen);
CREATE INDEX IF NOT EXISTS idx_rcs_sender      ON public.room_card_sends(sender_id);

-- ── Comments ─────────────────────────────────────────────────
COMMENT ON TABLE  public.room_card_sends             IS 'Tracks every card send between partners in a room. One row per send event.';
COMMENT ON COLUMN public.room_card_sends.deck_card_id IS 'References user_card_deck. UNIQUE ensures same physical card cannot be sent twice.';
COMMENT ON COLUMN public.room_card_sends.message      IS 'Optional short message (max 200 chars) sent alongside the card.';
COMMENT ON COLUMN public.room_card_sends.is_seen      IS 'TRUE once receiver has opened/acknowledged the card.';

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.room_card_sends ENABLE ROW LEVEL SECURITY;

-- Users can only see sends where they are sender or receiver
CREATE POLICY rcs_select ON public.room_card_sends FOR SELECT
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Users can only insert sends where they are the sender
CREATE POLICY rcs_insert ON public.room_card_sends FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Receiver can update is_seen (mark as seen)
CREATE POLICY rcs_update ON public.room_card_sends FOR UPDATE
  USING (receiver_id = auth.uid());
