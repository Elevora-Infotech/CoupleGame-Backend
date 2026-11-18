-- ============================================================================
-- SOULSHUFFLE: PHASE 1 ADVANCED DATABASE MIGRATION & PERFORMANCE OPTIMIZATION
-- SPECIFICATION: SoulShuffle Admin Panel Requirements (October 2026, Part D)
-- ARCHITECTURE: RevenueCat (Apple In-App Purchase, Google Play Billing, Amazon Appstore)
-- SAFETY GUARANTEE: 100% Backward Compatible (Zero disruption to live gameplay)
-- PERFORMANCE: Ultra-Fast GIN Trigram Search + Covering & Partial Composite Indexes
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. HIGH-SPEED EXTENSIONS (For Instant Fuzzy/Substring Search)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ----------------------------------------------------------------------------
-- 1. TABLE ALTERATIONS & HIGH-SPEED INDEXES: users (Players)
-- ----------------------------------------------------------------------------
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone_masked VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source JSONB DEFAULT '{"type": "organic"}'::jsonb,
  ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'android',
  ADD COLUMN IF NOT EXISTS app_version VARCHAR(20) DEFAULT '1.0.0',
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Standard B-Tree Indexes
CREATE INDEX IF NOT EXISTS idx_users_platform ON public.users(platform);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON public.users(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);

-- GIN Trigram Indexes (Sub-millisecond Search across Name & Email)
CREATE INDEX IF NOT EXISTS idx_users_name_trgm ON public.users USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON public.users USING gin (email gin_trgm_ops);

-- Partial index for active (non-blocked) users
CREATE INDEX IF NOT EXISTS idx_users_active_only ON public.users(id) WHERE is_blocked = false;

-- ----------------------------------------------------------------------------
-- 2. TABLE ALTERATIONS & HIGH-SPEED INDEXES: rooms (Couples)
-- ----------------------------------------------------------------------------
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'organic',
  ADD COLUMN IF NOT EXISTS paired_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS closed_reason VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS current_game_number INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS season_number INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS settings_snapshot JSONB DEFAULT NULL;

-- High-Performance Composite Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_paired_at ON public.rooms(paired_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_mode ON public.rooms(mode);
CREATE INDEX IF NOT EXISTS idx_rooms_source ON public.rooms(source);
CREATE INDEX IF NOT EXISTS idx_rooms_status_created ON public.rooms(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_host_partner ON public.rooms(host_id, partner_id);

-- GIN Trigram Index on Room Code for instant code autocomplete/search
CREATE INDEX IF NOT EXISTS idx_rooms_code_trgm ON public.rooms USING gin (code gin_trgm_ops);

-- Partial index for active game rooms
CREATE INDEX IF NOT EXISTS idx_rooms_active_only ON public.rooms(id, paired_at) WHERE status = 'ACTIVE';

-- ----------------------------------------------------------------------------
-- 3. TABLE ALTERATIONS & HIGH-SPEED INDEXES: room_card_sends (Card Play Events)
-- ----------------------------------------------------------------------------
ALTER TABLE public.room_card_sends
  ADD COLUMN IF NOT EXISTS card_version INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'PS',
  ADD COLUMN IF NOT EXISTS is_free_pool BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS optional_note_used BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS response_action VARCHAR(30) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS response_time_seconds INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS completion_time_seconds INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_auto_confirmed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS penalty_applied VARCHAR(30) DEFAULT NULL;

-- High-Frequency Metric & Timeline Indexes
CREATE INDEX IF NOT EXISTS idx_rcs_room_status_sent ON public.room_card_sends(room_id, status, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcs_sender_receiver ON public.room_card_sends(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_rcs_category ON public.room_card_sends(category);
CREATE INDEX IF NOT EXISTS idx_rcs_response_action ON public.room_card_sends(response_action);
CREATE INDEX IF NOT EXISTS idx_rcs_sent_at_desc ON public.room_card_sends(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcs_is_free_pool ON public.room_card_sends(is_free_pool);

-- Partial index for pending/active cards (for Hand & Turn checks)
CREATE INDEX IF NOT EXISTS idx_rcs_pending_cards ON public.room_card_sends(room_id, receiver_id) 
  WHERE status IN ('SENT', 'WAITING', 'IN_PROGRESS', 'COMPLETED_BY_RECEIVER');

-- ----------------------------------------------------------------------------
-- 4. TABLE ALTERATIONS & HIGH-SPEED INDEXES: user_purchases (RevenueCat)
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_purchases
  ADD COLUMN IF NOT EXISTS payment_source VARCHAR(30) DEFAULT 'revenuecat',
  ADD COLUMN IF NOT EXISTS revenuecat_original_transaction_id VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS store_transaction_id VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS purchase_type VARCHAR(20) DEFAULT 'pack',
  ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_of_id UUID DEFAULT NULL REFERENCES public.user_purchases(id),
  ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS store_fee_amount NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS autopay_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_renewal BOOLEAN DEFAULT false;

-- Revenue & Search Indexes
CREATE INDEX IF NOT EXISTS idx_purchases_user_time ON public.user_purchases(user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.user_purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_source ON public.user_purchases(payment_source);
CREATE INDEX IF NOT EXISTS idx_purchases_purchased_at ON public.user_purchases(purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_transaction_id ON public.user_purchases(transaction_id);
CREATE INDEX IF NOT EXISTS idx_purchases_store_tx_id ON public.user_purchases(store_transaction_id);

-- Ultra-Fast Duplicate Payment Detector Index (within 15-minute window)
CREATE INDEX IF NOT EXISTS idx_purchases_dup_detector ON public.user_purchases(user_id, store_product_id, purchased_at DESC);

-- Partial index for active/successful purchases
CREATE INDEX IF NOT EXISTS idx_purchases_completed_only ON public.user_purchases(amount_paid, purchased_at) 
  WHERE status = 'completed';

-- ----------------------------------------------------------------------------
-- 5. NEW TABLE: player_performed_cards (Prevents Duplicate Pack Deals)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_performed_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  first_performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_player_card UNIQUE (player_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_ppc_player_lookup ON public.player_performed_cards(player_id, card_id);
CREATE INDEX IF NOT EXISTS idx_ppc_card_lookup ON public.player_performed_cards(card_id);

-- ----------------------------------------------------------------------------
-- 6. NEW TABLE: game_hands (Live Hands & Un-sent Returned Cards)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_hands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  game_number INT DEFAULT 1,
  season_number INT DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'in_hand',
  dealt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  was_sent BOOLEAN DEFAULT false,
  returned_to_pool BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_game_hands_room_player ON public.game_hands(room_id, player_id, status);
CREATE INDEX IF NOT EXISTS idx_game_hands_unreturned ON public.game_hands(room_id, was_sent) 
  WHERE returned_to_pool = false;

-- ----------------------------------------------------------------------------
-- 7. NEW TABLE: paywall_views (Funnel Drop-off Tracking)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.paywall_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  game_number INT DEFAULT 1,
  action_taken VARCHAR(30) DEFAULT 'closed',
  store_offering_id VARCHAR(50) DEFAULT 'season_pass_299',
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paywall_room_time ON public.paywall_views(room_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_paywall_action_time ON public.paywall_views(action_taken, viewed_at DESC);

-- ----------------------------------------------------------------------------
-- 8. NEW TABLE: room_member_events (Couple Room Stability)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_member_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rme_room_time ON public.room_member_events(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rme_type ON public.room_member_events(event_type);

-- ----------------------------------------------------------------------------
-- 9. NEW TABLE: support_notes (Couple Operational Workbench)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  author_name VARCHAR(100) NOT NULL,
  reason_tag VARCHAR(30) NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_notes_room_time ON public.support_notes(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_notes_tag ON public.support_notes(reason_tag);

-- ----------------------------------------------------------------------------
-- 10. NEW TABLE: admin_audit_logs (Immutable Append-Only Audit Ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  admin_name VARCHAR(100) NOT NULL,
  role VARCHAR(30) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  target_entity VARCHAR(50) NOT NULL,
  target_id VARCHAR(100) NOT NULL,
  before_state JSONB DEFAULT NULL,
  after_state JSONB DEFAULT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_target_time ON public.admin_audit_logs(target_entity, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created_desc ON public.admin_audit_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- 11. NEW TABLES: game_settings & settings_change_logs (Runtime Dynamic Config)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(50) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_by VARCHAR(100),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_settings_key ON public.game_settings(setting_key);

CREATE TABLE IF NOT EXISTS public.settings_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(50) NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,
  changed_by VARCHAR(100) NOT NULL,
  reason TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settings_change_key_time ON public.settings_change_logs(setting_key, changed_at DESC);

-- Seed Initial Default Game Settings from Spec B4
INSERT INTO public.game_settings (setting_key, setting_value, description)
VALUES 
  ('time_to_respond_hours', '24'::jsonb, 'Time allowed to respond to a sent card'),
  ('ignore_penalty_wait_hours', '24'::jsonb, 'Waiting period before ignore penalty applies'),
  ('time_to_complete_hours', '48'::jsonb, 'Time to complete an accepted card dare'),
  ('auto_confirm_timeout_hours', '36'::jsonb, 'Auto-confirmation window if sender does not confirm'),
  ('cards_per_day_cap', '3'::jsonb, 'Maximum cards a player can send per day'),
  ('active_cards_allowed', '2'::jsonb, 'Concurrent active cards allowed in hand'),
  ('season_cards_per_player', '30'::jsonb, 'Cards dealt to each player per 30-day season'),
  ('free_game_cards_per_player', '7'::jsonb, 'Cards dealt to each player in free game'),
  ('season_deflects', '5'::jsonb, 'Deflects granted per paid season'),
  ('free_game_deflects', '1'::jsonb, 'Deflects granted in free game'),
  ('free_game_length_days', '7'::jsonb, 'Maximum lifespan of a free game'),
  ('card_pack_price_inr', '20'::jsonb, 'Price for 3-card boost pack'),
  ('season_price_inr', '299'::jsonb, 'Price for 30-day paid season couple subscription'),
  ('gst_percentage', '18.0'::jsonb, 'Applicable GST percentage included in gross'),
  ('store_fee_percentage', '11.0'::jsonb, 'Google Alternative Billing / Apple Small Business fee %')
ON CONFLICT (setting_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 12. NEW TABLE: ad_spend (Meta / Marketing Spend Tracker)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_ist DATE NOT NULL,
  week_end_ist DATE NOT NULL,
  campaign_type VARCHAR(30) NOT NULL,
  ad_angle VARCHAR(30) NOT NULL,
  amount_inr NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_week_range ON public.ad_spend(week_start_ist, week_end_ist);
CREATE INDEX IF NOT EXISTS idx_ad_spend_angle ON public.ad_spend(ad_angle);

-- ----------------------------------------------------------------------------
-- 13. NEW TABLE: subscriptions (RevenueCat 30-Day Seasons)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  payer_id UUID NOT NULL REFERENCES public.users(id),
  store_product_id VARCHAR(100) NOT NULL,
  payment_source VARCHAR(30) DEFAULT 'revenuecat',
  status VARCHAR(30) DEFAULT 'active',
  current_season INT DEFAULT 1,
  autopay_status VARCHAR(20) DEFAULT 'active',
  day_28_message_sent BOOLEAN DEFAULT false,
  day_28_message_type VARCHAR(30) DEFAULT NULL,
  day_28_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  cancelled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_room ON public.subscriptions(room_id);
CREATE INDEX IF NOT EXISTS idx_sub_payer ON public.subscriptions(payer_id);
CREATE INDEX IF NOT EXISTS idx_sub_status_ends ON public.subscriptions(status, ends_at);

-- Partial High-Speed Index for Day 28 Hourly Cron Worker
CREATE INDEX IF NOT EXISTS idx_sub_day28_worker ON public.subscriptions(ends_at) 
  WHERE status = 'active' AND day_28_message_sent = false;

-- ----------------------------------------------------------------------------
-- 14. ULTRA-FAST UNIFIED SEARCH HELPER VIEW (Optional High-Performance Query View)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_unified_search AS
SELECT 
  'user' AS entity_type,
  u.id::text AS entity_id,
  u.name AS primary_text,
  u.email AS secondary_text,
  u.phone_masked AS phone_display,
  u.phone AS raw_search_phone,
  NULL AS room_code,
  u.created_at
FROM public.users u
UNION ALL
SELECT 
  'room' AS entity_type,
  r.id::text AS entity_id,
  r.code AS primary_text,
  r.mode AS secondary_text,
  NULL AS phone_display,
  NULL AS raw_search_phone,
  r.code AS room_code,
  r.created_at
FROM public.rooms r;
