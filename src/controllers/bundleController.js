/**
 * @file   bundleController.js
 * @desc   HTTP request/response layer for all Bundle-related endpoints.
 *         Keeps controllers thin — all business logic lives in bundleService.
 *
 * Conventions:
 *  - Every handler passes errors to the global error handler via next(error).
 *  - Successful responses always follow the shape:
 *      { status: 'success', message?: string, data: { ... } }
 */

'use strict';

const bundleService = require('../services/bundleService');

// ─────────────────────────────────────────────────────────────
// SECTION A: Admin — Bundle CRUD
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/bundles
 * Create a new bundle.
 */
const createBundle = async (req, res, next) => {
  try {
    const bundle = await bundleService.createBundle(req.body);
    res.status(201).json({
      status: 'success',
      message: 'Bundle created successfully.',
      data: { bundle },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admin/bundles
 * List all bundles (active + inactive) for admin management.
 */
const getAllBundlesAdmin = async (req, res, next) => {
  try {
    const bundles = await bundleService.getAllBundlesAdmin();
    res.status(200).json({
      status: 'success',
      data: { bundles },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admin/bundles/:id
 * Get full details of a single bundle including all cards and plans.
 */
const getBundleByIdAdmin = async (req, res, next) => {
  try {
    const bundle = await bundleService.getBundleByIdAdmin(req.params.id);
    res.status(200).json({
      status: 'success',
      data: { bundle },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/admin/bundles/:id
 * Update bundle metadata (name, description, image, active state).
 */
const updateBundle = async (req, res, next) => {
  try {
    const bundle = await bundleService.updateBundle(req.params.id, req.body);
    res.status(200).json({
      status: 'success',
      message: 'Bundle updated successfully.',
      data: { bundle },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/admin/bundles/:id
 * Soft-delete a bundle (sets is_active = false).
 */
const deleteBundle = async (req, res, next) => {
  try {
    const bundle = await bundleService.softDeleteBundle(req.params.id);
    res.status(200).json({
      status: 'success',
      message: 'Bundle deactivated (soft-deleted) successfully.',
      data: { bundle },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// SECTION B: Admin — Bundle Cards
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/bundles/:id/cards
 * Bulk-add one or more cards to a bundle.
 * Body: { card_ids: ["uuid1", "uuid2", ...] }
 */
const addCardsToBundle = async (req, res, next) => {
  try {
    const { card_ids } = req.body;
    const added = await bundleService.addCardsToBunde(req.params.id, card_ids);
    res.status(200).json({
      status: 'success',
      message: `${added.length} card(s) added to bundle.`,
      data: { added },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/admin/bundles/:id/cards/:cardId
 * Remove a single card from a bundle.
 */
const removeCardFromBundle = async (req, res, next) => {
  try {
    const removed = await bundleService.removeCardFromBundle(
      req.params.id,
      req.params.cardId
    );
    res.status(200).json({
      status: 'success',
      message: 'Card removed from bundle.',
      data: { removed },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// SECTION C: Admin — Bundle Plans
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/bundles/:id/plans
 * Add a new pricing plan to a bundle.
 * Body: { name, price, card_count }
 */
const createBundlePlan = async (req, res, next) => {
  try {
    const plan = await bundleService.createBundlePlan(req.params.id, req.body);
    res.status(201).json({
      status: 'success',
      message: 'Pricing plan created successfully.',
      data: { plan },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/admin/plans/:planId
 * Update an existing pricing plan.
 */
const updateBundlePlan = async (req, res, next) => {
  try {
    const plan = await bundleService.updateBundlePlan(req.params.planId, req.body);
    res.status(200).json({
      status: 'success',
      message: 'Plan updated successfully.',
      data: { plan },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/admin/plans/:planId
 * Hard-delete a pricing plan.
 */
const deleteBundlePlan = async (req, res, next) => {
  try {
    const deleted = await bundleService.deleteBundlePlan(req.params.planId);
    res.status(200).json({
      status: 'success',
      message: 'Plan deleted successfully.',
      data: { deleted },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// SECTION D: User Store
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/store/bundles
 * Return all active bundles with card counts and active plans.
 */
const getStoreBundles = async (req, res, next) => {
  try {
    const bundles = await bundleService.getStoreBundles();
    res.status(200).json({
      status: 'success',
      data: { bundles },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/store/bundles/:id
 * Return one active bundle with full card list and active plans.
 */
const getStoreBundleById = async (req, res, next) => {
  try {
    const bundle = await bundleService.getStoreBundleById(req.params.id);
    res.status(200).json({
      status: 'success',
      data: { bundle },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Admin
  createBundle,
  getAllBundlesAdmin,
  getBundleByIdAdmin,
  updateBundle,
  deleteBundle,
  addCardsToBundle,
  removeCardFromBundle,
  createBundlePlan,
  updateBundlePlan,
  deleteBundlePlan,
  // Store
  getStoreBundles,
  getStoreBundleById,
};
