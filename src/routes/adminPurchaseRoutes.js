'use strict';
const express           = require('express');
const router            = express.Router();
const ctrl              = require('../controllers/adminPurchaseController');
const { adminProtect }  = require('../middlewares/adminMiddleware');

// All admin purchase routes require admin JWT
router.use(adminProtect);

// ── Purchase Management ───────────────────────────────────────
/** GET  /admin/purchases           — all purchases (paginated + filtered) */
router.get('/purchases',                         ctrl.getAllPurchases);

/** GET  /admin/purchases/stats      — revenue analytics dashboard */
router.get('/purchases/stats',                    ctrl.getPurchaseStats);

/** GET  /admin/purchases/user/:userId — all purchases by one user */
router.get('/purchases/user/:userId',             ctrl.getPurchasesByUser);

/** GET  /admin/purchases/:purchaseId — one purchase deep detail */
router.get('/purchases/:purchaseId',              ctrl.getPurchaseById);

/** POST /admin/purchases/:purchaseId/refund — process refund + revoke cards */
router.post('/purchases/:purchaseId/refund',      ctrl.processRefund);

/** POST /admin/purchases/grant-cards — manually grant cards to a user */
router.post('/purchases/grant-cards',             ctrl.grantCards);

// ── User Deck Audit ───────────────────────────────────────────
/** GET    /admin/users/:userId/deck           — view user's deck (admin) */
router.get('/users/:userId/deck',       ctrl.getUserDeckAdmin);

/** DELETE /admin/users/:userId/deck/:deckCardId — revoke one card */
router.delete('/users/:userId/deck/:deckCardId', ctrl.revokeCard);

// ── Store Products (RevenueCat product mapping) ───────────────
/** GET    /admin/store-products     — list all product mappings */
router.get('/store-products',           ctrl.getStoreProducts);

/** POST   /admin/store-products     — create a product mapping */
router.post('/store-products',          ctrl.createStoreProduct);

/** PUT    /admin/store-products/:id — update (toggle is_active) */
router.put('/store-products/:id',       ctrl.updateStoreProduct);

/** DELETE /admin/store-products/:id — hard delete mapping */
router.delete('/store-products/:id',    ctrl.deleteStoreProduct);

module.exports = router;
