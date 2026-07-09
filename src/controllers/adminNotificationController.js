'use strict';
const svc = require('../services/adminNotificationService');

// GET /admin/notifications/templates
const getTemplates = async (req, res, next) => {
  try {
    const templates = await svc.getNotificationTemplates();
    res.json({ status: 'success', data: { templates } });
  } catch (e) { next(e); }
};

// PUT /admin/notifications/templates/:id
const updateTemplate = async (req, res, next) => {
  try {
    const template = await svc.updateTemplate(req.params.id, req.body);
    res.json({ status: 'success', message: 'Template updated.', data: { template } });
  } catch (e) { next(e); }
};

// PATCH /admin/notifications/templates/:id/toggle
const toggleTemplate = async (req, res, next) => {
  try {
    const { is_enabled } = req.body;
    if (typeof is_enabled !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'is_enabled must be a boolean.' });
    }
    const template = await svc.toggleTemplate(req.params.id, is_enabled);
    res.json({ status: 'success', message: `Notification type ${is_enabled ? 'enabled' : 'disabled'}.`, data: { template } });
  } catch (e) { next(e); }
};

// POST /admin/notifications/send
const sendManual = async (req, res, next) => {
  try {
    const result = await svc.sendManualNotification(req.admin.id, req.body);
    res.status(201).json({ status: 'success', message: `Notification sent to ${result.sent_count} user(s).`, data: result });
  } catch (e) { next(e); }
};

// GET /admin/notifications/scheduled
const getScheduled = async (req, res, next) => {
  try {
    const scheduled = await svc.getScheduledNotifications();
    res.json({ status: 'success', data: { scheduled } });
  } catch (e) { next(e); }
};

// POST /admin/notifications/schedule
const schedule = async (req, res, next) => {
  try {
    const scheduled = await svc.scheduleNotification(req.admin.id, req.body);
    res.status(201).json({ status: 'success', message: 'Notification scheduled.', data: { scheduled } });
  } catch (e) { next(e); }
};

// DELETE /admin/notifications/scheduled/:id
const cancelScheduled = async (req, res, next) => {
  try {
    const result = await svc.cancelScheduledNotification(req.params.id);
    res.json({ status: 'success', message: 'Scheduled notification cancelled.', data: result });
  } catch (e) { next(e); }
};

// GET /admin/notifications/stats
const getStats = async (req, res, next) => {
  try {
    const stats = await svc.getAdminNotificationStats();
    res.json({ status: 'success', data: { stats } });
  } catch (e) { next(e); }
};

// GET /admin/notifications/logs
const getLogs = async (req, res, next) => {
  try {
    const logs = await svc.getAdminNotificationLogs();
    res.json({ status: 'success', data: { logs } });
  } catch (e) { next(e); }
};
// POST /admin/notifications/trigger-anniversaries
const triggerAnniversaries = async (req, res, next) => {
  try {
    const result = await svc.triggerAnniversaryNotifications(req.admin.id);
    res.json({ status: 'success', message: `Anniversary notifications sent to ${result.sent_count} user(s).`, data: result });
  } catch (e) { next(e); }
};

module.exports = {
  getTemplates, updateTemplate, toggleTemplate,
  sendManual, getScheduled, schedule, cancelScheduled,
  getStats, getLogs, triggerAnniversaries,
};
