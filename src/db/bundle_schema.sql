-- ============================================================
-- EleVora: Card Store Bundle System Schema
-- Version : 1.0.0
-- Author  : EleVora Backend Team
-- Depends : cards_schema.sql (public.cards must exist first)
-- ============================================================
-- 
-- Entity Relationship Overview:
--
--   bundles (1) ──< bundle_cards (N) >── cards (1)
--   bundles (1) ──< bundle_plans  (N)
--
-- Run this file AFTER cards_schema.sql and full_schema_v2.sql
-- ============================================================


-- ============================================================
-- SECTION 0: Guard — Ensure the handle_updated_at() trigger
--             function exists before we attach it to tables.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- SECTION 1: bundles
-- The top-level container that groups cards and pricing plans.
-- Admin creates bundles; users browse them in the store.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bundles (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Display fields shown on the store listing page
  name             VARCHAR(150)  NOT NULL,
  description      TEXT,
  cover_image_url  TEXT,

  -- Soft-delete / visibility toggle (no hard deletes)
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,

  -- Auto-managed timestamps
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Data-integrity constraints
  CONSTRAINT bundles_name_not_empty CHECK (TRIM(name) <> '')
);

COMMENT ON TABLE  public.bundles                IS 'Top-level store product that groups cards and pricing options.';
COMMENT ON COLUMN public.bundles.cover_image_url IS 'URL to bundle banner / thumbnail image shown in the store UI.';
COMMENT ON COLUMN public.bundles.is_active       IS 'FALSE hides the bundle from the store without permanent deletion.';

-- Auto-update updated_at on every row change
DROP TRIGGER IF EXISTS trg_bundles_updated_at ON public.bundles;
CREATE TRIGGER trg_bundles_updated_at
  BEFORE UPDATE ON public.bundles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();


-- ============================================================
-- SECTION 2: bundle_cards
-- Many-to-Many junction table linking Bundles ↔ Cards.
-- Admin can attach ANY card from the catalog to ANY bundle.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bundle_cards (
  id         UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
  bundle_id  UUID  NOT NULL REFERENCES public.bundles(id) ON DELETE CASCADE,
  card_id    UUID  NOT NULL REFERENCES public.cards(id)   ON DELETE CASCADE,

  -- Audit timestamp (no updated_at needed on junction tables)
  added_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Prevent the same card from being added to the same bundle twice
  CONSTRAINT bundle_cards_unique_pair UNIQUE (bundle_id, card_id)
);

COMMENT ON TABLE  public.bundle_cards           IS 'Junction table: which cards belong to which bundle.';
COMMENT ON COLUMN public.bundle_cards.bundle_id IS 'FK → bundles. Cascade-deleted when the bundle is hard-deleted.';
COMMENT ON COLUMN public.bundle_cards.card_id   IS 'FK → cards. Cascade-deleted when the card is hard-deleted.';


-- ============================================================
-- SECTION 3: bundle_plans
-- Pricing tiers that define how many cards a user receives
-- and at what price point for a given bundle.
--
-- A single bundle can have MULTIPLE plans, e.g.:
--   Starter  →  ₹10  for 5  cards
--   Popular  →  ₹25  for 15 cards
--   Premium  →  ₹50  for 35 cards
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bundle_plans (
  id          UUID           DEFAULT gen_random_uuid() PRIMARY KEY,
  bundle_id   UUID           NOT NULL REFERENCES public.bundles(id) ON DELETE CASCADE,

  -- Plan labels e.g. "Starter", "Popular", "Premium"
  name        VARCHAR(100)   NOT NULL,

  -- Price in INR stored as NUMERIC for exact decimal representation
  price       NUMERIC(10, 2) NOT NULL DEFAULT 0.00,

  -- How many cards from the bundle the user receives on purchase
  card_count  INT            NOT NULL DEFAULT 5,

  -- Soft-delete so old plans can be hidden without breaking purchase history
  is_active   BOOLEAN        NOT NULL DEFAULT TRUE,

  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Data-integrity constraints
  CONSTRAINT bundle_plans_price_non_negative      CHECK (price >= 0),
  CONSTRAINT bundle_plans_card_count_positive     CHECK (card_count > 0),
  CONSTRAINT bundle_plans_name_not_empty          CHECK (TRIM(name) <> '')
);

COMMENT ON TABLE  public.bundle_plans             IS 'Pricing tiers for a bundle (multiple plans per bundle allowed).';
COMMENT ON COLUMN public.bundle_plans.price       IS 'Price in INR (NUMERIC for exact decimal — avoids floating-point issues).';
COMMENT ON COLUMN public.bundle_plans.card_count  IS 'Number of cards from the bundle pool the user receives upon purchase.';
COMMENT ON COLUMN public.bundle_plans.is_active   IS 'FALSE hides the plan without deleting historical purchase references.';

-- Auto-update updated_at on every row change
DROP TRIGGER IF EXISTS trg_bundle_plans_updated_at ON public.bundle_plans;
CREATE TRIGGER trg_bundle_plans_updated_at
  BEFORE UPDATE ON public.bundle_plans
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();


-- ============================================================
-- SECTION 4: Performance Indexes
-- Crucial for fast querying when the store has 100s of bundles
-- ============================================================

-- Fast lookup: "give me all active bundles" (store listing page)
CREATE INDEX IF NOT EXISTS idx_bundles_is_active
  ON public.bundles(is_active);

-- Fast lookup: "give me all card IDs inside bundle X"
CREATE INDEX IF NOT EXISTS idx_bundle_cards_bundle_id
  ON public.bundle_cards(bundle_id);

-- Fast lookup: "which bundles contain card Y?" (reverse lookup)
CREATE INDEX IF NOT EXISTS idx_bundle_cards_card_id
  ON public.bundle_cards(card_id);

-- Fast lookup: "give me all active plans for bundle X"
CREATE INDEX IF NOT EXISTS idx_bundle_plans_bundle_id
  ON public.bundle_plans(bundle_id);

CREATE INDEX IF NOT EXISTS idx_bundle_plans_is_active
  ON public.bundle_plans(is_active);


-- ============================================================
-- SECTION 5: Row Level Security (RLS)
-- Backend (service_role key) bypasses RLS for admin writes.
-- Authenticated users can only SELECT active records.
-- ============================================================
ALTER TABLE public.bundles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_plans ENABLE ROW LEVEL SECURITY;

-- Users can view active bundles only
DROP POLICY IF EXISTS "Users can view active bundles" ON public.bundles;
CREATE POLICY "Users can view active bundles"
  ON public.bundles
  FOR SELECT
  USING (is_active = TRUE);

-- Users can view cards inside active bundles
DROP POLICY IF EXISTS "Users can view bundle cards" ON public.bundle_cards;
CREATE POLICY "Users can view bundle cards"
  ON public.bundle_cards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bundles b
      WHERE b.id = bundle_id AND b.is_active = TRUE
    )
  );

-- Users can view active pricing plans only
DROP POLICY IF EXISTS "Users can view active bundle plans" ON public.bundle_plans;
CREATE POLICY "Users can view active bundle plans"
  ON public.bundle_plans
  FOR SELECT
  USING (is_active = TRUE);


-- ============================================================
-- SECTION 6: Useful Views
-- Pre-built queries to simplify backend service code.
-- ============================================================

-- View: Full store listing (active bundles + their active plans)
CREATE OR REPLACE VIEW public.v_store_bundles AS
  SELECT
    b.id,
    b.name,
    b.description,
    b.cover_image_url,
    b.created_at,
    COUNT(DISTINCT bc.card_id)               AS total_cards,
    json_agg(
      json_build_object(
        'id',         bp.id,
        'name',       bp.name,
        'price',      bp.price,
        'card_count', bp.card_count
      ) ORDER BY bp.price ASC
    ) FILTER (WHERE bp.id IS NOT NULL)        AS plans
  FROM  public.bundles b
  LEFT  JOIN public.bundle_cards bc ON bc.bundle_id = b.id
  LEFT  JOIN public.bundle_plans bp ON bp.bundle_id = b.id AND bp.is_active = TRUE
  WHERE b.is_active = TRUE
  GROUP BY b.id;

COMMENT ON VIEW public.v_store_bundles IS
  'Pre-aggregated store listing: active bundles with card count and active plans as JSON.';

-- ============================================================
-- END OF SCHEMA
-- ============================================================
