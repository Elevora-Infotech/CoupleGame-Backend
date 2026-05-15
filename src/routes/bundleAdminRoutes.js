/**
 * @file   bundleAdminRoutes.js
 * @desc   Admin-only routes for managing the Card Store Bundle system.
 *         All routes are protected by the adminProtect middleware.
 *
 * Mounted at: /api/v1/admin  (see app.js)
 *
 * Full route list:
 *   GET    /admin/bundles                       - List all bundles
 *   POST   /admin/bundles                       - Create a bundle
 *   GET    /admin/bundles/:id                   - Get one bundle (full detail)
 *   PUT    /admin/bundles/:id                   - Update a bundle
 *   DELETE /admin/bundles/:id                   - Soft-delete a bundle
 *   POST   /admin/bundles/:id/cards             - Bulk add cards
 *   DELETE /admin/bundles/:id/cards/:cardId     - Remove one card
 *   POST   /admin/bundles/:id/plans             - Add a pricing plan
 *   PUT    /admin/plans/:planId                 - Update a plan
 *   DELETE /admin/plans/:planId                 - Delete a plan
 */

'use strict';

const express = require('express');
const router = express.Router();
const bundleController = require('../controllers/bundleController');
const adminController = require('../controllers/adminController');
const { adminProtect } = require('../middlewares/adminMiddleware');

// ── Bundle CRUD ───────────────────────────────────────────────
/**
 * @route   GET  /api/v1/admin/bundles
 * @desc    Return all bundles (including inactive) for the admin dashboard
 * @access  Admin Only
 */
router.get('/bundles', adminProtect, bundleController.getAllBundlesAdmin);

/**
 * @route   POST /api/v1/admin/bundles
 * @desc    Create a new bundle
 * @access  Admin Only
 * @body    { name, description?, cover_image_url? }
 */
router.post('/bundles', adminProtect, bundleController.createBundle);

/**
 * @route   GET  /api/v1/admin/bundles/:id
 * @desc    Get full details of one bundle with all cards + plans
 * @access  Admin Only
 */
router.get('/bundles/:id', adminProtect, bundleController.getBundleByIdAdmin);

/**
 * @route   PUT  /api/v1/admin/bundles/:id
 * @desc    Update bundle metadata (name, description, image, is_active)
 * @access  Admin Only
 * @body    { name?, description?, cover_image_url?, is_active? }
 */
router.put('/bundles/:id', adminProtect, bundleController.updateBundle);

/**
 * @route   DELETE /api/v1/admin/bundles/:id
 * @desc    Soft-delete (deactivate) a bundle
 * @access  Admin Only
 */
router.delete('/bundles/:id', adminProtect, bundleController.deleteBundle);

// ── Bundle Cards ──────────────────────────────────────────────
/**
 * @route   POST /api/v1/admin/bundles/:id/cards
 * @desc    Bulk-add one or more cards to a bundle
 * @access  Admin Only
 * @body    { card_ids: ["uuid", "uuid", ...] }
 */
router.post('/bundles/:id/cards', adminProtect, bundleController.addCardsToBundle);

/**
 * @route   DELETE /api/v1/admin/bundles/:id/cards/:cardId
 * @desc    Remove a single card from a bundle
 * @access  Admin Only
 */
router.delete('/bundles/:id/cards/:cardId', adminProtect, bundleController.removeCardFromBundle);

// ── Bundle Plans ──────────────────────────────────────────────
/**
 * @route   POST /api/v1/admin/bundles/:id/plans
 * @desc    Add a new pricing plan to a bundle
 * @access  Admin Only
 * @body    { name, price, card_count }
 */
router.post('/bundles/:id/plans', adminProtect, bundleController.createBundlePlan);

/**
 * @route   PUT  /api/v1/admin/plans/:planId
 * @desc    Update a pricing plan (name, price, card_count, is_active)
 * @access  Admin Only
 * @body    { name?, price?, card_count?, is_active? }
 */
router.put('/plans/:planId', adminProtect, bundleController.updateBundlePlan);

/**
 * @route   DELETE /api/v1/admin/plans/:planId
 * @desc    Hard-delete a pricing plan
 * @access  Admin Only
 */
router.delete('/plans/:planId', adminProtect, bundleController.deleteBundlePlan);

// ── Lightweight Read-Only Routes ────────────────────────────────────
/**
 * @route   GET /api/v1/admin/bundles/:id/plans
 * @desc    Get only the pricing plans for a bundle (no card data loaded)
 * @access  Admin Only
 */
router.get('/bundles/:id/plans', adminProtect, adminController.getBundlePlans);

/**
 * @route   GET /api/v1/admin/bundles/:id/cards
 * @desc    Get only the cards inside a bundle (no plan data loaded)
 * @access  Admin Only
 */
router.get('/bundles/:id/cards', adminProtect, adminController.getBundleCards);

/**
 * @route   GET /api/v1/admin/plans/:planId
 * @desc    Get a single pricing plan by ID (for pre-filling the edit form)
 * @access  Admin Only
 */
router.get('/plans/:planId', adminProtect, adminController.getPlanById);

module.exports = router;
