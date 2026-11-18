'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminOperationsController');
const { adminProtect } = require('../middlewares/adminMiddleware');
const { requireCategory, ACTION_CATEGORIES } = require('../middlewares/adminRbac');

// Require authenticated admin / support session
router.use(adminProtect);

// ── 1. Unified Search (7 Identifiers) ─────────────────────────────────────────
router.get('/search', requireCategory(ACTION_CATEGORIES.SEARCH), ctrl.search);

// ── 2. Complete Couple Screen (7 Tiers) ───────────────────────────────────────
router.get('/couples/:roomId', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getCouple);

// ── 3. Support Notes & Actions ────────────────────────────────────────────────
router.post('/couples/:roomId/notes', requireCategory(ACTION_CATEGORIES.SUPPORT_NOTES), ctrl.addNote);
router.post('/couples/:roomId/resend-invite', requireCategory(ACTION_CATEGORIES.SUPPORT_ACTIONS), ctrl.resendInvite);
router.post('/couples/:roomId/restore-card', requireCategory(ACTION_CATEGORIES.SUPPORT_ACTIONS), ctrl.restoreCard);
router.post('/couples/:roomId/extend-timer', requireCategory(ACTION_CATEGORIES.SUPPORT_ACTIONS), ctrl.extendTimer);

// ── 4. App-Wide Controls (Outage Pause, Maintenance Banner, Version Control) ──
router.get('/controls', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getControls);
router.post('/controls/pause-timers', requireCategory(ACTION_CATEGORIES.SYSTEM_CONTROLS), ctrl.pauseTimers);
router.post('/controls/resume-timers', requireCategory(ACTION_CATEGORIES.SYSTEM_CONTROLS), ctrl.resumeTimers);
router.put('/controls/settings', requireCategory(ACTION_CATEGORIES.SETTINGS_MANAGEMENT), ctrl.updateControl);

module.exports = router;
