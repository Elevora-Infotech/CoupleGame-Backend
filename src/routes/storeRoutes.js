/**
 * @file   storeRoutes.js
 * @desc   User-facing Store routes for browsing the Card Bundle Store.
 *         Protected by the standard JWT authenticate middleware.
 *
 * Mounted at: /api/v1/store  (see app.js)
 *
 * Full route list:
 *   GET  /store/bundles       - List all active bundles with plans
 *   GET  /store/bundles/:id   - Get one active bundle with cards + plans
 */

'use strict';

const express = require('express');
const router = express.Router();
const bundleController = require('../controllers/bundleController');
const { authenticate } = require('../middlewares/authMiddleware');

// Require JWT on all store routes (only logged-in users can browse store)
router.use(authenticate);

/**
 * @route   GET /api/v1/store/bundles
 * @desc    Return all active bundles with active plans for the store listing
 * @access  Private (Authenticated User)
 */
router.get('/bundles', bundleController.getStoreBundles);

/**
 * @route   GET /api/v1/store/bundles/:id
 * @desc    Get one active bundle with its full card list and active plans
 * @access  Private (Authenticated User)
 */
router.get('/bundles/:id', bundleController.getStoreBundleById);

module.exports = router;
