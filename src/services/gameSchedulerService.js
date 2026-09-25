/**
 * scheduledNotificationService.js
 * Cron-based scheduled notification jobs.
 * These run on a timer to send: reminders, deadline warnings, streak alerts, recaps, etc.
 * 
 * Usage: Call startScheduledJobs() once when the server starts (in server.js).
 */

const { supabase } = require('../db/supabase');
const { createNotification } = require('./notificationService');

// ─── Helper: ms in common units ──────────────────────────────────────────────
const HOUR = 60 * 60 * 1000;
const DAY  = 24 * HOUR;

// ─────────────────────────────────────────────────────────────────────────────
// 1. CARD_REMINDER — remind users about cards accepted but not completed (24h)
// 2. CARD_DEADLINE_WARN — warn users 6h before card deadline
// ─────────────────────────────────────────────────────────────────────────────
const checkCardReminders = async () => {
    try {
        const now = new Date();

        // Cards IN_PROGRESS for more than 24 hours — send reminder to receiver
        const reminderThreshold = new Date(now - 24 * HOUR).toISOString();
        const { data: overdueCards } = await supabase
            .from('room_card_sends')
            .select('id, receiver_id, sender_id, room_id, accepted_at, cards(name), last_reminded_at')
            .eq('status', 'IN_PROGRESS')
            .lt('accepted_at', reminderThreshold);

        for (const card of (overdueCards || [])) {
            // Don't spam: only remind once per 24h
            if (card.last_reminded_at && (now - new Date(card.last_reminded_at)) < 24 * HOUR) continue;

            await createNotification(
                card.receiver_id,
                'CARD_REMINDER',
                '⏰ Don\'t Forget Your Dare!',
                `You still need to complete "${card.cards?.name || 'a dare card'}". Your partner is waiting!`,
                { send_id: card.id, room_id: card.room_id }
            );

            // Update last_reminded_at to avoid spamming
            await supabase.from('room_card_sends').update({ last_reminded_at: now.toISOString() }).eq('id', card.id);
        }

        // Cards with deadline within 6 hours — warn receiver
        const deadlineWarnStart = new Date(now).toISOString();
        const deadlineWarnEnd   = new Date(now + 6 * HOUR).toISOString();
        const { data: deadlineCards } = await supabase
            .from('room_card_sends')
            .select('id, receiver_id, room_id, penalty_deadline, cards(name)')
            .eq('status', 'IN_PROGRESS')
            .not('penalty_deadline', 'is', null)
            .gte('penalty_deadline', deadlineWarnStart)
            .lte('penalty_deadline', deadlineWarnEnd);

        for (const card of (deadlineCards || [])) {
            await createNotification(
                card.receiver_id,
                'CARD_DEADLINE_WARN',
                '⚠️ Dare Deadline Soon!',
                `"${card.cards?.name || 'Your dare card'}" deadline is in less than 6 hours. Complete it now!`,
                { send_id: card.id, room_id: card.room_id }
            );
        }

        // Expired IN_PROGRESS cards — notify both
        const { data: expiredCards } = await supabase
            .from('room_card_sends')
            .select('id, sender_id, receiver_id, room_id, penalty_deadline, cards(name)')
            .eq('status', 'IN_PROGRESS')
            .not('penalty_deadline', 'is', null)
            .lt('penalty_deadline', now.toISOString());

        for (const card of (expiredCards || [])) {
            // Mark as EXPIRED_FAILED
            await supabase.from('room_card_sends').update({ status: 'EXPIRED_FAILED' }).eq('id', card.id);

            await createNotification(
                card.sender_id,
                'DARE_EXPIRED_FAILED',
                '💀 Dare Expired!',
                `"${card.cards?.name || 'Your dare card'}" expired without completion. Your partner failed the dare.`,
                { send_id: card.id, room_id: card.room_id }
            );
            await createNotification(
                card.receiver_id,
                'DARE_EXPIRED_FAILED',
                '💀 Dare Expired!',
                `"${card.cards?.name || 'A dare card'}" expired because you didn't complete it in time.`,
                { send_id: card.id, room_id: card.room_id }
            );
        }
    } catch (err) {
        console.error('[Scheduler] checkCardReminders error:', err.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. ROOM_EXPIRING_SOON — warn users 24h before room expires
// 4. ROOM_EXPIRED — notify when room has expired
// ─────────────────────────────────────────────────────────────────────────────
const checkRoomExpiry = async () => {
    try {
        const now = new Date();

        // Rooms expiring within 24 hours
        const soonStart = now.toISOString();
        const soonEnd   = new Date(now + 24 * HOUR).toISOString();

        const { data: soonRooms } = await supabase
            .from('rooms')
            .select('id, host_id, partner_id, expires_at, expiry_warned_at')
            .eq('status', 'ACTIVE')
            .gte('expires_at', soonStart)
            .lte('expires_at', soonEnd);

        for (const room of (soonRooms || [])) {
            if (room.expiry_warned_at) continue; // already warned

            const notifyIds = [room.host_id, room.partner_id].filter(Boolean);
            for (const userId of notifyIds) {
                await createNotification(
                    userId,
                    'ROOM_EXPIRING_SOON',
                    '⏳ Room Expiring Soon!',
                    'Your game room expires in less than 24 hours. Make the most of it!',
                    { room_id: room.id }
                );
            }
            await supabase.from('rooms').update({ expiry_warned_at: now.toISOString() }).eq('id', room.id);
        }

        // Rooms that just expired (status=ACTIVE but expires_at in past)
        const { data: expiredRooms } = await supabase
            .from('rooms')
            .select('id, host_id, partner_id')
            .eq('status', 'ACTIVE')
            .lt('expires_at', now.toISOString());

        for (const room of (expiredRooms || [])) {
            await supabase.from('rooms').update({ status: 'EXPIRED' }).eq('id', room.id);

            const notifyIds = [room.host_id, room.partner_id].filter(Boolean);
            for (const userId of notifyIds) {
                await createNotification(
                    userId,
                    'ROOM_EXPIRED',
                    '⌛ Room Expired',
                    'Your game room has expired. Start a new room to continue playing!',
                    { room_id: room.id }
                );
            }
        }
    } catch (err) {
        console.error('[Scheduler] checkRoomExpiry error:', err.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. PARTNER_INACTIVE — notify when partner has been inactive for 48h
// ─────────────────────────────────────────────────────────────────────────────
const checkPartnerInactivity = async () => {
    try {
        const threshold = new Date(Date.now() - 48 * HOUR).toISOString();

        // Find active rooms where one user hasn't done anything in 48h
        const { data: rooms } = await supabase
            .from('rooms')
            .select('id, host_id, partner_id')
            .eq('status', 'ACTIVE');

        for (const room of (rooms || [])) {
            if (!room.partner_id) continue;

            // Check last card send activity
            const { data: lastActivity } = await supabase
                .from('room_card_sends')
                .select('sent_at')
                .or(`sender_id.eq.${room.partner_id},receiver_id.eq.${room.partner_id}`)
                .eq('room_id', room.id)
                .order('sent_at', { ascending: false })
                .limit(1);

            const lastActive = lastActivity?.[0]?.sent_at;
            if (lastActive && lastActive > threshold) continue; // still active

            // Notify host about inactive partner
            await createNotification(
                room.host_id,
                'PARTNER_INACTIVE',
                '😴 Partner Inactive',
                'Your partner hasn\'t been active in 48 hours. Send them a nudge!',
                { room_id: room.id }
            );
        }
    } catch (err) {
        console.error('[Scheduler] checkPartnerInactivity error:', err.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. DAILY_STREAK_MILESTONE / STREAK_AT_RISK / STREAK_LOST
// ─────────────────────────────────────────────────────────────────────────────
const checkStreaks = async () => {
    try {
        const now = new Date();
        const yesterday = new Date(now - DAY).toISOString();
        const twoDaysAgo = new Date(now - 2 * DAY).toISOString();

        // Get all active users in active rooms
        const { data: activeRooms } = await supabase
            .from('rooms')
            .select('id, host_id, partner_id')
            .eq('status', 'ACTIVE');

        for (const room of (activeRooms || [])) {
            const userIds = [room.host_id, room.partner_id].filter(Boolean);

            for (const userId of userIds) {
                // Count cards completed today
                const { count: todayCount } = await supabase
                    .from('room_card_sends')
                    .select('*', { count: 'exact', head: true })
                    .eq('room_id', room.id)
                    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
                    .eq('status', 'CONFIRMED')
                    .gte('completed_at', yesterday);

                // Count cards completed yesterday
                const { count: yesterdayCount } = await supabase
                    .from('room_card_sends')
                    .select('*', { count: 'exact', head: true })
                    .eq('room_id', room.id)
                    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
                    .eq('status', 'CONFIRMED')
                    .gte('completed_at', twoDaysAgo)
                    .lt('completed_at', yesterday);

                // Streak milestone: completed at least 1 dare today and yesterday
                if (todayCount >= 1 && yesterdayCount >= 1) {
                    // Get current streak from profile
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('streak_days')
                        .eq('id', userId)
                        .single();

                    const streakDays = (profile?.streak_days || 0) + 1;
                    await supabase.from('profiles').update({ streak_days: streakDays }).eq('id', userId);

                    if (streakDays % 7 === 0) { // milestone every 7 days
                        await createNotification(userId, 'DAILY_STREAK_MILESTONE',
                            `🔥 ${streakDays} Day Streak!`,
                            `Amazing! You've maintained a ${streakDays}-day dare streak. Keep it up!`,
                            { room_id: room.id, streak_days: streakDays }
                        );
                    }
                }

                // Streak at risk: yesterday had activity but today none yet
                if (yesterdayCount >= 1 && todayCount === 0) {
                    await createNotification(userId, 'STREAK_AT_RISK',
                        '⚡ Streak at Risk!',
                        'You haven\'t completed a dare today. Your streak is about to break!',
                        { room_id: room.id }
                    );
                }

                // Streak lost: 2 days ago had activity, yesterday none, today none
                const { count: twoDaysCount } = await supabase
                    .from('room_card_sends')
                    .select('*', { count: 'exact', head: true })
                    .eq('room_id', room.id)
                    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
                    .eq('status', 'CONFIRMED')
                    .lt('completed_at', twoDaysAgo);

                if (twoDaysCount >= 1 && yesterdayCount === 0 && todayCount === 0) {
                    const { data: profile } = await supabase.from('profiles').select('streak_days').eq('id', userId).single();
                    const lostStreak = profile?.streak_days || 0;
                    if (lostStreak > 0) {
                        await supabase.from('profiles').update({ streak_days: 0 }).eq('id', userId);
                        await createNotification(userId, 'STREAK_LOST',
                            '💔 Streak Lost',
                            `Your ${lostStreak}-day dare streak has ended. Start a new one today!`,
                            { room_id: room.id, lost_streak: lostStreak }
                        );
                    }
                }
            }
        }
    } catch (err) {
        console.error('[Scheduler] checkStreaks error:', err.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. WEEKLY_RECAP — every Sunday
// ─────────────────────────────────────────────────────────────────────────────
const sendWeeklyRecap = async () => {
    try {
        const dayOfWeek = new Date().getDay(); // 0 = Sunday
        if (dayOfWeek !== 0) return;

        const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();

        const { data: activeRooms } = await supabase
            .from('rooms')
            .select('id, host_id, partner_id')
            .eq('status', 'ACTIVE');

        for (const room of (activeRooms || [])) {
            const userIds = [room.host_id, room.partner_id].filter(Boolean);

            const { count: weeklyCompleted } = await supabase
                .from('room_card_sends')
                .select('*', { count: 'exact', head: true })
                .eq('room_id', room.id)
                .eq('status', 'CONFIRMED')
                .gte('completed_at', weekAgo);

            for (const userId of userIds) {
                await createNotification(userId, 'WEEKLY_RECAP',
                    '📊 Your Weekly Recap',
                    `This week you and your partner completed ${weeklyCompleted || 0} dares together. Keep it going!`,
                    { room_id: room.id, weekly_completed: weeklyCompleted || 0 }
                );
            }
        }
    } catch (err) {
        console.error('[Scheduler] sendWeeklyRecap error:', err.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. RELATIONSHIP_MILESTONE — every 30 days of active room
// ─────────────────────────────────────────────────────────────────────────────
const checkRelationshipMilestones = async () => {
    try {
        const { data: activeRooms } = await supabase
            .from('rooms')
            .select('id, host_id, partner_id, created_at, milestone_notified_days')
            .eq('status', 'ACTIVE');

        for (const room of (activeRooms || [])) {
            if (!room.partner_id) continue;
            const daysActive = Math.floor((Date.now() - new Date(room.created_at)) / DAY);
            const milestones = [30, 60, 90, 180, 365];

            for (const milestone of milestones) {
                if (daysActive >= milestone && !(room.milestone_notified_days || []).includes(milestone)) {
                    const notifyIds = [room.host_id, room.partner_id];
                    for (const userId of notifyIds) {
                        await createNotification(userId, 'RELATIONSHIP_MILESTONE',
                            `🎉 ${milestone}-Day Milestone!`,
                            `You and your partner have been playing for ${milestone} days! Congratulations!`,
                            { room_id: room.id, milestone_days: milestone }
                        );
                    }
                    const updatedDays = [...(room.milestone_notified_days || []), milestone];
                    await supabase.from('rooms').update({ milestone_notified_days: updatedDays }).eq('id', room.id);
                }
            }
        }
    } catch (err) {
        console.error('[Scheduler] checkRelationshipMilestones error:', err.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. COMPLETION_RATE_MILESTONE & LEVEL_UP
// ─────────────────────────────────────────────────────────────────────────────
const checkCompletionMilestones = async () => {
    try {
        const { data: activeRooms } = await supabase
            .from('rooms')
            .select('id, host_id, partner_id')
            .eq('status', 'ACTIVE');

        for (const room of (activeRooms || [])) {
            const userIds = [room.host_id, room.partner_id].filter(Boolean);

            for (const userId of userIds) {
                const { count: total } = await supabase
                    .from('room_card_sends')
                    .select('*', { count: 'exact', head: true })
                    .eq('room_id', room.id)
                    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

                const { count: completed } = await supabase
                    .from('room_card_sends')
                    .select('*', { count: 'exact', head: true })
                    .eq('room_id', room.id)
                    .eq('status', 'CONFIRMED')
                    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

                if (!total || total === 0) continue;
                const rate = Math.floor((completed / total) * 100);

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('completion_milestone_notified, level')
                    .eq('id', userId)
                    .single();

                // Completion rate milestones: 25%, 50%, 75%, 100%
                const rMilestones = [25, 50, 75, 100];
                for (const m of rMilestones) {
                    if (rate >= m && !(profile?.completion_milestone_notified || []).includes(m)) {
                        await createNotification(userId, 'COMPLETION_RATE_MILESTONE',
                            `⭐ ${m}% Completion Rate!`,
                            `You've completed ${m}% of all dares in your room. Outstanding!`,
                            { room_id: room.id, rate: m }
                        );
                        const updated = [...(profile?.completion_milestone_notified || []), m];
                        await supabase.from('profiles').update({ completion_milestone_notified: updated }).eq('id', userId);
                    }
                }

                // Level up: every 10 completed dares
                const currentLevel = profile?.level || 1;
                const newLevel = Math.floor(completed / 10) + 1;
                if (newLevel > currentLevel) {
                    await supabase.from('profiles').update({ level: newLevel }).eq('id', userId);
                    await createNotification(userId, 'LEVEL_UP',
                        `🚀 Level Up! You're now Level ${newLevel}`,
                        `You've completed ${completed} dares! Keep going to unlock more rewards.`,
                        { room_id: room.id, level: newLevel }
                    );
                }
            }
        }
    } catch (err) {
        console.error('[Scheduler] checkCompletionMilestones error:', err.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Start all scheduled jobs
// ─────────────────────────────────────────────────────────────────────────────
const startScheduledJobs = () => {
    console.log('[Scheduler] Starting notification scheduler jobs...');

    // Every 1 hour: card reminders, deadline warnings, expired dares, room expiry, inactivity
    setInterval(checkCardReminders, HOUR);
    setInterval(checkRoomExpiry, HOUR);
    setInterval(checkPartnerInactivity, HOUR);

    // Every 6 hours: streaks, completion milestones, level up
    setInterval(checkStreaks, 6 * HOUR);
    setInterval(checkCompletionMilestones, 6 * HOUR);

    // Every 24 hours: weekly recap (internally checks if Sunday), relationship milestones
    setInterval(sendWeeklyRecap, DAY);
    setInterval(checkRelationshipMilestones, DAY);

    // Run immediately on start
    checkCardReminders();
    checkRoomExpiry();
    checkStreaks();
    checkCompletionMilestones();
    checkRelationshipMilestones();

    console.log('[Scheduler] All notification jobs started.');
};

module.exports = { startScheduledJobs };
