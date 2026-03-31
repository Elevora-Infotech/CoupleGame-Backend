-- ==========================================
-- Part 1: Profiles & Global Hardening
-- ==========================================

-- 1. Create a reusable trigger function for all tables
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the Profiles Table
-- Stores first/last names, bios, and UI preferences
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  avatar_url TEXT DEFAULT 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lucky',
  bio TEXT,
  date_of_birth DATE,
  preferences JSONB DEFAULT '{"theme": "dark", "notifications": true}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Advanced Trigger: Automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name)
  VALUES (NEW.id, split_part(NEW.name, ' ', 1)); -- Guess first name from users.name
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger correctly hooked to users table
DROP TRIGGER IF EXISTS on_auth_user_created ON public.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.create_profile_on_signup();

-- Apply updated_at trigger to profiles
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();


-- ==========================================
-- Part 2: Dynamic Questionnaire (3NF Normalized)
-- ==========================================

-- 1. Questions Table
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT NOT NULL,
  input_type VARCHAR(50) DEFAULT 'SINGLE_CHOICE', -- SINGLE_CHOICE, MULTI_CHOICE, TEXT, SLIDER
  is_active BOOLEAN DEFAULT TRUE,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Question Options (The selectable answers)
CREATE TABLE IF NOT EXISTS public.question_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Question Dependencies (Branching Logic)
-- E.g., Show Q2 only if Q1 = Option A
CREATE TABLE IF NOT EXISTS public.question_dependencies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  parent_question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  required_option_id UUID REFERENCES public.question_options(id) ON DELETE CASCADE
);

-- 4. User Answers (Stores the actual data)
CREATE TABLE IF NOT EXISTS public.user_answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id UUID REFERENCES public.question_options(id) ON DELETE SET NULL,
  text_value TEXT, -- For TEXT or SLIDER types
  answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prevent multiple rows for the same user/question (Allows editing)
  UNIQUE(user_id, question_id)
);

-- ==========================================
-- Part 3: Performance Hardening (Indexes)
-- ==========================================

-- Fast lookups for foreign keys (Crucial for 10k users)
CREATE INDEX IF NOT EXISTS idx_options_question_id ON public.question_options(question_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_child_id ON public.question_dependencies(child_question_id);
CREATE INDEX IF NOT EXISTS idx_answers_user_id ON public.user_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON public.user_answers(question_id);

-- Apply updated_at triggers to everything
CREATE TRIGGER trg_questions_updated_at BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_user_answers_updated_at BEFORE UPDATE ON public.user_answers FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
