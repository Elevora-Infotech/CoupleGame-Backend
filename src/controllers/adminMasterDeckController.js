'use strict';
const svc = require('../services/adminMasterDeckService');

// GET /admin/master-decks
const getAllMasterDecks = async (req, res, next) => {
  try {
    const decks = await svc.getAllMasterDecks();
    res.json({ status: 'success', data: { decks, total: decks.length } });
  } catch (e) { next(e); }
};

// GET /admin/master-decks/:deckId
const getMasterDeckById = async (req, res, next) => {
  try {
    const deck = await svc.getMasterDeckById(req.params.deckId);
    res.json({ status: 'success', data: { deck } });
  } catch (e) { next(e); }
};

// PUT /admin/master-decks/:deckId
// Body: { name?, description?, is_active? }
const updateMasterDeck = async (req, res, next) => {
  try {
    const deck = await svc.updateMasterDeck(req.params.deckId, req.body);
    res.json({ status: 'success', message: 'Master deck updated.', data: { deck } });
  } catch (e) { next(e); }
};

// POST /admin/master-decks/:deckId/cards
// Body: { card_id }
const addCardToMasterDeck = async (req, res, next) => {
  try {
    const { card_id } = req.body;
    if (!card_id) return res.status(400).json({ status: 'error', message: 'card_id is required.' });
    const result = await svc.addCardToMasterDeck(req.params.deckId, card_id, req.admin?.id);
    res.status(result.already_exists ? 200 : 201).json({ status: 'success', data: result });
  } catch (e) { next(e); }
};

// DELETE /admin/master-decks/:deckId/cards/:masterDeckCardId
const removeCardFromMasterDeck = async (req, res, next) => {
  try {
    const result = await svc.removeCardFromMasterDeck(req.params.deckId, req.params.masterDeckCardId);
    res.json({ status: 'success', data: result });
  } catch (e) { next(e); }
};

// GET /admin/master-decks/:deckId/stats
const getMasterDeckStats = async (req, res, next) => {
  try {
    const stats = await svc.getMasterDeckStats(req.params.deckId);
    res.json({ status: 'success', data: { stats } });
  } catch (e) { next(e); }
};

module.exports = {
  getAllMasterDecks,
  getMasterDeckById,
  updateMasterDeck,
  addCardToMasterDeck,
  removeCardFromMasterDeck,
  getMasterDeckStats,
};
