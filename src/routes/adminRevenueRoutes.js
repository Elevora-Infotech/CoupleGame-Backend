'use strict';

/**
 * @file   adminRevenueRoutes.js
 * @desc   Routes for Phase 4: Business, Subscriptions & Revenue Operations
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminRevenueController');
const { adminProtect } = require('../middlewares/adminMiddleware');
const { requireCategory, ACTION_CATEGORIES } = require('../middlewares/adminRbac');

// Protect all revenue & business operations routes
router.use(adminProtect);

// ── 1. Subscriptions & Couples Ledger ─────────────────────────────────────────
router.get('/subscriptions', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getSubscriptionsLedger);

// ── 2. Revenue KPIs & Executive Analytics ─────────────────────────────────────
router.get('/metrics', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getRevenueMetrics);

// ── 3. Paywall Impressions & 6-Stage Conversion Funnel ────────────────────────
router.get('/paywall-funnel', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getPaywallFunnelMetrics);

// ── 4. Marketing ROI & Ad Spend CAC Engine ────────────────────────────────────
router.get('/marketing-roi', requireCategory(ACTION_CATEGORIES.READ_OPERATIONS), ctrl.getMarketingROI);
router.post('/ad-spend', requireCategory(ACTION_CATEGORIES.FINANCIAL_OPERATIONS), ctrl.recordAdSpend);

// ── 5. Financial Actions (Refunds & Complimentary Season Grants) ──────────────
router.post('/refund/:purchaseId', requireCategory(ACTION_CATEGORIES.FINANCIAL_OPERATIONS), ctrl.processAdminRefund);
router.post('/complimentary-grant', requireCategory(ACTION_CATEGORIES.FINANCIAL_OPERATIONS), ctrl.grantComplimentarySubscription);

module.exports = router;
