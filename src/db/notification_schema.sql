-- ============================================================
-- CoupleGame: Notifications Table
-- Run this once in your Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,   -- CARD_RECEIVED, CARD_ACCEPTED, PENALTY_RECEIVED, etc.
  title      TEXT    NOT NULL,   -- Short title shown in bell popup
  body       TEXT    NOT NULL,   -- Longer description text
  data       JSONB   NOT NULL DEFAULT '{}'::jsonb,  -- Extra context (send_id, card_id, room_id)
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Fast lookup: fetch unread notifications for a user
CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON public.notifications(user_id, is_read)
  WHERE is_read = FALSE;

-- Fast lookup: paginated fetch for a user
CREATE INDEX IF NOT EXISTS idx_notif_user_created
  ON public.notifications(user_id, created_at DESC);

COMMENT ON TABLE public.notifications IS
  'In-app notification feed. Created by server on every game event. Read by mobile/web frontend.';
