'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminAuditController');
const { adminProtect } = require('../middlewares/adminMiddleware');
const { requireCategory, ACTION_CATEGORIES } = require('../middlewares/adminRbac');

// Require valid admin session and AUDIT_LOGS_VIEW permission
router.use(adminProtect);
router.use(requireCategory(ACTION_CATEGORIES.AUDIT_LOGS_VIEW));

/**
 * @route GET /api/v1/admin/audit-logs
 * @desc  Fetch paginated immutable action logs with IST formatting
 * @access Private (Admin & Support with AUDIT_LOGS_VIEW permission)
 */
router.get('/', ctrl.getAuditLogs);

module.exports = router;
