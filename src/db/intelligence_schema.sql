-- ==========================================
-- Section 3 & 4: Advanced Intelligence Schema
-- ==========================================

-- 1. Behavioral Scores (updated periodically per user)
CREATE TABLE IF NOT EXISTS public.user_behavioral_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  engagement_score NUMERIC DEFAULT 0,   -- 0-100, how engaged is this user
  risk_score NUMERIC DEFAULT 0,         -- 0-100, how likely to churn
  initiation_score NUMERIC DEFAULT 0,   -- 0-100, do they send cards or just receive
  response_score NUMERIC DEFAULT 0,     -- 0-100, how fast/often do they respond
  overall_score NUMERIC DEFAULT 0,      -- weighted composite
  score_label VARCHAR(30) DEFAULT 'UNSCORED', -- CHAMPION, ACTIVE, AT_RISK, CHURNED
  last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. User Feedback
CREATE TABLE IF NOT EXISTS public.user_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  feedback_type VARCHAR(50) NOT NULL, -- 'BUG', 'FEATURE_REQUEST', 'GENERAL', 'CARD_FEEDBACK'
  rating INT CHECK (rating BETWEEN 1 AND 5),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb, -- e.g. card_id, room_id
  status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED')),
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Content Versioning (track changes to cards)
CREATE TABLE IF NOT EXISTS public.card_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  name TEXT,
  description TEXT,
  category_id UUID,
  changed_by_admin_id UUID REFERENCES public.admins(id) ON DELETE SET NULL,
  change_reason TEXT,
  snapshot_json JSONB NOT NULL,  -- full card snapshot at this version
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_versions_card ON public.card_versions (card_id, version_number);
CREATE INDEX IF NOT EXISTS idx_behavioral_scores_label ON public.user_behavioral_scores (score_label);
CREATE INDEX IF NOT EXISTS idx_user_feedback_status ON public.user_feedback (status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON public.user_feedback (feedback_type);

-- Trigger for feedback updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_feedback_updated_at ON public.user_feedback;
CREATE TRIGGER trg_user_feedback_updated_at
  BEFORE UPDATE ON public.user_feedback
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
