-- ═══════════════════════════════════════════════════════════════
-- Card Performance Analytics RPC
-- Aggregates metrics for every card to be used in the Admin UI
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_card_performance_analytics()
RETURNS TABLE (
    card_id UUID,
    title TEXT,
    category_name TEXT,
    times_played BIGINT,
    acceptance_rate NUMERIC,
    deflect_rate NUMERIC,
    penalty_rate NUMERIC,
    completion_rate NUMERIC,
    avg_response_time_minutes NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id AS card_id,
        c.name::TEXT AS title,
        cat.name::TEXT AS category_name,
        COUNT(rcs.id) AS times_played,
        -- Acceptance rate: (accepted / total plays) * 100
        CASE WHEN COUNT(rcs.id) > 0 THEN 
            ROUND((SUM(CASE WHEN rcs.status IN ('IN_PROGRESS', 'COMPLETED_BY_RECEIVER', 'COMPLETED') THEN 1 ELSE 0 END)::NUMERIC / COUNT(rcs.id)) * 100, 2)
        ELSE 0::NUMERIC END AS acceptance_rate,
        
        -- Deflect rate: (deflected / total plays) * 100
        CASE WHEN COUNT(rcs.id) > 0 THEN 
            ROUND((SUM(CASE WHEN rcs.status = 'DEFLECTED' THEN 1 ELSE 0 END)::NUMERIC / COUNT(rcs.id)) * 100, 2)
        ELSE 0::NUMERIC END AS deflect_rate,
        
        -- Penalty rate: (penalized / total plays) * 100
        CASE WHEN COUNT(rcs.id) > 0 THEN 
            ROUND((SUM(CASE WHEN rcs.status = 'PENALTY' THEN 1 ELSE 0 END)::NUMERIC / COUNT(rcs.id)) * 100, 2)
        ELSE 0::NUMERIC END AS penalty_rate,
        
        -- Completion rate: (completed / total accepted) * 100
        CASE WHEN SUM(CASE WHEN rcs.status IN ('IN_PROGRESS', 'COMPLETED_BY_RECEIVER', 'COMPLETED') THEN 1 ELSE 0 END) > 0 THEN 
            ROUND((SUM(CASE WHEN rcs.status = 'COMPLETED' THEN 1 ELSE 0 END)::NUMERIC / 
            SUM(CASE WHEN rcs.status IN ('IN_PROGRESS', 'COMPLETED_BY_RECEIVER', 'COMPLETED') THEN 1 ELSE 0 END)) * 100, 2)
        ELSE 0::NUMERIC END AS completion_rate,
        
        -- Avg response time in minutes
        ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (rcs.accepted_at - rcs.sent_at)) / 60), 0)::NUMERIC, 1) AS avg_response_time_minutes

    FROM public.cards c
    LEFT JOIN public.card_categories cat ON c.category_id = cat.id
    LEFT JOIN public.room_card_sends rcs ON c.id = rcs.card_id
    GROUP BY c.id, c.name, cat.name
    ORDER BY times_played DESC;
END;
$$;

-- Allow authenticated admins to execute this
GRANT EXECUTE ON FUNCTION get_card_performance_analytics() TO authenticated;
