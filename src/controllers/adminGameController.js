'use strict';

const svc = require('../services/adminGameService');
const { sendSuccess, sendError } = require('../utils/response');
const { stripPrivateCardNotes } = require('../utils/privacyMasker');

const getAllGames = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', search = '', type = '', end_reason = '' } = req.query;
    const result = await svc.getAllGames({ page: +page, limit: +limit, status, search, type, end_reason });
    
    // Privacy sanitization: strip any private dare notes in game feeds
    if (result && Array.isArray(result.games)) {
      result.games = result.games.map(game => {
        if (game.recent_activity && Array.isArray(game.recent_activity)) {
          game.recent_activity = game.recent_activity.map(stripPrivateCardNotes);
        }
        return game;
      });
    }

    sendSuccess(res, 200, 'Games retrieved', result);
  } catch (e) { sendError(res, e.status || 500, e.message); }
};

const getGameStats = async (req, res) => {
  try {
    const stats = await svc.getGameStats();
    sendSuccess(res, 200, 'Game stats retrieved', { stats });
  } catch (e) { sendError(res, e.status || 500, e.message); }
};

const getGameById = async (req, res) => {
  try {
    const result = await svc.getGameById(req.params.roomId);
    
    // Privacy sanitization: partner notes never visible in panel
    if (result && result.timeline && Array.isArray(result.timeline)) {
      result.timeline = result.timeline.map(stripPrivateCardNotes);
    }
    if (result && result.active_cards && Array.isArray(result.active_cards)) {
      result.active_cards = result.active_cards.map(stripPrivateCardNotes);
    }

    sendSuccess(res, 200, 'Game detail retrieved', result);
  } catch (e) { sendError(res, e.status || 500, e.message); }
};

const forceEndGame = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return sendError(res, 400, 'A specific business reason (minimum 5 characters) is required to force-end a game.');
    }

    const result = await svc.forceEndGame(req.params.roomId, {
      admin: req.admin,
      reason: reason.trim(),
    });

    sendSuccess(res, 200, result.message, result);
  } catch (e) { sendError(res, e.status || 500, e.message); }
};

module.exports = { getAllGames, getGameStats, getGameById, forceEndGame };
