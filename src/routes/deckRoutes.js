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

// ── Deflect Card System ───────────────────────────────────────
/**
 * GET /user/deck/deflect-cards?room_id=...
 * Returns all unused, unexpired deflect cards for the user in this room.
 * Frontend calls this to populate the deflect card list in the popup window.
 * User sees this when they receive a card from their partner.
 */
router.get('/deflect-cards', ctrl.getDeflectCards);

/**
 * POST /user/deck/sends/:sendId/use-deflect
 * User fires a deflect card against a received card.
 * Body: { deflect_deck_card_id }
 *
 * Server auto-executes the effect based on the card's deflect_action:
 *   CANCEL_ANY         → Close target card, no penalty
 *   CANCEL_SENT_ONLY   → Close only if SENT (Nice Try Card)
 *   CANCEL_IN_PROGRESS → Close only if IN_PROGRESS (Party Pooper)
 *   CANCEL_IMMUNE      → Close + block counter-deflect (Not Today Satan)
 *   REVERSE_ROLES      → Cancel + re-send with roles swapped (Switcheroo)
 *   TIMEOUT            → Extend deadline by +10 min (Time Out Card)
 *
 * Emits: 'deflect_card_used' → both users in room
 *        'card_reversed'     → both users (REVERSE_ROLES only)
 *        'card_timeout_extended' → both users (TIMEOUT only)
 */
router.post('/sends/:sendId/use-deflect', ctrl.useDeflectCard);

// ── Penalty System ────────────────────────────────────────────
/**
 * PATCH /user/deck/sends/:sendId/reject
 * Receiver explicitly rejects a SENT/WAITING card.
 * Triggers Penalty 3: transfers 1 asset (card) from receiver → sender.
 * Priority: unused card → deflect card → master pool bonus.
 * Emits: 'card_rejected' → both users in room
 */
router.patch('/sends/:sendId/reject', ctrl.rejectCard);

/**
 * GET /user/deck/penalties?room_id=...
 * Returns full penalty history for both users in this room.
 * Frontend shows this as a "Consequences" log visible to both partners.
 */
router.get('/penalties', ctrl.getPenaltyLog);

module.exports = router;
