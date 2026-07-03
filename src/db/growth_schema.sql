-- ==========================================
-- Growth & Optimization System (A/B Testing & Telemetry)
-- ==========================================

-- 1. App Telemetry Events (For Funnel Tracking)
CREATE TABLE IF NOT EXISTS public.app_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  event_name VARCHAR(100) NOT NULL, -- e.g., 'APP_INSTALL', 'ACCOUNT_CREATED', 'GAME_STARTED', 'FIRST_CARD_SENT'
  event_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_events_name ON public.app_events (event_name);
CREATE INDEX IF NOT EXISTS idx_app_events_user ON public.app_events (user_id);

-- 2. A/B Testing Campaigns
CREATE TABLE IF NOT EXISTS public.ab_tests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(150) UNIQUE NOT NULL,
  description TEXT,
  test_type VARCHAR(50) NOT NULL, -- 'NOTIFICATION', 'CARD_TYPE', 'PENALTY_RULE', 'UI_LAYOUT'
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED')),
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. A/B Testing Variants
CREATE TABLE IF NOT EXISTS public.ab_test_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  variant_name VARCHAR(50) NOT NULL, -- 'A', 'B', 'C', 'Control'
  config_json JSONB NOT NULL, -- The actual variables being tested
  traffic_allocation_percent INT DEFAULT 50, -- % of users that get this
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. User Assignments to Variants (To ensure consistent experience)
CREATE TABLE IF NOT EXISTS public.ab_test_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.ab_test_variants(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(test_id, user_id)
);

-- Metrics for A/B Tests (Conversions)
CREATE TABLE IF NOT EXISTS public.ab_test_conversions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.ab_test_assignments(id) ON DELETE CASCADE,
  conversion_event VARCHAR(100) NOT NULL,
  converted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert dummy data for Funnel Tracking if app_events is empty
INSERT INTO public.app_events (user_id, event_name, created_at)
SELECT id, 'ACCOUNT_CREATED', created_at FROM public.users
ON CONFLICT DO NOTHING;

-- Trigger for AB Tests updated_at
DROP TRIGGER IF EXISTS trg_ab_tests_updated_at ON public.ab_tests;
CREATE TRIGGER trg_ab_tests_updated_at
  BEFORE UPDATE ON public.ab_tests
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
