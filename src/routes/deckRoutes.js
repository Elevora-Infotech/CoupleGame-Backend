'use strict';
const express      = require('express');
const router       = express.Router();
const ctrl         = require('../controllers/deckController');
const { authenticate } = require('../middlewares/authMiddleware');

// All deck routes require authenticated user
router.use(authenticate);

/**
 * @route   GET /api/v1/user/deck
 * @desc    Get all visible cards in user's deck (used cards greyed on frontend)
 * @access  Authenticated User
 */
router.get('/', ctrl.getUserDeck);

/**
 * @route   GET /api/v1/user/deck/available
 * @desc    Get only unused + unexpired cards (for room card picker)
 * @access  Authenticated User
 */
router.get('/available', ctrl.getAvailableCards);

/**
 * @route   POST /api/v1/user/deck/:deckCardId/use
 * @desc    Play a card in a room — marks it used, links to room
 * @access  Authenticated User
 * @body    { room_id: "uuid" }
 */
router.post('/:deckCardId/use', ctrl.playCard);

module.exports = router;
