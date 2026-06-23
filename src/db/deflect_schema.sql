-- ============================================================
-- EleVora: Deflect Card System — Schema Migration
-- Run this AFTER cards_schema.sql and card_sends_schema.sql
-- ============================================================

-- ── Step 1: Add deflect_action column to cards table ─────────
-- NULL = regular action card
-- Non-null = deflect card with a predefined server-side effect
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS deflect_action VARCHAR(30) DEFAULT NULL
  CHECK (deflect_action IN (
    'CANCEL_ANY',
    'CANCEL_SENT_ONLY',
    'CANCEL_IN_PROGRESS',
    'CANCEL_IMMUNE',
    'REVERSE_ROLES',
    'TIMEOUT'
  ));

COMMENT ON COLUMN public.cards.deflect_action IS
  'Server-side effect executed when this deflect card is played. NULL = regular card.
   CANCEL_ANY          = Close any active/sent card, no penalty.
   CANCEL_SENT_ONLY    = Only close card if still in SENT status.
   CANCEL_IN_PROGRESS  = Only close card if in IN_PROGRESS status.
   CANCEL_IMMUNE       = Close card + sender cannot counter-deflect.
   REVERSE_ROLES       = Cancel card + re-send it with sender/receiver swapped.
   TIMEOUT             = Add +10 minutes to respond_deadline (no cancel).';

-- ── Step 2: Add is_deflect_immune to room_card_sends ─────────
-- Set TRUE by CANCEL_IMMUNE (Not Today Satan).
-- Prevents sender from firing a deflect card in response.
ALTER TABLE public.room_card_sends
  ADD COLUMN IF NOT EXISTS is_deflect_immune BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.room_card_sends.is_deflect_immune IS
  'TRUE = this send was closed by a CANCEL_IMMUNE card. Sender cannot counter-deflect.';

-- ── Step 3: Add is_wildcard column to cards (if missing) ─────
-- Already in seed but not in schema file. Safe to add idempotently.
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS is_wildcard BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.cards.is_wildcard IS
  'TRUE = this card is a wildcard/deflect-type card.';

-- ── Step 4: Update existing wildcard cards with deflect_action ─
-- Maps each of the 13 deflect cards (by exact name) to their action.

UPDATE public.cards SET deflect_action = 'CANCEL_IMMUNE'
  WHERE name = 'Not Today Satan';

UPDATE public.cards SET deflect_action = 'CANCEL_ANY'
  WHERE name = 'Big Fat No';

UPDATE public.cards SET deflect_action = 'CANCEL_ANY'
  WHERE name = 'Yeh Nah';

UPDATE public.cards SET deflect_action = 'CANCEL_IN_PROGRESS'
  WHERE name = 'Party Pooper';

UPDATE public.cards SET deflect_action = 'CANCEL_ANY'
  WHERE name = 'Break Glass in Case of Lazy';

UPDATE public.cards SET deflect_action = 'REVERSE_ROLES'
  WHERE name = 'Switcheroo';

UPDATE public.cards SET deflect_action = 'CANCEL_ANY'
  WHERE name = 'Not Feeling It';

UPDATE public.cards SET deflect_action = 'TIMEOUT'
  WHERE name = 'The Time Out Card';

UPDATE public.cards SET deflect_action = 'CANCEL_ANY'
  WHERE name = 'The Denial Denial Card';

UPDATE public.cards SET deflect_action = 'CANCEL_ANY'
  WHERE name = 'The "Don''t Wanna" Card';

UPDATE public.cards SET deflect_action = 'CANCEL_SENT_ONLY'
  WHERE name = 'The ''Nice Try'' Card';

UPDATE public.cards SET deflect_action = 'REVERSE_ROLES'
  WHERE name = 'The Role Reversal Defense';

UPDATE public.cards SET deflect_action = 'CANCEL_ANY'
  WHERE name = 'The One Free Pass';

-- ── Step 5: Add index on deflect_action for fast lookups ──────
CREATE INDEX IF NOT EXISTS idx_cards_deflect_action
  ON public.cards(deflect_action)
  WHERE deflect_action IS NOT NULL;

-- ── Step 6: Make purchase_id and bundle_id optional in user_card_deck ─
-- Deflect cards are granted for free on room entry, so they don't have a purchase_id.
ALTER TABLE public.user_card_deck
  ALTER COLUMN purchase_id DROP NOT NULL,
  ALTER COLUMN bundle_id DROP NOT NULL;
