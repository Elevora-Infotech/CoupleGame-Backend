'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/adminNotificationController');
const { adminProtect } = require('../middlewares/adminMiddleware');

router.use(adminProtect);

// Stats
router.get('/notifications/stats',    ctrl.getStats);

// Templates (notification type config)
router.get('/notifications/templates',           ctrl.getTemplates);
router.put('/notifications/templates/:id',       ctrl.updateTemplate);
router.patch('/notifications/templates/:id/toggle', ctrl.toggleTemplate);

// Manual send
router.post('/notifications/send',    ctrl.sendManual);
router.post('/notifications/trigger-anniversaries', ctrl.triggerAnniversaries);

// Logs (send history)
router.get('/notifications/logs',     ctrl.getLogs);

// Scheduled
router.get('/notifications/scheduled',       ctrl.getScheduled);
router.post('/notifications/schedule',       ctrl.schedule);
router.delete('/notifications/scheduled/:id', ctrl.cancelScheduled);

module.exports = router;
