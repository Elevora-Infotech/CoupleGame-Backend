'use strict';
const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/purchaseController');
const { validateRevenueCatWebhook } = require('../middlewares/revenueCatWebhook');
const { authenticate }              = require('../middlewares/authMiddleware');

/**
 * @route   POST /api/v1/store/purchase/verify
 * @desc    RevenueCat webhook — verify payment, run 80/20 algo, allocate cards
 * @access  RevenueCat Webhook Secret (not user JWT)
 */
router.post('/verify', validateRevenueCatWebhook, ctrl.verifyPurchase);

/**
 * @route   GET /api/v1/store/purchase/history
 * @desc    User's own purchase history
 * @access  Authenticated User
 */
router.get('/history', authenticate, ctrl.getPurchaseHistory);

module.exports = router;
