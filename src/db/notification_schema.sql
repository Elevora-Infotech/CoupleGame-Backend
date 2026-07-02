-- ============================================================
-- CoupleGame: Notifications & Admin Broadcasts Schema
-- Run this once in your Supabase SQL Editor
-- ============================================================

-- 1. Main Notifications Table (User facing)
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
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON public.notifications(user_id, is_read) WHERE is_read = FALSE;

-- Fast lookup: paginated fetch for a user
CREATE INDEX IF NOT EXISTS idx_notif_user_created ON public.notifications(user_id, created_at DESC);

-- 2. Admin Notification Templates (System configuration)
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  type        TEXT    UNIQUE NOT NULL, -- The event type, e.g., CARD_RECEIVED
  title       TEXT    NOT NULL,
  body        TEXT    NOT NULL,
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3. Scheduled Admin Notifications
CREATE TABLE IF NOT EXISTS public.scheduled_notifications (
  id             UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id       UUID    NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
  title          TEXT    NOT NULL,
  body           TEXT    NOT NULL,
  data           JSONB   DEFAULT '{}'::jsonb,
  target_type    TEXT    NOT NULL DEFAULT 'all', -- 'all' or 'single'
  target_user_id UUID    REFERENCES public.users(id) ON DELETE CASCADE, -- if single
  status         TEXT    NOT NULL DEFAULT 'PENDING', -- PENDING, SENDING, SENT, FAILED, CANCELLED
  scheduled_for  TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_count     INT     DEFAULT 0,
  sent_at        TIMESTAMP WITH TIME ZONE,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 4. Admin Manual Broadcast Logs
CREATE TABLE IF NOT EXISTS public.admin_notification_logs (
  id             UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id       UUID    NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
  type           TEXT    NOT NULL, -- MANUAL_SINGLE or MANUAL_BROADCAST
  title          TEXT    NOT NULL,
  body           TEXT    NOT NULL,
  target_user_id UUID    REFERENCES public.users(id) ON DELETE SET NULL,
  sent_count     INT     DEFAULT 0,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 5. Add deadline warning tracking to room_card_sends
ALTER TABLE public.room_card_sends ADD COLUMN IF NOT EXISTS deadline_warned BOOLEAN NOT NULL DEFAULT FALSE;

-- 6. Add ban lift notification tracking to user_send_bans
ALTER TABLE public.user_send_bans ADD COLUMN IF NOT EXISTS ban_lifted_notified BOOLEAN NOT NULL DEFAULT FALSE;

-- Insert default templates
INSERT INTO public.notification_templates (type, title, body) VALUES
('CARD_RECEIVED', '💫 You received a card!', 'Your partner sent you a card. Tap to view and respond.'),
('CARD_ACCEPTED', '✅ Card Accepted!', 'Your partner accepted your card and is working on it.'),
('CARD_COMPLETED', '🎉 Card Completed!', 'Your partner completed the card challenge! Tap to confirm.'),
('CARD_CONFIRMED', '✨ Challenge Confirmed!', 'Your partner confirmed the card is done. Well played 👏'),
('CARD_REJECTED', '🗑️ Card Rejected', 'Your partner rejected your card.'),
('CARD_DEFLECTED', '🛡️ Card Deflected', 'Your partner used a Deflect card. The moment has passed without penalty.'),
('CARD_REMINDER', '🔔 Reminder from Partner', 'Your partner is waiting for you to confirm their completed card.'),
('PARTNER_JOINED', '💕 Partner Joined!', 'Your partner joined the room. Your game is now ACTIVE!'),
('FREE_CARDS_GRANTED', '🎁 Free Cards Added!', 'Free cards have been added to your deck. Start playing!'),
('PENALTY_RECEIVED', '⚠️ Penalty Received', 'You received a penalty for a rule violation.'),
('SEND_BAN_RECEIVED', '🚫 Sending Paused', 'Your ability to send cards has been temporarily paused.'),
('CARD_DEADLINE_WARN', '⏰ Card Expiring Soon!', 'A card is about to expire. Respond soon to avoid a penalty.'),
('SEND_BAN_LIFTED', '✅ Ban Lifted', 'Your sending ban has been lifted. You can now send cards again.')
ON CONFLICT (type) DO NOTHING;
