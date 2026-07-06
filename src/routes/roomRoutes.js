const express = require('express');
const { createRoom, joinRoom, getActiveRoom, coinFlip, leaveRoom, getRoomHistory } = require('../controllers/roomController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticate);

router.post('/create', createRoom);
router.post('/join', joinRoom);
router.get('/active', getActiveRoom);
router.get('/history', getRoomHistory);
router.post('/coin-flip', coinFlip);
router.post('/leave', leaveRoom);

module.exports = router;
