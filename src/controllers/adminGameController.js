'use strict';

const svc = require('../services/adminGameService');
const { sendSuccess, sendError } = require('../utils/response');

const getAllGames = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', search = '' } = req.query;
    const result = await svc.getAllGames({ page: +page, limit: +limit, status, search });
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
    sendSuccess(res, 200, 'Game detail retrieved', result);
  } catch (e) { sendError(res, e.status || 500, e.message); }
};

const forceEndGame = async (req, res) => {
  try {
    const result = await svc.forceEndGame(req.params.roomId);
    sendSuccess(res, 200, result.message, result);
  } catch (e) { sendError(res, e.status || 500, e.message); }
};

module.exports = { getAllGames, getGameStats, getGameById, forceEndGame };

