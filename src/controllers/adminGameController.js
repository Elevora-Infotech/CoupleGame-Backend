'use strict';

const svc = require('../services/adminGameService');
const { sendSuccess, sendError } = require('../utils/response');

const getAllGames = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = '', search = '' } = req.query;
    const result = await svc.getAllGames({ page: +page, limit: +limit, status, search });
    sendSuccess(res, result, 'Games retrieved');
  } catch (e) { sendError(res, e.status || 500, e.message); }
};

const getGameStats = async (req, res) => {
  try {
    const stats = await svc.getGameStats();
    sendSuccess(res, { stats }, 'Game stats retrieved');
  } catch (e) { sendError(res, e.status || 500, e.message); }
};

const getGameById = async (req, res) => {
  try {
    const result = await svc.getGameById(req.params.roomId);
    sendSuccess(res, result, 'Game detail retrieved');
  } catch (e) { sendError(res, e.status || 500, e.message); }
};

const forceEndGame = async (req, res) => {
  try {
    const result = await svc.forceEndGame(req.params.roomId);
    sendSuccess(res, result, result.message);
  } catch (e) { sendError(res, e.status || 500, e.message); }
};

module.exports = { getAllGames, getGameStats, getGameById, forceEndGame };
