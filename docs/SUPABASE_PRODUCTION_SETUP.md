# 🚀 EleVora: Supabase Production Setup Guide

This document is your "Master Record" for the EleVora database. It contains everything you need to recreate the entire system on a new Supabase account (like your company account) in one go.

---

## 🏗️ 1. Complete Database SQL
**Where to use:** Go to **SQL Editor** -> **New Query** -> Paste the code below -> **Run**.

```sql
-- ==========================================
-- Part 1: Users & Profiles (Core)
-- ==========================================

-- Trigger function to update timestamps automatically
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Profiles Table
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

-- 2. Advanced Trigger: Automatically create a profile on Signup
CREATE OR REPLACE FUNCTION public.create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name)
  VALUES (NEW.id, split_part(NEW.name, ' ', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON public.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.create_profile_on_signup();


-- ==========================================
-- Part 2: Dynamic Questionnaire (Game Engine)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT NOT NULL,
  input_type VARCHAR(50) DEFAULT 'SINGLE_CHOICE',
  is_active BOOLEAN DEFAULT TRUE,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.question_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.question_dependencies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  parent_question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  required_option_id UUID REFERENCES public.question_options(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.user_answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id UUID REFERENCES public.question_options(id) ON DELETE SET NULL,
  text_value TEXT,
  answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);


-- ==========================================
-- Part 3: Storage Setup (Avatars)
-- ==========================================
-- Run this to create the folder for images and set security

-- 1. Create Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Security Policies
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'avatars' );
CREATE POLICY "Users can upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'avatars' );
CREATE POLICY "Users can update" ON storage.objects FOR UPDATE USING ( bucket_id = 'avatars' );


-- ==========================================
-- Part 4: Performance Hardening (Indexes)
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_options_question_id ON public.question_options(question_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_child_id ON public.question_dependencies(child_question_id);
CREATE INDEX IF NOT EXISTS idx_answers_user_id ON public.user_answers(user_id);

-- Apply updated_at triggers
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_questions_updated_at BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_user_answers_updated_at BEFORE UPDATE ON public.user_answers FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
```

---

## 📦 2. Deployment Checklist

When moving to a new account, do these 3 things:

1.  **Run the SQL**: Copy Part 1-4 above and run it in the SQL Editor.
2.  **Enable RLS**: Go to the **Authentication -> Policies** tab and click **"Enable RLS"** for all tables.
3.  **Update `.env`**: Copy the new `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into your backend server's `.env` file.

---

## 🧪 3. Verification Commands
Run these in the SQL Editor to check if it's all working:
```sql
-- Check if bucket exists
SELECT * FROM storage.buckets WHERE id = 'avatars';

-- Check if trigger exists
SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'users';
```
