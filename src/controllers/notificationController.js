'use strict';
const notifSvc = require('../services/notificationService');

// GET /api/v1/notifications?page=1&limit=20
const getNotifications = async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const result = await notifSvc.getNotifications(req.user.id, { page, limit });
    res.json({ status: 'success', data: result });
  } catch (e) { next(e); }
};

// GET /api/v1/notifications/unread-count
const getUnreadCount = async (req, res, next) => {
  try {
    const count = await notifSvc.getUnreadCount(req.user.id);
    res.json({ status: 'success', data: { unread_count: count } });
  } catch (e) { next(e); }
};

// PATCH /api/v1/notifications/:id/read
const markAsRead = async (req, res, next) => {
  try {
    const notif = await notifSvc.markAsRead(req.user.id, req.params.id);
    res.json({ status: 'success', message: 'Notification marked as read.', data: { notification: notif } });
  } catch (e) { next(e); }
};

// PATCH /api/v1/notifications/read-all
const markAllAsRead = async (req, res, next) => {
  try {
    await notifSvc.markAllAsRead(req.user.id);
    res.json({ status: 'success', message: 'All notifications marked as read.' });
  } catch (e) { next(e); }
};

// DELETE /api/v1/notifications/:id
const deleteNotification = async (req, res, next) => {
  try {
    await notifSvc.deleteNotification(req.user.id, req.params.id);
    res.json({ status: 'success', message: 'Notification deleted.' });
  } catch (e) { next(e); }
};

// POST /api/v1/notifications/register-push-token
const registerPushToken = async (req, res, next) => {
  try {
    const { pushToken } = req.body;
    if (!pushToken) {
      return res.status(400).json({ status: 'error', message: 'pushToken is required' });
    }
    await notifSvc.savePushToken(req.user.id, pushToken);
    res.json({ status: 'success', message: 'Push token registered successfully.' });
  } catch (e) { next(e); }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  registerPushToken,
};
