-- ═══════════════════════════════════════════════════════════════
-- Relationship Dynamics Analytics RPC
-- Analyzes game behaviors between couples in each room
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_relationship_dynamics()
RETURNS TABLE (
    room_id UUID,
    host_name TEXT,
    partner_name TEXT,
    host_id UUID,
    partner_id UUID,
    room_status TEXT,
    host_sends BIGINT,
    partner_sends BIGINT,
    host_avg_response_minutes NUMERIC,
    partner_avg_response_minutes NUMERIC,
    total_accepted BIGINT,
    total_completed BIGINT,
    completion_ratio NUMERIC,
    total_penalties BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id AS room_id,
        u1.name::TEXT AS host_name,
        COALESCE(u2.name, 'Waiting for partner')::TEXT AS partner_name,
        r.host_id,
        r.partner_id,
        r.status::TEXT AS room_status,
        
        -- Host sends
        COUNT(rcs.id) FILTER (WHERE rcs.sender_id = r.host_id) AS host_sends,
        -- Partner sends
        COUNT(rcs.id) FILTER (WHERE rcs.sender_id = r.partner_id) AS partner_sends,
        
        -- Host avg response time (when host is the receiver)
        ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (rcs.accepted_at - rcs.sent_at)) / 60) FILTER (WHERE rcs.receiver_id = r.host_id), 0)::NUMERIC, 1) AS host_avg_response_minutes,
        
        -- Partner avg response time (when partner is the receiver)
        ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (rcs.accepted_at - rcs.sent_at)) / 60) FILTER (WHERE rcs.receiver_id = r.partner_id), 0)::NUMERIC, 1) AS partner_avg_response_minutes,
        
        -- Completion ratios
        COUNT(rcs.id) FILTER (WHERE rcs.status IN ('IN_PROGRESS', 'COMPLETED_BY_RECEIVER', 'COMPLETED')) AS total_accepted,
        COUNT(rcs.id) FILTER (WHERE rcs.status = 'COMPLETED') AS total_completed,
        
        CASE WHEN COUNT(rcs.id) FILTER (WHERE rcs.status IN ('IN_PROGRESS', 'COMPLETED_BY_RECEIVER', 'COMPLETED')) > 0 THEN
            ROUND((COUNT(rcs.id) FILTER (WHERE rcs.status = 'COMPLETED')::NUMERIC / 
            COUNT(rcs.id) FILTER (WHERE rcs.status IN ('IN_PROGRESS', 'COMPLETED_BY_RECEIVER', 'COMPLETED'))) * 100, 2)
        ELSE 0::NUMERIC END AS completion_ratio,
        
        -- Penalty frequency
        COUNT(rcs.id) FILTER (WHERE rcs.status = 'PENALTY') AS total_penalties

    FROM public.rooms r
    JOIN public.users u1 ON r.host_id = u1.id
    LEFT JOIN public.users u2 ON r.partner_id = u2.id
    LEFT JOIN public.room_card_sends rcs ON r.id = rcs.room_id
    GROUP BY r.id, u1.name, u2.name, r.host_id, r.partner_id, r.status
    ORDER BY r.created_at DESC;
END;
$$;

-- Allow authenticated admins to execute this
GRANT EXECUTE ON FUNCTION get_relationship_dynamics() TO authenticated;
