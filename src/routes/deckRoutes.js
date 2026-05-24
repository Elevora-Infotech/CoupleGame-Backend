'use strict';
const express          = require('express');
const router           = express.Router();
const ctrl             = require('../controllers/deckController');
const { authenticate } = require('../middlewares/authMiddleware');

router.use(authenticate);

// ── Standard Deck ─────────────────────────────────────────────
/** GET  /user/deck               — Full deck (all visible cards) */
router.get('/', ctrl.getUserDeck);

/** GET  /user/deck/available     — Unplayed cards for current room picker */
router.get('/available', ctrl.getAvailableCards);

/** POST /user/deck/:id/use       — Play a card (no send) */
router.post('/:deckCardId/use', ctrl.playCard);

// ── Card Game Engine ──────────────────────────────────────────
/**
 * GET /user/deck/sends/limits
 * Check daily (max 3) and active (max 2) send limits.
 * Frontend calls this to decide whether to show/disable the Send button.
 */
router.get('/sends/limits', ctrl.getSendLimits);

/**
 * GET /user/deck/sends?room_id=...
 * Full send/receive history for a room (both directions).
 */
router.get('/sends', ctrl.getCardSendHistory);

/**
 * POST /user/deck/:deckCardId/send
 * Send a card to partner with optional message.
 * Body: { room_id, receiver_id, message? }
 * Enforces: daily limit 3, active limit 2.
 * Emits: 'card_received' → receiver
 */
router.post('/:deckCardId/send', ctrl.sendCard);

/**
 * PATCH /user/deck/sends/:sendId/seen
 * Receiver marks a sent card as seen (read receipt).
 * Emits: 'card_seen' → sender
 */
router.patch('/sends/:sendId/seen', ctrl.markCardSeen);

/**
 * PATCH /user/deck/sends/:sendId/accept
 * Receiver accepts the card → moves to IN_PROGRESS.
 * Emits: 'card_accepted' → sender
 */
router.patch('/sends/:sendId/accept', ctrl.acceptCard);

/**
 * PATCH /user/deck/sends/:sendId/deflect
 * Receiver deflects the card → DEFLECTED (no penalty).
 * Emits: 'card_deflected' → sender
 */
router.patch('/sends/:sendId/deflect', ctrl.deflectCard);

/**
 * PATCH /user/deck/sends/:sendId/complete
 * Receiver marks the card as done → COMPLETED_BY_RECEIVER.
 * Sender must still confirm.
 * Emits: 'card_completed_by_receiver' → sender
 */
router.patch('/sends/:sendId/complete', ctrl.markCardComplete);

/**
 * PATCH /user/deck/sends/:sendId/confirm
 * Sender confirms the completion → COMPLETED ✅
 * Emits: 'card_confirmed' → receiver
 */
router.patch('/sends/:sendId/confirm', ctrl.confirmCardComplete);

/**
 * POST /user/deck/sends/:sendId/reminder
 * Receiver nudges sender to confirm. Rate limited: once per 6h.
 * Emits: 'card_reminder' → sender
 */
router.post('/sends/:sendId/reminder', ctrl.sendReminder);

module.exports = router;
