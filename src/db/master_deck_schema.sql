-- ============================================================
-- EleVora: Master Deck System Schema
-- Adds two admin-managed free card pools:
--   master_decks    : defines the 7_DAYS and 30_DAYS pools
--   master_deck_cards: links cards into each pool (admin-managed)
-- ============================================================

-- ── Table: master_decks ───────────────────────────────────────
-- Two rows only: one for 7_DAYS plan, one for 30_DAYS plan.
-- Admin cannot create more — these are fixed by plan type.
CREATE TABLE IF NOT EXISTS public.master_decks (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_type   TEXT    NOT NULL UNIQUE
                      CHECK (plan_type IN ('7_DAYS', '30_DAYS')),
  name        TEXT    NOT NULL,   -- display name in admin panel
  description TEXT,
  card_count  INT     NOT NULL,   -- how many free cards to give (7 or 30)
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.master_decks IS
  'Admin-managed free card pools. 7_DAYS plan gets 7 cards; 30_DAYS gets 30 cards.';

-- Seed the two fixed decks
INSERT INTO public.master_decks (plan_type, name, description, card_count)
VALUES
  ('7_DAYS',  '7-Day Free Deck',  'Cards distributed to users who create a free 7-day room.', 7),
  ('30_DAYS', '30-Day Free Deck', 'Cards distributed to users who pay for a 30-day room. Includes 5 deflect cards automatically.', 30)
ON CONFLICT (plan_type) DO NOTHING;

-- ── Table: master_deck_cards ──────────────────────────────────
-- Admin picks which cards go into each pool from the card catalog.
-- 80/20 algorithm runs at distribution time using this pool.
CREATE TABLE IF NOT EXISTS public.master_deck_cards (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id    UUID NOT NULL REFERENCES public.master_decks(id) ON DELETE CASCADE,
  card_id    UUID NOT NULL REFERENCES public.cards(id)        ON DELETE CASCADE,
  added_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  added_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- which admin added it
  CONSTRAINT uq_master_deck_card UNIQUE (deck_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_mdc_deck  ON public.master_deck_cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_mdc_card  ON public.master_deck_cards(card_id);

COMMENT ON TABLE public.master_deck_cards IS
  'Junction table: which cards are in each master deck pool. Admin-managed.';

-- ── user_card_deck: track which master deck granted a free card ──
-- NULL = card came from a paid purchase (bundle)
-- Non-null = card was a free grant from the master deck on room join
ALTER TABLE public.user_card_deck
  ADD COLUMN IF NOT EXISTS master_deck_id UUID
    REFERENCES public.master_decks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deck_master
  ON public.user_card_deck(master_deck_id)
  WHERE master_deck_id IS NOT NULL;

COMMENT ON COLUMN public.user_card_deck.master_deck_id IS
  'If set, this card was distributed for free from the admin master deck pool on room join. NULL = paid card from a bundle purchase.';

