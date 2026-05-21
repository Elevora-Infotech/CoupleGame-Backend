'use strict';
const deckService = require('../services/deckService');

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

module.exports = { getUserDeck, getAvailableCards, playCard };
