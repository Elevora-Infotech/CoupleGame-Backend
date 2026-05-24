'use strict';
const deckService = require('../services/deckService');
const { getIo }   = require('../services/socketService');

const getUserDeck = async (req, res, next) => {
  try {
    const cards = await deckService.getUserDeck(req.user.id);
    res.status(200).json({ status: 'success', data: { cards, total: cards.length } });
  } catch (error) { next(error); }
};

const getAvailableCards = async (req, res, next) => {
  try {
    const { room_id } = req.query;
    if (!room_id) return res.status(400).json({ status: 'error', message: 'room_id query param is required.' });
    const cards = await deckService.getAvailableCards(req.user.id, room_id);
    res.status(200).json({ status: 'success', data: { cards, total: cards.length } });
  } catch (error) { next(error); }
};

const playCard = async (req, res, next) => {
  try {
    const { room_id } = req.body;
    if (!room_id) return res.status(400).json({ status: 'error', message: 'room_id is required.' });
    const card = await deckService.playCard(req.user.id, req.params.deckCardId, room_id);
    res.status(200).json({ status: 'success', message: 'Card played successfully.', data: { card } });
  } catch (error) { next(error); }
};

/**
 * POST /api/v1/user/deck/:deckCardId/send
 * Send a card from your deck to your partner in the room.
 * Body: { room_id, receiver_id, message? }
 */
const sendCard = async (req, res, next) => {
  try {
    const { room_id, receiver_id, message } = req.body;

    if (!room_id)     return res.status(400).json({ status: 'error', message: 'room_id is required.' });
    if (!receiver_id) return res.status(400).json({ status: 'error', message: 'receiver_id is required.' });

    const sendRecord = await deckService.sendCard(
      req.user.id,
      req.params.deckCardId,
      room_id,
      receiver_id,
      message
    );

    // Emit real-time event to the receiver via Socket.io
    // Frontend listens for 'card_received' event
    try {
      const io = getIo();
      io.to(room_id).emit('card_received', {
        send_id:      sendRecord.id,
        sender_id:    req.user.id,
        receiver_id:  receiver_id,
        room_id:      room_id,
        card: {
          id:                sendRecord.cards?.id,
          name:              sendRecord.cards?.name,
          power_description: sendRecord.cards?.power_description,
          card_type:         sendRecord.cards?.card_type,
          category_name:     sendRecord.cards?.card_categories?.name,
          category_color:    sendRecord.cards?.card_categories?.theme_color,
        },
        message:   sendRecord.message || null,
        sent_at:   sendRecord.sent_at,
      });
    } catch (socketErr) {
      // Socket failure should not block the HTTP response
      console.error('[sendCard] Socket emit failed:', socketErr.message);
    }

    res.status(200).json({
      status:  'success',
      message: 'Card sent to partner!',
      data:    { send: sendRecord },
    });
  } catch (error) { next(error); }
};

/**
 * PATCH /api/v1/user/deck/sends/:sendId/seen
 * Receiver marks a sent card as seen.
 */
const markCardSeen = async (req, res, next) => {
  try {
    const result = await deckService.markCardSeen(req.user.id, req.params.sendId);

    // Notify sender that their card was seen
    try {
      const io = getIo();
      io.to(result.room_id).emit('card_seen', {
        send_id:     result.id,
        receiver_id: req.user.id,
        seen_at:     result.seen_at,
      });
    } catch (socketErr) {
      console.error('[markCardSeen] Socket emit failed:', socketErr.message);
    }

    res.status(200).json({ status: 'success', message: 'Card marked as seen.', data: { send: result } });
  } catch (error) { next(error); }
};

/**
 * GET /api/v1/user/deck/sends?room_id=...
 * Get all card sends (sent and received) for a room.
 */
const getCardSendHistory = async (req, res, next) => {
  try {
    const { room_id } = req.query;
    if (!room_id) return res.status(400).json({ status: 'error', message: 'room_id is required.' });
    const sends = await deckService.getCardSendHistory(req.user.id, room_id);
    res.status(200).json({ status: 'success', data: { sends, total: sends.length } });
  } catch (error) { next(error); }
};

module.exports = {
  getUserDeck,
  getAvailableCards,
  playCard,
  sendCard,
  markCardSeen,
  getCardSendHistory,
};
