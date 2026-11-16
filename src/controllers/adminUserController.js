'use strict';
const adminUserService = require('../services/adminUserService');
const { sanitizeUserForList, sanitizeUserForDetail } = require('../utils/privacyMasker');
const { logAdminAction } = require('../services/adminAuditService');

// GET /admin/users?page=1&limit=20&search=...&status=active|blocked
const getAllUsers = async (req, res, next) => {
  try {
    const { page, limit, search, status } = req.query;
    const result = await adminUserService.getAllUsers({ page, limit, search, status });
    
    // Privacy Masking (Part B1): Phone numbers masked everywhere; emails masked in list view
    if (result && Array.isArray(result.users)) {
      result.users = result.users.map(sanitizeUserForList);
    }

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
    
    // Privacy Masking (Part B1): "Email shown only on player screen." Phone masked.
    if (result && result.user) {
      result.user = sanitizeUserForDetail(result.user);
    }

    res.status(200).json({ status: 'success', data: result });
  } catch (e) { next(e); }
};

// PATCH /admin/users/:id/block
const blockUser = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({
        status: 'error',
        code: 'MANDATORY_REASON_REQUIRED',
        message: 'A specific business reason (minimum 5 characters) is required to block an account.',
      });
    }

    const user = await adminUserService.setUserBlockStatus(req.params.id, true);

    try {
      await logAdminAction({
        adminId: req.admin?.id,
        adminName: req.admin?.name,
        role: req.admin?.role,
        actionType: 'BLOCK_USER',
        targetEntity: 'player',
        targetId: req.params.id,
        beforeState: { is_blocked: false },
        afterState: { is_blocked: true },
        reason: reason.trim(),
      });
    } catch (auditErr) {
      console.warn('[AdminUserController] Audit write warning:', auditErr.message);
    }

    res.status(200).json({ status: 'success', message: 'User has been blocked.', data: { user } });
  } catch (e) { next(e); }
};

// PATCH /admin/users/:id/unblock
const unblockUser = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({
        status: 'error',
        code: 'MANDATORY_REASON_REQUIRED',
        message: 'A specific business reason (minimum 5 characters) is required to unblock an account.',
      });
    }

    const user = await adminUserService.setUserBlockStatus(req.params.id, false);

    try {
      await logAdminAction({
        adminId: req.admin?.id,
        adminName: req.admin?.name,
        role: req.admin?.role,
        actionType: 'UNBLOCK_USER',
        targetEntity: 'player',
        targetId: req.params.id,
        beforeState: { is_blocked: true },
        afterState: { is_blocked: false },
        reason: reason.trim(),
      });
    } catch (auditErr) {
      console.warn('[AdminUserController] Audit write warning:', auditErr.message);
    }

    res.status(200).json({ status: 'success', message: 'User has been unblocked.', data: { user } });
  } catch (e) { next(e); }
};

// POST /admin/users/:id/reset-room (Close a stuck room)
const resetUserRoom = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({
        status: 'error',
        code: 'MANDATORY_REASON_REQUIRED',
        message: 'A specific reason (minimum 5 characters) is required to close a stuck room.',
      });
    }

    const result = await adminUserService.resetUserRoom(req.params.id);

    try {
      await logAdminAction({
        adminId: req.admin?.id,
        adminName: req.admin?.name,
        role: req.admin?.role,
        actionType: 'CLOSE_STUCK_ROOM',
        targetEntity: 'room',
        targetId: result.room?.code || req.params.id,
        afterState: { status: 'CLOSED', closed_reason: 'stuck_room_reset' },
        reason: reason.trim(),
      });
    } catch (auditErr) {
      console.warn('[AdminUserController] Audit write warning:', auditErr.message);
    }

    res.status(200).json({ status: 'success', message: result.message, data: { room: result.room } });
  } catch (e) { next(e); }
};

module.exports = { getAllUsers, getUserGrowthStats, getUserById, blockUser, unblockUser, resetUserRoom };
