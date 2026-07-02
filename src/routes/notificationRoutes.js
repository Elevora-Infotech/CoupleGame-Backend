'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/authMiddleware');

// All notification routes require a logged-in user
router.use(authenticate);

/**
 * GET /api/v1/notifications
 * Returns all notifications for the logged-in user (newest first).
 * Query params: ?page=1&limit=20
 */
router.get('/', ctrl.getNotifications);

/**
 * GET /api/v1/notifications/unread-count
 * Returns just the count of unread notifications.
 * Used by the frontend to display the red badge on the bell icon.
 */
router.get('/unread-count', ctrl.getUnreadCount);

/**
 * PATCH /api/v1/notifications/read-all
 * Marks ALL of the user's notifications as read in one shot.
 */
router.patch('/read-all', ctrl.markAllAsRead);

/**
 * PATCH /api/v1/notifications/:id/read
 * Marks a single notification as read.
 */
router.patch('/:id/read', ctrl.markAsRead);

/**
 * DELETE /api/v1/notifications/:id
 * Deletes a single notification.
 */
router.delete('/:id', ctrl.deleteNotification);

module.exports = router;
