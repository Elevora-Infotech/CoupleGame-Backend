-- ==========================================
-- Growth Analytics RPCs (Funnel, Retention, Drop-off)
-- ==========================================

-- 1. Funnel Tracking
CREATE OR REPLACE FUNCTION get_funnel_analytics()
RETURNS TABLE (
    step_name TEXT,
    user_count BIGINT,
    conversion_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_accounts BIGINT;
    total_game_starts BIGINT;
    total_first_cards BIGINT;
BEGIN
    -- 1. Account Created
    SELECT COUNT(*) INTO total_accounts FROM public.users;
    
    -- 2. Game Started (Joined a room)
    SELECT COUNT(DISTINCT user_id) INTO total_game_starts FROM (
        SELECT host_id AS user_id FROM public.rooms
        UNION
        SELECT partner_id AS user_id FROM public.rooms WHERE partner_id IS NOT NULL
    ) AS players;

    -- 3. First Card Sent
    SELECT COUNT(DISTINCT sender_id) INTO total_first_cards FROM public.room_card_sends;

    RETURN QUERY
    SELECT 
        '1. Account Created'::TEXT, 
        total_accounts, 
        100.0::NUMERIC
    UNION ALL
    SELECT 
        '2. Game Started'::TEXT, 
        total_game_starts, 
        CASE WHEN total_accounts > 0 THEN ROUND((total_game_starts::NUMERIC / total_accounts) * 100, 2) ELSE 0 END
    UNION ALL
    SELECT 
        '3. First Card Sent'::TEXT, 
        total_first_cards, 
        CASE WHEN total_game_starts > 0 THEN ROUND((total_first_cards::NUMERIC / total_game_starts) * 100, 2) ELSE 0 END;
END;
$$;

-- 2. Retention Tracking (Day 1, 3, 7, 30)
CREATE OR REPLACE FUNCTION get_retention_analytics()
RETURNS TABLE (
    cohort TEXT,
    total_users BIGINT,
    d1_retained BIGINT,
    d3_retained BIGINT,
    d7_retained BIGINT,
    d30_retained BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH user_retention AS (
        SELECT 
            TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS cohort_month,
            id,
            created_at,
            updated_at,
            EXTRACT(DAY FROM (updated_at - created_at)) AS days_active
        FROM public.users
    )
    SELECT 
        cohort_month::TEXT,
        COUNT(id) AS total_users,
        COUNT(id) FILTER (WHERE days_active >= 1) AS d1_retained,
        COUNT(id) FILTER (WHERE days_active >= 3) AS d3_retained,
        COUNT(id) FILTER (WHERE days_active >= 7) AS d7_retained,
        COUNT(id) FILTER (WHERE days_active >= 30) AS d30_retained
    FROM user_retention
    GROUP BY cohort_month
    ORDER BY cohort_month DESC;
END;
$$;

-- 3. Drop-Off Analysis
CREATE OR REPLACE FUNCTION get_dropoff_analysis()
RETURNS TABLE (
    dropoff_stage TEXT,
    users_dropped BIGINT,
    dropoff_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_accounts BIGINT;
    total_game_starts BIGINT;
    total_first_cards BIGINT;
BEGIN
    SELECT COUNT(*) INTO total_accounts FROM public.users;
    
    SELECT COUNT(DISTINCT user_id) INTO total_game_starts FROM (
        SELECT host_id AS user_id FROM public.rooms UNION SELECT partner_id FROM public.rooms WHERE partner_id IS NOT NULL
    ) AS players;

    SELECT COUNT(DISTINCT sender_id) INTO total_first_cards FROM public.room_card_sends;

    RETURN QUERY
    SELECT 
        'Signed Up -> Never Started Game'::TEXT, 
        (total_accounts - total_game_starts),
        CASE WHEN total_accounts > 0 THEN ROUND(((total_accounts - total_game_starts)::NUMERIC / total_accounts) * 100, 2) ELSE 0 END
    UNION ALL
    SELECT 
        'Started Game -> Never Sent Card'::TEXT, 
        (total_game_starts - total_first_cards),
        CASE WHEN total_game_starts > 0 THEN ROUND(((total_game_starts - total_first_cards)::NUMERIC / total_game_starts) * 100, 2) ELSE 0 END;
END;
$$;

GRANT EXECUTE ON FUNCTION get_funnel_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION get_retention_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION get_dropoff_analysis() TO authenticated;
