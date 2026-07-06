'use strict';
const deckService     = require('../services/deckService');
const deflectService  = require('../services/deflectService');
const penaltyService  = require('../services/penaltyService');
const { getIo }       = require('../services/socketService');

// ─── Helper: emit to room without crashing on socket failure ──
const emit = (roomId, event, payload) => {
  try { getIo().to(roomId).emit(event, payload); }
  catch (e) { console.error(`[Socket] emit ${event} failed:`, e.message); }
};

// ─────────────────────────────────────────────────────────────
// Standard Deck Endpoints
// ─────────────────────────────────────────────────────────────
const getUserDeck = async (req, res, next) => {
  try {
    const cards = await deckService.getUserDeck(req.user.id);
    res.status(200).json({ status: 'success', data: { cards, total: cards.length } });
  } catch (e) { next(e); }
};

const getAvailableCards = async (req, res, next) => {
  try {
    const { room_id } = req.query;
    if (!room_id) return res.status(400).json({ status: 'error', message: 'room_id query param is required.' });
    const cards = await deckService.getAvailableCards(req.user.id, room_id);
    res.status(200).json({ status: 'success', data: { cards, total: cards.length } });
  } catch (e) { next(e); }
};

const playCard = async (req, res, next) => {
  try {
    const { room_id } = req.body;
    if (!room_id) return res.status(400).json({ status: 'error', message: 'room_id is required.' });
    const card = await deckService.playCard(req.user.id, req.params.deckCardId, room_id);
    res.status(200).json({ status: 'success', message: 'Card played successfully.', data: { card } });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// Card Game Engine — Check Limits
// GET /user/deck/sends/limits
// Returns daily + active send limits so frontend can gate the send button.
// ─────────────────────────────────────────────────────────────
const getSendLimits = async (req, res, next) => {
  try {
    const { room_id } = req.query;
    // We allow room_id to be optional for backward compatibility, but UI sends it
    const limits = await deckService.getSendLimits(req.user.id, room_id);
    res.status(200).json({ status: 'success', data: limits });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// Card Game Engine — Send Card
// POST /user/deck/:deckCardId/send
// Body: { room_id, receiver_id, message? }
// ─────────────────────────────────────────────────────────────
const sendCard = async (req, res, next) => {
  try {
    const { room_id, receiver_id, message } = req.body;
    if (!room_id)     return res.status(400).json({ status: 'error', message: 'room_id is required.' });
    if (!receiver_id) return res.status(400).json({ status: 'error', message: 'receiver_id is required.' });

    const sendRecord = await deckService.sendCard(
      req.user.id, req.params.deckCardId, room_id, receiver_id, message
    );

    // Notify receiver in real-time
    emit(room_id, 'card_received', {
      send_id:     sendRecord.id,
      sender_id:   req.user.id,
      receiver_id,
      room_id,
      card: {
        name:              sendRecord.cards?.name,
        power_description: sendRecord.cards?.power_description,
        card_type:         sendRecord.cards?.card_type,
        category_name:     sendRecord.cards?.card_categories?.name,
        category_color:    sendRecord.cards?.card_categories?.theme_color,
      },
      message:          sendRecord.message || null,
      sent_at:          sendRecord.sent_at,
      respond_deadline: sendRecord.respond_deadline,
    });

    res.status(200).json({ status: 'success', message: 'Card sent to partner!', data: { send: sendRecord } });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// Card Game Engine — Accept Card (Receiver)
// PATCH /user/deck/sends/:sendId/accept
// ─────────────────────────────────────────────────────────────
const acceptCard = async (req, res, next) => {
  try {
    const result = await deckService.acceptCard(req.user.id, req.params.sendId);
    emit(result.room_id, 'card_accepted', {
      send_id:     result.id,
      receiver_id: req.user.id,
      accepted_at: result.accepted_at,
    });
    res.status(200).json({ status: 'success', message: 'Card accepted! It is now in progress.', data: { send: result } });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// Card Game Engine — Deflect Card (Receiver)
// PATCH /user/deck/sends/:sendId/deflect
// ─────────────────────────────────────────────────────────────
const deflectCard = async (req, res, next) => {
  try {
    const result = await deckService.deflectCard(req.user.id, req.params.sendId);
    emit(result.room_id, 'card_deflected', {
      send_id:      result.id,
      receiver_id:  req.user.id,
      deflected_at: result.deflected_at,
    });
    res.status(200).json({ status: 'success', message: 'Card deflected.', data: { send: result } });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// Card Game Engine — Mark Complete (Receiver)
// PATCH /user/deck/sends/:sendId/complete
// ─────────────────────────────────────────────────────────────
const markCardComplete = async (req, res, next) => {
  try {
    const result = await deckService.markCardComplete(req.user.id, req.params.sendId);
    emit(result.room_id, 'card_completed_by_receiver', {
      send_id:                 result.id,
      receiver_id:             req.user.id,
      completed_by_receiver_at: result.completed_by_receiver_at,
    });
    res.status(200).json({
      status:  'success',
      message: 'Marked as complete! Waiting for your partner to confirm.',
      data:    { send: result },
    });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// Card Game Engine — Confirm Completion (Sender)
// PATCH /user/deck/sends/:sendId/confirm
// ─────────────────────────────────────────────────────────────
const confirmCardComplete = async (req, res, next) => {
  try {
    const result = await deckService.confirmCardComplete(req.user.id, req.params.sendId);
    emit(result.room_id, 'card_confirmed', {
      send_id:      result.id,
      sender_id:    req.user.id,
      confirmed_at: result.confirmed_at,
    });
    res.status(200).json({ status: 'success', message: 'Card completed and confirmed! 🎉', data: { send: result } });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// Card Game Engine — Send Reminder (Receiver → Sender)
// POST /user/deck/sends/:sendId/reminder
// ─────────────────────────────────────────────────────────────
const sendReminder = async (req, res, next) => {
  try {
    const result = await deckService.sendReminder(req.user.id, req.params.sendId);
    emit(result.room_id, 'card_reminder', {
      send_id:     result.id,
      receiver_id: req.user.id,
      message:     'Your partner is waiting for you to confirm the card!',
    });
    res.status(200).json({ status: 'success', message: 'Reminder sent to your partner.' });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// Card Game Engine — Mark Seen (Receiver opens card)
// PATCH /user/deck/sends/:sendId/seen
// ─────────────────────────────────────────────────────────────
const markCardSeen = async (req, res, next) => {
  try {
    const result = await deckService.markCardSeen(req.user.id, req.params.sendId);
    emit(result.room_id, 'card_seen', {
      send_id:     result.id,
      receiver_id: req.user.id,
      seen_at:     result.seen_at,
    });
    res.status(200).json({ status: 'success', message: 'Card marked as seen.', data: { send: result } });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// Card Game Engine — Get Send History for a Room
// GET /user/deck/sends?room_id=...
// ─────────────────────────────────────────────────────────────
const getCardSendHistory = async (req, res, next) => {
  try {
    const { room_id } = req.query;
    if (!room_id) return res.status(400).json({ status: 'error', message: 'room_id is required.' });
    const sends = await deckService.getCardSendHistory(req.user.id, room_id);
    res.status(200).json({ status: 'success', data: { sends, total: sends.length } });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// DEFLECT CARD SYSTEM — Get Deflect Cards for Popup
// GET /user/deck/deflect-cards?room_id=...
// Returns all unused, unexpired deflect cards the user owns for this room.
// Frontend calls this to populate the deflect card list in the popup window.
// ─────────────────────────────────────────────────────────────
const getDeflectCards = async (req, res, next) => {
  try {
    const { room_id } = req.query;
    if (!room_id) return res.status(400).json({ status: 'error', message: 'room_id is required.' });
    const cards = await deflectService.getDeflectCards(req.user.id, room_id);
    res.status(200).json({ status: 'success', data: { deflect_cards: cards, total: cards.length } });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// DEFLECT CARD SYSTEM — Use a Deflect Card
// POST /user/deck/sends/:sendId/use-deflect
// Body: { deflect_deck_card_id }
//
// Automatically executes the card's deflect_action on the server:
//   CANCEL_ANY         → target card closed, no penalty
//   CANCEL_SENT_ONLY   → closes card only if still SENT
//   CANCEL_IN_PROGRESS → closes card only if IN_PROGRESS
//   CANCEL_IMMUNE      → closes card + blocks counter-deflect
//   REVERSE_ROLES      → cancels + re-sends with roles swapped
//   TIMEOUT            → extends deadline by +10 minutes
// ─────────────────────────────────────────────────────────────
const useDeflectCard = async (req, res, next) => {
  try {
    const { sendId }            = req.params;
    const { deflect_deck_card_id } = req.body;

    if (!sendId)               return res.status(400).json({ status: 'error', message: 'sendId param is required.' });
    if (!deflect_deck_card_id) return res.status(400).json({ status: 'error', message: 'deflect_deck_card_id is required.' });

    const result = await deflectService.useDeflectCard(req.user.id, sendId, deflect_deck_card_id);

    // ── Emit to room so both users see the result in real-time ──
    const io = getIo();
    if (io && result.room_id) {
      // Primary event — always emitted
      io.to(result.room_id).emit('deflect_card_used', {
        send_id:           result.original_send_id,
        deflect_action:    result.deflect_action,
        deflect_card_name: result.deflect_card_name,
        used_by:           result.used_by,
        outcome:           result.outcome,
        message:           result.message,
      });

      // Secondary event for REVERSE_ROLES — partner gets a new card send
      if (result.deflect_action === 'REVERSE_ROLES' && result.new_send_id) {
        io.to(result.room_id).emit('card_reversed', {
          original_send_id: result.original_send_id,
          new_send_id:      result.new_send_id,
          new_sender:       result.new_sender,
          new_receiver:     result.new_receiver,
          message:          result.message,
        });
      }

      // Secondary event for TIMEOUT — update deadline displays
      if (result.deflect_action === 'TIMEOUT') {
        io.to(result.room_id).emit('card_timeout_extended', {
          send_id:              result.original_send_id,
          new_respond_deadline: result.new_respond_deadline,
          new_penalty_deadline: result.new_penalty_deadline,
          message:              result.message,
        });
      }
    }

    res.status(200).json({ status: 'success', data: result });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// PENALTY 3: Reject a Card
// PATCH /user/deck/sends/:sendId/reject
// Receiver explicitly rejects a SENT/WAITING card.
// Triggers transfer of an asset (card) from receiver → sender.
// Emits: 'card_rejected' → both users in room
// ─────────────────────────────────────────────────────────────
const rejectCard = async (req, res, next) => {
  try {
    const result = await penaltyService.rejectCard(req.user.id, req.params.sendId);

    // Notify both users instantly
    emit(result.room_id || req.body.room_id, 'card_rejected', {
      send_id:          req.params.sendId,
      rejected_by:      req.user.id,
      message:          result.message,
      card_transferred: result.card_transferred,
    });

    res.status(200).json({ status: 'success', data: result });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────
// GET Penalty Log for a Room
// GET /user/deck/penalties?room_id=...
// Both users can see the penalty history for their room.
// ─────────────────────────────────────────────────────────────
const getPenaltyLog = async (req, res, next) => {
  try {
    const { room_id } = req.query;
    if (!room_id) return res.status(400).json({ status: 'error', message: 'room_id is required.' });
    const log = await penaltyService.getPenaltyLog(req.user.id, room_id);
    res.status(200).json({ status: 'success', data: { penalties: log, total: log.length } });
  } catch (e) { next(e); }
};

module.exports = {
  getUserDeck,
  getAvailableCards,
  playCard,
  getSendLimits,
  sendCard,
  acceptCard,
  deflectCard,
  markCardComplete,
  confirmCardComplete,
  sendReminder,
  markCardSeen,
  getCardSendHistory,
  // Deflect Card System
  getDeflectCards,
  useDeflectCard,
  // Penalty System
  rejectCard,
  getPenaltyLog,
};
