'use strict';
const express          = require('express');
const router           = express.Router();
const ctrl             = require('../controllers/adminGameController');
const { adminProtect } = require('../middlewares/adminMiddleware');
const { requireCategory, ACTION_CATEGORIES } = require('../middlewares/adminRbac');

router.use(adminProtect);

/** GET  /api/v1/admin/games/stats            — KPI summary */
router.get('/games/stats', ctrl.getGameStats);

/** GET  /api/v1/admin/games                  — Paginated list, filterable by status/search */
router.get('/games', ctrl.getAllGames);

/** GET  /api/v1/admin/games/:roomId          — Full game detail */
router.get('/games/:roomId', ctrl.getGameById);

/** POST /api/v1/admin/games/:roomId/force-end — Force-close an active game (ADMIN ONLY) */
router.post('/games/:roomId/force-end', requireCategory(ACTION_CATEGORIES.SYSTEM_CONTROLS), ctrl.forceEndGame);

module.exports = router;
