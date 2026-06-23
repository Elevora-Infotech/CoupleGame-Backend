-- ============================================================
-- EleVora: Penalty System Schema Migration
-- Run AFTER purchase_schema.sql and card_sends_schema.sql
-- ============================================================

-- ── Step 1: Add REJECTED status to card_send_status enum ─────
-- Penalty 3 (Rejection) requires a new terminal status.
ALTER TYPE card_send_status ADD VALUE IF NOT EXISTS 'REJECTED';

-- ── Step 2: Add penalty tracking columns to room_card_sends ──
-- rejected_at: timestamp when receiver explicitly pressed Reject
ALTER TABLE public.room_card_sends
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;

-- ── Step 3: Create user_send_bans table ───────────────────────
-- Penalty 2: Tracks 24h sending bans for non-completion.
-- Separate table keeps room_card_sends clean and allows
-- multiple bans to stack if player keeps abandoning cards.
CREATE TABLE IF NOT EXISTS public.user_send_bans (
  id           UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  room_id      UUID    NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  send_id      UUID    NOT NULL REFERENCES public.room_card_sends(id) ON DELETE CASCADE,
  reason       TEXT    NOT NULL DEFAULT 'INCOMPLETE_CARD',
  banned_until TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bans_user_active
  ON public.user_send_bans(user_id, banned_until)
  WHERE is_active = TRUE;

COMMENT ON TABLE public.user_send_bans IS
  'Tracks 24h sending bans. Penalty 2: receiver accepts a card but never completes it.';

-- ── Step 4: Create penalty_log table ─────────────────────────
-- Audit trail of every penalty event for both users to see.
-- Frontend reads this to show penalty history in the room.
CREATE TABLE IF NOT EXISTS public.penalty_log (
  id             UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id        UUID    NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  send_id        UUID    NOT NULL REFERENCES public.room_card_sends(id) ON DELETE CASCADE,
  penalized_user UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  penalty_type   TEXT    NOT NULL
                         CHECK (penalty_type IN (
                           'NON_ACCEPTANCE',   -- Penalty 1: card ignored 48h
                           'INCOMPLETE_CARD',  -- Penalty 2: accepted but not finished
                           'REJECTION'         -- Penalty 3: explicit reject
                         )),
  message        TEXT    NOT NULL,
  -- For Penalty 1: which card was removed (deck card id)
  card_removed_id UUID   REFERENCES public.user_card_deck(id) ON DELETE SET NULL,
  -- For Penalty 3: which card was transferred (deck card id)
  card_transferred_id UUID REFERENCES public.user_card_deck(id) ON DELETE SET NULL,
  -- For Penalty 2: when ban expires
  ban_expires_at TIMESTAMP WITH TIME ZONE,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_penalty_room
  ON public.penalty_log(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_penalty_user
  ON public.penalty_log(penalized_user, created_at DESC);

COMMENT ON TABLE public.penalty_log IS
  'Audit log of every penalty triggered. Both users in the room can see this.';

-- ── Step 5: Extend resolveOverdueStatuses to also track penalty ──
-- The existing lazy-resolution sets status=PENALTY in room_card_sends.
-- Our penaltyService will consume those and apply real consequences.
-- No schema changes needed — penalty_triggered_at column already exists.

-- ── Step 6: Add completion_deadline for Penalty 2 ────────────
-- When a card is accepted (IN_PROGRESS), set 48h to complete it.
ALTER TABLE public.room_card_sends
  ADD COLUMN IF NOT EXISTS completion_deadline TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.room_card_sends.completion_deadline IS
  'accepted_at + 48h. If still IN_PROGRESS by this time, Penalty 2 is triggered (send ban).';
