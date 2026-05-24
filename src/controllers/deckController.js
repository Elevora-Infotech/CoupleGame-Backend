'use strict';
const deckService = require('../services/deckService');
const { getIo }   = require('../services/socketService');

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
    const limits = await deckService.getSendLimits(req.user.id);
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
};
