-- Run this in your Supabase SQL Editor
-- Adds the is_blocked column required for User Management

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE NOT NULL;

-- Index for fast filtering of blocked users
CREATE INDEX IF NOT EXISTS idx_users_is_blocked ON public.users (is_blocked);
