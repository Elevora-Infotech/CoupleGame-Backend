'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminUserController');
const { adminProtect } = require('../middlewares/adminMiddleware');

router.use(adminProtect);

/** GET /api/v1/admin/users/stats — User growth stats (DAU, new users, blocked count) */
router.get('/stats', ctrl.getUserGrowthStats);

/** GET /api/v1/admin/users?page=1&limit=20&search=...&status=active|blocked — Paginated list */
router.get('/', ctrl.getAllUsers);

/** GET /api/v1/admin/users/:id — Full user detail with game history and stats */
router.get('/:id', ctrl.getUserById);

/** PATCH /api/v1/admin/users/:id/block — Block a user */
router.patch('/:id/block', ctrl.blockUser);

/** PATCH /api/v1/admin/users/:id/unblock — Unblock a user */
router.patch('/:id/unblock', ctrl.unblockUser);

/** POST /api/v1/admin/users/:id/reset-room — Force close active room + expire all cards */
router.post('/:id/reset-room', ctrl.resetUserRoom);

module.exports = router;
