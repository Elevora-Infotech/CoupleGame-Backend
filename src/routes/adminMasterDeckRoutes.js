'use strict';
const express          = require('express');
const router           = express.Router();
const ctrl             = require('../controllers/adminMasterDeckController');
const { adminProtect } = require('../middlewares/adminMiddleware');

router.use(adminProtect);

/**
 * GET /admin/master-decks
 * Lists both master decks (7_DAYS and 30_DAYS) with pool size summary.
 * Admin sees this on the Master Deck page in the admin panel.
 */
router.get('/master-decks', ctrl.getAllMasterDecks);

/**
 * GET /admin/master-decks/:deckId
 * Full detail: deck metadata + every card currently in the pool.
 * Used to render the card list for a specific master deck.
 */
router.get('/master-decks/:deckId', ctrl.getMasterDeckById);

/**
 * PUT /admin/master-decks/:deckId
 * Update deck display metadata (name, description, is_active).
 * plan_type and card_count are FIXED — cannot be changed.
 * Body: { name?, description?, is_active? }
 */
router.put('/master-decks/:deckId', ctrl.updateMasterDeck);

/**
 * GET /admin/master-decks/:deckId/stats
 * Analytics: how many users received cards, unique users served, pool size.
 */
router.get('/master-decks/:deckId/stats', ctrl.getMasterDeckStats);

/**
 * POST /admin/master-decks/:deckId/cards
 * Add a card to the master deck pool.
 * Body: { card_id }
 * Rules:
 *   - Only active regular (non-deflect) cards can be added
 *   - Deflect cards are rejected (they are granted automatically)
 *   - Adding an already-existing card is idempotent (200, not 201)
 */
router.post('/master-decks/:deckId/cards', ctrl.addCardToMasterDeck);

/**
 * DELETE /admin/master-decks/:deckId/cards/:masterDeckCardId
 * Remove a card from the master deck pool.
 * Does NOT affect cards already distributed to users.
 * Only affects future room joins.
 */
router.delete('/master-decks/:deckId/cards/:masterDeckCardId', ctrl.removeCardFromMasterDeck);

module.exports = router;
