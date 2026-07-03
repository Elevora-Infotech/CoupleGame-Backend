-- ==========================================
-- Section 3 & 4: Intelligence Analytics RPCs
-- ==========================================

-- ==========================================
-- 1. Behavioral Scoring Engine RPC
-- Computes real behavioral scores per user and upserts them
-- ==========================================
CREATE OR REPLACE FUNCTION compute_behavioral_scores()
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  engagement_score NUMERIC,
  risk_score NUMERIC,
  initiation_score NUMERIC,
  response_score NUMERIC,
  overall_score NUMERIC,
  score_label TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      u.id,
      u.name::TEXT AS user_name,
      -- Engagement: how many cards sent in last 30 days (0-100 scaled, cap 20 sends = 100)
      LEAST(100, COALESCE(COUNT(rcs.id) FILTER (WHERE rcs.created_at >= NOW() - INTERVAL '30 days'), 0) * 5)::NUMERIC AS engagement_score,
      -- Initiation: ratio of cards they sent vs received (weighted per room)
      CASE
        WHEN COALESCE(COUNT(rcs.id), 0) = 0 THEN 20
        ELSE LEAST(100, (COUNT(rcs.id)::NUMERIC / NULLIF(COUNT(rcs2.id), 0)) * 50)
      END::NUMERIC AS initiation_score,
      -- Risk score: days since last activity (high = risky)
      CASE
        WHEN MAX(rcs.created_at) IS NULL THEN 100
        WHEN MAX(rcs.created_at) < NOW() - INTERVAL '30 days' THEN 90
        WHEN MAX(rcs.created_at) < NOW() - INTERVAL '14 days' THEN 60
        WHEN MAX(rcs.created_at) < NOW() - INTERVAL '7 days' THEN 30
        ELSE 5
      END::NUMERIC AS risk_score,
      -- Response score: acceptance rate
      CASE
        WHEN COALESCE(COUNT(rcs2.id), 0) = 0 THEN 50
        ELSE LEAST(100, (COUNT(rcs2.id) FILTER (WHERE rcs2.status = 'ACCEPTED')::NUMERIC / NULLIF(COUNT(rcs2.id), 0)) * 100)
      END::NUMERIC AS response_score
    FROM public.users u
    LEFT JOIN public.room_card_sends rcs ON rcs.sender_id = u.id
    LEFT JOIN public.room_card_sends rcs2 ON rcs2.receiver_id = u.id
    GROUP BY u.id, u.name
  ),
  scored AS (
    SELECT
      id,
      user_name,
      engagement_score,
      risk_score,
      initiation_score,
      response_score,
      ROUND((engagement_score * 0.35) + (initiation_score * 0.25) + (response_score * 0.25) + ((100 - risk_score) * 0.15), 2) AS overall_score
    FROM base
  )
  SELECT
    s.id AS user_id,
    s.user_name,
    ROUND(s.engagement_score, 2),
    ROUND(s.risk_score, 2),
    ROUND(s.initiation_score, 2),
    ROUND(s.response_score, 2),
    ROUND(s.overall_score, 2),
    CASE
      WHEN s.overall_score >= 75 THEN 'CHAMPION'
      WHEN s.overall_score >= 50 THEN 'ACTIVE'
      WHEN s.overall_score >= 25 THEN 'AT_RISK'
      ELSE 'CHURNED'
    END::TEXT AS score_label
  FROM scored s
  ORDER BY s.overall_score DESC;
END;
$$;

-- ==========================================
-- 2. Smart Deck Recommendations RPC
-- Finds which card categories each user has NOT engaged with, suggesting fresh content
-- ==========================================
CREATE OR REPLACE FUNCTION get_smart_deck_recommendations()
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  recommended_category TEXT,
  reason TEXT,
  cards_in_category BIGINT,
  cards_played_in_category BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.name::TEXT AS user_name,
    cat.name::TEXT AS recommended_category,
    CASE
      WHEN COUNT(rcs.id) = 0 THEN 'Never tried this category'
      WHEN COUNT(rcs.id) < 3 THEN 'Low engagement - explore more!'
      ELSE 'Could benefit from refreshed content'
    END::TEXT AS reason,
    COUNT(DISTINCT c.id) AS cards_in_category,
    COUNT(rcs.id) AS cards_played_in_category
  FROM public.users u
  CROSS JOIN public.categories cat
  LEFT JOIN public.cards c ON c.category_id = cat.id
  LEFT JOIN public.room_card_sends rcs ON rcs.card_id = c.id AND rcs.sender_id = u.id
  GROUP BY u.id, u.name, cat.id, cat.name
  HAVING COUNT(rcs.id) < 5
  ORDER BY u.id, COUNT(rcs.id) ASC;
END;
$$;

-- ==========================================
-- 3. Risk Detection RPC
-- Identifies at-risk users: one-sided play, disengaged, abandoned rooms
-- ==========================================
CREATE OR REPLACE FUNCTION get_risk_detection()
RETURNS TABLE (
  risk_category TEXT,
  user_id UUID,
  user_name TEXT,
  partner_name TEXT,
  detail TEXT,
  risk_severity TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  -- Risk 1: One-sided gameplay (one partner sends >90% of cards)
  SELECT
    'ONE_SIDED_GAMEPLAY'::TEXT AS risk_category,
    r.host_id AS user_id,
    h.name::TEXT AS user_name,
    p.name::TEXT AS partner_name,
    CONCAT('Host sent ', host_sends.cnt, ' cards. Partner sent ', partner_sends.cnt, ' cards.')::TEXT AS detail,
    'HIGH'::TEXT AS risk_severity
  FROM public.rooms r
  JOIN public.users h ON h.id = r.host_id
  LEFT JOIN public.users p ON p.id = r.partner_id
  CROSS JOIN LATERAL (
    SELECT COUNT(*) AS cnt FROM public.room_card_sends WHERE sender_id = r.host_id AND room_id = r.id
  ) host_sends
  CROSS JOIN LATERAL (
    SELECT COUNT(*) AS cnt FROM public.room_card_sends WHERE sender_id = r.partner_id AND room_id = r.id
  ) partner_sends
  WHERE r.status = 'ACTIVE'
    AND GREATEST(host_sends.cnt, partner_sends.cnt) > 0
    AND (host_sends.cnt::NUMERIC / NULLIF(host_sends.cnt + partner_sends.cnt, 0)) > 0.9

  UNION ALL

  -- Risk 2: Disengaged users (no activity for 14+ days in ACTIVE room)
  SELECT
    'DISENGAGED_USER'::TEXT,
    r.host_id,
    h.name::TEXT,
    p.name::TEXT,
    CONCAT('Last activity: ', TO_CHAR(MAX(rcs.created_at), 'YYYY-MM-DD'), '. Room is still ACTIVE.')::TEXT,
    CASE
      WHEN MAX(rcs.created_at) < NOW() - INTERVAL '30 days' THEN 'CRITICAL'
      ELSE 'MEDIUM'
    END::TEXT
  FROM public.rooms r
  JOIN public.users h ON h.id = r.host_id
  LEFT JOIN public.users p ON p.id = r.partner_id
  LEFT JOIN public.room_card_sends rcs ON rcs.room_id = r.id
  WHERE r.status = 'ACTIVE'
  GROUP BY r.id, r.host_id, h.name, p.name
  HAVING MAX(rcs.created_at) < NOW() - INTERVAL '14 days' OR MAX(rcs.created_at) IS NULL

  ORDER BY risk_severity DESC;
END;
$$;

-- ==========================================
-- 4. Business KPI Dashboard RPC
-- ==========================================
CREATE OR REPLACE FUNCTION get_business_kpis()
RETURNS TABLE (
  kpi_name TEXT,
  kpi_value TEXT,
  kpi_trend TEXT,
  kpi_category TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  total_users BIGINT;
  active_rooms BIGINT;
  total_cards_sent BIGINT;
  avg_acceptance NUMERIC;
  new_users_7d BIGINT;
  new_users_30d BIGINT;
BEGIN
  SELECT COUNT(*) INTO total_users FROM public.users;
  SELECT COUNT(*) INTO active_rooms FROM public.rooms WHERE status = 'ACTIVE';
  SELECT COUNT(*) INTO total_cards_sent FROM public.room_card_sends;
  SELECT ROUND(AVG(CASE WHEN status = 'ACCEPTED' THEN 100.0 ELSE 0 END), 2) INTO avg_acceptance FROM public.room_card_sends;
  SELECT COUNT(*) INTO new_users_7d FROM public.users WHERE created_at >= NOW() - INTERVAL '7 days';
  SELECT COUNT(*) INTO new_users_30d FROM public.users WHERE created_at >= NOW() - INTERVAL '30 days';

  RETURN QUERY
  SELECT 'Total Registered Users'::TEXT, total_users::TEXT, 'N/A'::TEXT, 'Growth'::TEXT
  UNION ALL
  SELECT 'Active Game Rooms'::TEXT, active_rooms::TEXT, 'N/A'::TEXT, 'Engagement'::TEXT
  UNION ALL
  SELECT 'Total Cards Played'::TEXT, total_cards_sent::TEXT, 'N/A'::TEXT, 'Engagement'::TEXT
  UNION ALL
  SELECT 'Avg Card Acceptance Rate'::TEXT, CONCAT(avg_acceptance, '%')::TEXT, 'N/A'::TEXT, 'Quality'::TEXT
  UNION ALL
  SELECT 'New Users (Last 7 Days)'::TEXT, new_users_7d::TEXT, 
    CASE WHEN new_users_7d > 10 THEN 'UP' ELSE 'FLAT' END::TEXT, 'Growth'::TEXT
  UNION ALL
  SELECT 'New Users (Last 30 Days)'::TEXT, new_users_30d::TEXT,
    CASE WHEN new_users_30d > 50 THEN 'UP' ELSE 'FLAT' END::TEXT, 'Growth'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION compute_behavioral_scores() TO authenticated;
GRANT EXECUTE ON FUNCTION get_smart_deck_recommendations() TO authenticated;
GRANT EXECUTE ON FUNCTION get_risk_detection() TO authenticated;
GRANT EXECUTE ON FUNCTION get_business_kpis() TO authenticated;
