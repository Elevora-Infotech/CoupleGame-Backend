'use strict';
/**
 * @file   adminNotificationService.js
 * @desc   Admin-side notification management.
 *
 * Features:
 *  A. getNotificationTemplates  — list all auto notification types with enable/disable
 *  B. updateTemplate            — edit title/body text of a notification type
 *  C. toggleTemplate            — enable / disable a notification type system-wide
 *  D. sendManualNotification    — admin pushes a custom notification to one or ALL users
 *  E. getScheduledNotifications — list pending scheduled notifications
 *  F. scheduleNotification      — schedule a notification for a future time
 *  G. cancelScheduledNotification — cancel a pending scheduled notification
 *  H. getAdminNotificationStats — counts for the admin dashboard
 *  I. runScheduledNotifications — called internally; sends due scheduled notifications
 */

const { supabase } = require('../db/supabase');
const { createNotification } = require('./notificationService');

// ─────────────────────────────────────────────────────────────
// A. Get Notification Templates (all 10 types + their config)
// ─────────────────────────────────────────────────────────────
const getNotificationTemplates = async () => {
  const { data, error } = await supabase
    .from('notification_templates')
    .select('*')
    .order('type');

  if (error) throw error;
  return data;
};

// ─────────────────────────────────────────────────────────────
// B. Update Template text (title / body)
// ─────────────────────────────────────────────────────────────
const updateTemplate = async (id, { title, body }) => {
  const updates = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (body  !== undefined) updates.body  = body.trim();

  if (!updates.title && !updates.body) {
    const e = new Error('Provide at least title or body to update.'); e.status = 400; throw e;
  }

  const { data, error } = await supabase
    .from('notification_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) { const e = new Error('Template not found.'); e.status = 404; throw e; }
  return data;
};

// ─────────────────────────────────────────────────────────────
// C. Toggle a notification type on/off
// ─────────────────────────────────────────────────────────────
const toggleTemplate = async (id, is_enabled) => {
  const { data, error } = await supabase
    .from('notification_templates')
    .update({ is_enabled, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) { const e = new Error('Template not found.'); e.status = 404; throw e; }
  return data;
};

// ─────────────────────────────────────────────────────────────
// D. Send a Manual Notification
// target: 'all' | specific userId
// ─────────────────────────────────────────────────────────────
const sendManualNotification = async (adminId, { title, body, target_user_id, data = {} }) => {
  if (!title?.trim() || !body?.trim()) {
    const e = new Error('title and body are required.'); e.status = 400; throw e;
  }

  // If target_user_id is provided, send to that one user
  if (target_user_id) {
    await createNotification(target_user_id, 'ADMIN_BROADCAST', title.trim(), body.trim(), data);

    // Log the manual send
    await supabase.from('admin_notification_logs').insert([{
      admin_id: adminId, type: 'MANUAL_SINGLE', title, body,
      target_user_id, sent_count: 1,
    }]);

    return { sent_count: 1, target: 'single_user' };
  }

  // Otherwise, broadcast to ALL active users (chunked to avoid timeout)
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id');

  if (usersErr) throw usersErr;
  if (!users?.length) return { sent_count: 0, target: 'all' };

  // Send in batches of 50
  let sentCount = 0;
  const batchSize = 50;
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(u => createNotification(u.id, 'ADMIN_BROADCAST', title.trim(), body.trim(), data))
    );
    sentCount += batch.length;
  }

  // Log the broadcast
  await supabase.from('admin_notification_logs').insert([{
    admin_id: adminId, type: 'MANUAL_BROADCAST', title, body,
    target_user_id: null, sent_count: sentCount,
  }]);

  return { sent_count: sentCount, target: 'all' };
};

// ─────────────────────────────────────────────────────────────
// E. Get Scheduled Notifications
// ─────────────────────────────────────────────────────────────
const getScheduledNotifications = async () => {
  const { data, error } = await supabase
    .from('scheduled_notifications')
    .select(`
      id, title, body, data, target_type, target_user_id,
      scheduled_for, status, created_at,
      admins ( name, email )
    `)
    .order('scheduled_for', { ascending: true });

  if (error) throw error;
  return data;
};

// ─────────────────────────────────────────────────────────────
// F. Schedule a Notification for future delivery
// ─────────────────────────────────────────────────────────────
const scheduleNotification = async (adminId, { title, body, target_type, target_user_id, scheduled_for, data = {} }) => {
  if (!title?.trim() || !body?.trim()) {
    const e = new Error('title and body are required.'); e.status = 400; throw e;
  }
  if (!scheduled_for) {
    const e = new Error('scheduled_for datetime is required.'); e.status = 400; throw e;
  }
  if (new Date(scheduled_for) <= new Date()) {
    const e = new Error('scheduled_for must be in the future.'); e.status = 400; throw e;
  }
  if (target_type === 'single' && !target_user_id) {
    const e = new Error('target_user_id is required for single-user notifications.'); e.status = 400; throw e;
  }

  const { data: sched, error } = await supabase
    .from('scheduled_notifications')
    .insert([{
      admin_id: adminId,
      title: title.trim(),
      body: body.trim(),
      data,
      target_type: target_type || 'all',
      target_user_id: target_user_id || null,
      scheduled_for,
      status: 'PENDING',
    }])
    .select()
    .single();

  if (error) throw error;
  return sched;
};

// ─────────────────────────────────────────────────────────────
// G. Cancel a Scheduled Notification
// ─────────────────────────────────────────────────────────────
const cancelScheduledNotification = async (id) => {
  const { data, error } = await supabase
    .from('scheduled_notifications')
    .update({ status: 'CANCELLED' })
    .eq('id', id)
    .eq('status', 'PENDING') // can only cancel if still pending
    .select()
    .single();

  if (error || !data) { const e = new Error('Scheduled notification not found or already sent/cancelled.'); e.status = 404; throw e; }
  return data;
};

// ─────────────────────────────────────────────────────────────
// H. Admin Notification Stats
// ─────────────────────────────────────────────────────────────
const getAdminNotificationStats = async () => {
  const [
    { count: totalSent },
    { count: unreadTotal },
    { count: pendingScheduled },
    { count: broadcasts },
  ] = await Promise.all([
    supabase.from('notifications').select('*', { count: 'exact', head: true }),
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('is_read', false),
    supabase.from('scheduled_notifications').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('admin_notification_logs').select('*', { count: 'exact', head: true }).eq('type', 'MANUAL_BROADCAST'),
  ]);

  return {
    total_sent:        totalSent        || 0,
    total_unread:      unreadTotal      || 0,
    pending_scheduled: pendingScheduled || 0,
    total_broadcasts:  broadcasts       || 0,
  };
};

// ─────────────────────────────────────────────────────────────
// I. Get Admin Notification Logs (send history)
// ─────────────────────────────────────────────────────────────
const getAdminNotificationLogs = async () => {
  const { data, error } = await supabase
    .from('admin_notification_logs')
    .select(`
      id, type, title, body, sent_count, target_user_id, created_at,
      admins ( name, email )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data;
};

// ─────────────────────────────────────────────────────────────
// INTERNAL: Run Due Scheduled Notifications
// Called on an interval from the server entry point.
// Checks for PENDING scheduled_notifications where scheduled_for <= NOW()
// and fires them.
// ─────────────────────────────────────────────────────────────
const runScheduledNotifications = async () => {
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from('scheduled_notifications')
    .select('*')
    .eq('status', 'PENDING')
    .lte('scheduled_for', now);

  if (error || !due?.length) return;

  for (const sched of due) {
    try {
      // Mark as SENDING immediately to prevent double-fire
      await supabase.from('scheduled_notifications')
        .update({ status: 'SENDING' })
        .eq('id', sched.id);

      let sentCount = 0;

      if (sched.target_type === 'single' && sched.target_user_id) {
        await createNotification(sched.target_user_id, 'ADMIN_BROADCAST', sched.title, sched.body, sched.data || {});
        sentCount = 1;
      } else {
        // Broadcast to all
        const { data: users } = await supabase.from('users').select('id');
        if (users?.length) {
          const batchSize = 50;
          for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            await Promise.allSettled(
              batch.map(u => createNotification(u.id, 'ADMIN_BROADCAST', sched.title, sched.body, sched.data || {}))
            );
            sentCount += batch.length;
          }
        }
      }

      await supabase.from('scheduled_notifications')
        .update({ status: 'SENT', sent_count: sentCount, sent_at: new Date().toISOString() })
        .eq('id', sched.id);

      console.log(`[ScheduledNotif] Sent "${sched.title}" to ${sentCount} user(s)`);
    } catch (err) {
      console.error(`[ScheduledNotif] Failed to send id=${sched.id}:`, err.message);
      await supabase.from('scheduled_notifications')
        .update({ status: 'FAILED' })
        .eq('id', sched.id);
    }
  }
};

module.exports = {
  getNotificationTemplates,
  updateTemplate,
  toggleTemplate,
  sendManualNotification,
  getScheduledNotifications,
  scheduleNotification,
  cancelScheduledNotification,
  getAdminNotificationStats,
  getAdminNotificationLogs,
  runScheduledNotifications,
};
