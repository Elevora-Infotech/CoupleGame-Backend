'use strict';
const express          = require('express');
const router           = express.Router();
const ctrl             = require('../controllers/deckController');
const { authenticate } = require('../middlewares/authMiddleware');

// All deck routes require authenticated user
router.use(authenticate);

/**
 * @route   GET /api/v1/user/deck
 * @desc    Get all visible cards in user's deck
 * @access  Authenticated User
 */
router.get('/', ctrl.getUserDeck);

/**
 * @route   GET /api/v1/user/deck/available
 * @desc    Get only unused + unexpired cards for current room (card picker)
 * @access  Authenticated User
 * @query   room_id (required)
 */
router.get('/available', ctrl.getAvailableCards);

/**
 * @route   GET /api/v1/user/deck/sends
 * @desc    Get card send history (sent + received) for a room
 * @access  Authenticated User
 * @query   room_id (required)
 */
router.get('/sends', ctrl.getCardSendHistory);

/**
 * @route   POST /api/v1/user/deck/:deckCardId/use
 * @desc    Play a card in a room — marks it used, links to room
 * @access  Authenticated User
 * @body    { room_id }
 */
router.post('/:deckCardId/use', ctrl.playCard);

/**
 * @route   POST /api/v1/user/deck/:deckCardId/send
 * @desc    Send a card from your deck to your partner with optional message
 *          Marks card as used immediately. Emits 'card_received' Socket.io event.
 * @access  Authenticated User
 * @body    { room_id, receiver_id, message? }
 */
router.post('/:deckCardId/send', ctrl.sendCard);

/**
 * @route   PATCH /api/v1/user/deck/sends/:sendId/seen
 * @desc    Receiver marks a sent card as seen
 *          Emits 'card_seen' Socket.io event back to sender.
 * @access  Authenticated User (receiver only)
 */
router.patch('/sends/:sendId/seen', ctrl.markCardSeen);

module.exports = router;
