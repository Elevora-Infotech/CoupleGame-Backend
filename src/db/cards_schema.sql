-- ==========================================
-- Industry Standard Schema: EleVora Card Deck
-- ==========================================

-- 1. Card Categories Table
-- Stores the 7 core pillars of the game
CREATE TABLE IF NOT EXISTS public.card_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  theme_color VARCHAR(7) DEFAULT '#000000', -- HEX color for UI (e.g., #FF5733)
  icon_url TEXT, -- For frontend SVGs
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
); 

-- 2. Cards Catalog Table
-- Stores the actual 100+ cards
CREATE TABLE IF NOT EXISTS public.cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.card_categories(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  power_description TEXT NOT NULL,
  image_url TEXT, -- URL to the card artwork (stored in Supabase Storage or Frontend assets)
  
  -- Flexible metadata (for future mechanics: turn skips, point values, timers)
  attributes JSONB DEFAULT '{}'::jsonb, 
  
  -- Strict Typing for Game Logic
  card_type VARCHAR(50) DEFAULT 'ACTION' CHECK (card_type IN ('ACTION', 'WILDCARD', 'DEFENSE', 'REACTION', 'DEFLECT')),

  -- TRUE = this card is a wildcard/deflect-type card
  is_wildcard BOOLEAN NOT NULL DEFAULT FALSE,

  -- Deflect card server-side action (NULL = regular card, not a deflect card)
  -- When a deflect card is played, the server reads this field and auto-executes
  -- the matching hardcoded handler. Admin cannot change this logic — only pick
  -- from the dropdown when creating the card.
  deflect_action VARCHAR(30) DEFAULT NULL
    CHECK (deflect_action IN (
      'CANCEL_ANY',         -- Cancel any SENT/WAITING card, no penalty
      'CANCEL_SENT_ONLY',   -- Only cancel if card is still in SENT status (Nice Try)
      'CANCEL_IN_PROGRESS', -- Only cancel if card is IN_PROGRESS (Party Pooper)
      'CANCEL_IMMUNE',      -- Cancel + block counter-deflect (Not Today Satan)
      'REVERSE_ROLES',      -- Cancel + re-send with roles swapped (Switcheroo)
      'TIMEOUT'             -- Add +10 min to deadline, no cancel (Time Out Card)
    )),
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- Performance Indexes
-- ==========================================
-- Very important for fast fetching when the user opens the deck
CREATE INDEX IF NOT EXISTS idx_cards_category_id ON public.cards(category_id);
CREATE INDEX IF NOT EXISTS idx_cards_card_type ON public.cards(card_type);

-- ==========================================
-- Triggers
-- ==========================================
DROP TRIGGER IF EXISTS trg_card_categories_updated_at ON public.card_categories;
CREATE TRIGGER trg_card_categories_updated_at
  BEFORE UPDATE ON public.card_categories
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS trg_cards_updated_at ON public.cards;
CREATE TRIGGER trg_cards_updated_at
  BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ==========================================
-- Row Level Security (RLS)
-- ==========================================
-- The catalog is public to read, but only admins/backend can write
ALTER TABLE public.card_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active categories" ON public.card_categories;
CREATE POLICY "Anyone can view active categories" ON public.card_categories
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Anyone can view active cards" ON public.cards;
CREATE POLICY "Anyone can view active cards" ON public.cards
  FOR SELECT USING (is_active = true);
