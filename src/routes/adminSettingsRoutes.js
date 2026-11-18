'use strict';

/**
 * @file   adminSettingsRoutes.js
 * @desc   Routes for Dynamic Settings, Free Pool, System Controls & Soft-Launch Engine (Part B5, C10, C11)
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminSettingsController');
const { adminProtect } = require('../middlewares/adminMiddleware');
const { requireCategory, ACTION_CATEGORIES } = require('../middlewares/adminRbac');

router.use(adminProtect);

// ── 1. Runtime Game Parameters (Part B5 & Spec 5.3) ─────────────
router.get('/runtime', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getRuntimeSettings);
router.put('/runtime', requireCategory(ACTION_CATEGORIES.SYSTEM_CONTROLS), ctrl.updateRuntimeSettings);

// ── 2. Free-Pool Manager (Spec 5.2) ────────────────────────────
router.get('/free-pool', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getFreePoolStatus);
router.post('/free-pool/assign', requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), ctrl.setCardFreePoolStatus);
router.post('/free-pool/seed', requireCategory(ACTION_CATEGORIES.SYSTEM_CONTROLS), ctrl.seedFreePoolDefaults);

// ── 3. App Controls, Banners & Emergency Outages (Part B5) ──────
router.get('/controls', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getAppControls);
router.put('/controls', requireCategory(ACTION_CATEGORIES.SYSTEM_CONTROLS), ctrl.updateAppControlSetting);
router.post('/controls/pause-timers', requireCategory(ACTION_CATEGORIES.SYSTEM_CONTROLS), ctrl.pauseAllTimers);
router.post('/controls/resume-timers', requireCategory(ACTION_CATEGORIES.SYSTEM_CONTROLS), ctrl.resumeAllTimers);

// ── 4. End-of-Free-Game Pitch Editor (Spec 5.4) ────────────────
router.get('/pitch', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getFreeGamePitch);
router.put('/pitch', requireCategory(ACTION_CATEGORIES.SYSTEM_CONTROLS), ctrl.updateFreeGamePitch);

// ── 5. Soft-Launch Decision Engine & Diagnosis (Part B5 & C10-C11)
router.get('/soft-launch', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getSoftLaunchMetrics);

module.exports = router;
