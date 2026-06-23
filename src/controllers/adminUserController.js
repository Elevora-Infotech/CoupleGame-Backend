'use strict';
const adminUserService = require('../services/adminUserService');

// GET /admin/users?page=1&limit=20&search=...&status=active|blocked
const getAllUsers = async (req, res, next) => {
  try {
    const { page, limit, search, status } = req.query;
    const result = await adminUserService.getAllUsers({ page, limit, search, status });
    res.status(200).json({ status: 'success', data: result });
  } catch (e) { next(e); }
};

// GET /admin/users/stats
const getUserGrowthStats = async (req, res, next) => {
  try {
    const stats = await adminUserService.getUserGrowthStats();
    res.status(200).json({ status: 'success', data: { stats } });
  } catch (e) { next(e); }
};

// GET /admin/users/:id
const getUserById = async (req, res, next) => {
  try {
    const result = await adminUserService.getUserById(req.params.id);
    res.status(200).json({ status: 'success', data: result });
  } catch (e) { next(e); }
};

// PATCH /admin/users/:id/block
const blockUser = async (req, res, next) => {
  try {
    const user = await adminUserService.setUserBlockStatus(req.params.id, true);
    res.status(200).json({ status: 'success', message: 'User has been blocked.', data: { user } });
  } catch (e) { next(e); }
};

// PATCH /admin/users/:id/unblock
const unblockUser = async (req, res, next) => {
  try {
    const user = await adminUserService.setUserBlockStatus(req.params.id, false);
    res.status(200).json({ status: 'success', message: 'User has been unblocked.', data: { user } });
  } catch (e) { next(e); }
};

// POST /admin/users/:id/reset-room
const resetUserRoom = async (req, res, next) => {
  try {
    const result = await adminUserService.resetUserRoom(req.params.id);
    res.status(200).json({ status: 'success', message: result.message, data: { room: result.room } });
  } catch (e) { next(e); }
};

module.exports = { getAllUsers, getUserGrowthStats, getUserById, blockUser, unblockUser, resetUserRoom };
