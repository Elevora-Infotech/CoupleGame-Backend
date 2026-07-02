'use strict';
/**
 * @file   notificationService.js
 * @desc   In-app notification system for CoupleGame.
 *
 * Every game event (card sent, card accepted, penalty, room join, etc.)
 * calls createNotification() here. This service:
 *   1. Persists the notification to the DB (so user can see it later)
 *   2. Pushes it to the user's socket in real-time (if they are online)
 *
 * Notification Types:
 *   CARD_RECEIVED        — Partner sent you a card
 *   CARD_ACCEPTED        — Partner accepted your card
 *   CARD_COMPLETED       — Partner marked your card as completed (awaiting your confirmation)
 *   CARD_CONFIRMED       — You confirmed the card is done ✅
 *   CARD_REJECTED        — Partner rejected your card (Penalty 3)
 *   CARD_DEFLECTED       — Partner deflected your card
 *   CARD_REMINDER        — Partner is nudging you to confirm a completed card
 *   PARTNER_JOINED       — Your partner joined the room → game is now ACTIVE
 *   FREE_CARDS_GRANTED   — Free cards were added to your deck
 *   PENALTY_RECEIVED     — You received a penalty
 *   SEND_BAN_RECEIVED    — You've been banned from sending for 24h
 */

const { supabase } = require('../db/supabase');

// ─────────────────────────────────────────────────────────────
// HELPER: Get the Socket.io emitter safely (won't crash if socket not ready)
// ─────────────────────────────────────────────────────────────
const getIoSafe = () => {
  try {
    const { getIo } = require('./socketService');
    return getIo();
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// Core: Create & Push a Notification
// Call this from any service to notify a user.
//
// @param {string} userId     - The recipient user's UUID
// @param {string} type       - One of the NOTIFICATION TYPES above
// @param {string} title      - Short title (shown in bell icon popup)
// @param {string} body       - Longer description text
// @param {object} data       - Extra context: { send_id, card_id, room_id, ... }
// ─────────────────────────────────────────────────────────────
const createNotification = async (userId, type, title, body, data = {}) => {
  try {
    // 1. Persist to database
    const { data: notif, error } = await supabase
      .from('notifications')
      .insert([{ user_id: userId, type, title, body, data }])
      .select('id, type, title, body, data, is_read, created_at')
      .single();

    if (error) {
      console.error('[NotificationService] DB insert error:', error.message);
      return null;
    }

    // 2. Push via Socket.io (real-time) — fire-and-forget, never crash
    const io = getIoSafe();
    if (io) {
      // Emit to the user's personal channel (userId as room name)
      io.to(`user:${userId}`).emit('new_notification', notif);

      // Also emit updated unread count
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      io.to(`user:${userId}`).emit('notification_count', { unread_count: count || 0 });
    }

    return notif;
  } catch (err) {
    // Notifications should NEVER crash the calling service
    console.error('[NotificationService] Unexpected error:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// Get Notifications for a User (paginated)
// ─────────────────────────────────────────────────────────────
const getNotifications = async (userId, { page = 1, limit = 20 } = {}) => {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  const { data, error, count } = await supabase
    .from('notifications')
    .select('id, type, title, body, data, is_read, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    notifications: data || [],
    total: count || 0,
    page,
    limit,
    has_more: (count || 0) > to + 1,
  };
};

// ─────────────────────────────────────────────────────────────
// Get Unread Count
// ─────────────────────────────────────────────────────────────
const getUnreadCount = async (userId) => {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  return count || 0;
};

// ─────────────────────────────────────────────────────────────
// Mark One Notification as Read
// ─────────────────────────────────────────────────────────────
const markAsRead = async (userId, notifId) => {
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notifId)
    .eq('user_id', userId) // security: only own notifs
    .select()
    .single();

  if (error || !data) {
    const err = new Error('Notification not found.');
    err.status = 404;
    throw err;
  }
  return data;
};

// ─────────────────────────────────────────────────────────────
// Mark All Notifications as Read
// ─────────────────────────────────────────────────────────────
const markAllAsRead = async (userId) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  return { success: true };
};

// ─────────────────────────────────────────────────────────────
// Delete a Notification
// ─────────────────────────────────────────────────────────────
const deleteNotification = async (userId, notifId) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notifId)
    .eq('user_id', userId);

  if (error) throw error;
  return { success: true };
};

module.exports = {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
