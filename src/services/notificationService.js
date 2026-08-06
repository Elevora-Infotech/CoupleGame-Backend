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

const axios = require('axios');
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
// HELPER: Send Remote Push Notification via Expo Push Service
// Delivers banner notification to device when app is CLOSED / IN BACKGROUND
// ─────────────────────────────────────────────────────────────
const sendExpoPushNotification = async (pushToken, title, body, data = {}) => {
  if (!pushToken || typeof pushToken !== 'string') return;
  const token = pushToken.trim();
  if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
    console.warn(`[NotificationService] Invalid push token format: ${token}`);
    return;
  }

  try {
    const payload = {
      to: token,
      sound: 'default',
      title: title || 'SoulShuffle Alert',
      body: body || '',
      data: data || {},
      priority: 'high',
      channelId: 'default',
      _displayInForeground: true,
      badge: 1,
    };

    const response = await axios.post('https://exp.host/--/api/v2/push/send', payload, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      timeout: 8000,
    });
    console.log(`[NotificationService] Remote push sent successfully to ${token.substring(0, 25)}...`, response.data);
  } catch (pushErr) {
    console.warn('[NotificationService] Expo push error:', pushErr?.response?.data || pushErr.message);
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

    // 2. Push via Socket.io (real-time foreground)
    const io = getIoSafe();
    if (io) {
      io.to(`user:${userId}`).emit('new_notification', notif);

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      io.to(`user:${userId}`).emit('notification_count', { unread_count: count || 0 });
    }

    // 3. Send Remote Push Notification via Expo Push Service (for background / closed app)
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', userId)
        .single();

      let pushToken = null;
      if (profile?.preferences) {
        let prefs = profile.preferences;
        if (typeof prefs === 'string') {
          try { prefs = JSON.parse(prefs); } catch {}
        }
        pushToken = prefs?.push_token;
      }

      if (pushToken) {
        await sendExpoPushNotification(pushToken, title, body, { ...data, type });
      } else {
        console.log(`[NotificationService] No push token found for user ${userId}`);
      }
    } catch (pushLookupErr) {
      console.warn('[NotificationService] Push token lookup failed:', pushLookupErr.message);
    }

    return notif;
  } catch (err) {
    // Notifications should NEVER crash the calling service
    console.error('[NotificationService] Unexpected error:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// Save / Register Push Token for a User
// ─────────────────────────────────────────────────────────────
const savePushToken = async (userId, pushToken) => {
  if (!pushToken || typeof pushToken !== 'string') return null;

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single();

    let currentPrefs = profile?.preferences || { theme: 'dark', notifications: true };
    if (typeof currentPrefs === 'string') {
      try { currentPrefs = JSON.parse(currentPrefs); } catch {}
    }
    const updatedPrefs = { ...currentPrefs, push_token: pushToken.trim() };

    const { data, error } = await supabase
      .from('profiles')
      .update({ preferences: updatedPrefs })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('[NotificationService] Failed to save push token:', error.message);
      throw error;
    }

    console.log(`[NotificationService] Saved push token for user ${userId}: ${pushToken.substring(0, 25)}...`);
    return data;
  } catch (err) {
    console.error('[NotificationService] savePushToken error:', err.message);
    throw err;
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
  savePushToken,
  sendExpoPushNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
