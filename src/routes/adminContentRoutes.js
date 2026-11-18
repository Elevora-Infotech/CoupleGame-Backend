'use strict';

/**
 * @file   adminContentRoutes.js
 * @desc   Routes for Content Management (Part B4 & C6)
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminContentController');
const { adminProtect } = require('../middlewares/adminMiddleware');
const { requireCategory, ACTION_CATEGORIES } = require('../middlewares/adminRbac');

router.use(adminProtect);

// ── 1. Cards Catalog & Management ──────────────────────────────
router.get('/cards', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getCardsCatalog);
router.get('/cards/:id', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getCardById);
router.post('/cards', requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), ctrl.createCard);
router.put('/cards/:id', requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), ctrl.updateCard);
router.patch('/cards/:id/toggle', requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), ctrl.toggleCardStatus);

// ── 2. Categories ──────────────────────────────────────────────
router.get('/categories', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getCategories);
router.put('/categories/:id', requireCategory(ACTION_CATEGORIES.CONTENT_MANAGEMENT), ctrl.updateCategory);

// ── 3. Immutable Version Diffs (Part C6) ────────────────────────
router.get('/diffs', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getContentVersionDiffs);

module.exports = router;
