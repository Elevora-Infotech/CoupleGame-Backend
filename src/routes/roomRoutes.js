const express = require('express');
const { createRoom, joinRoom, getActiveRoom, coinFlip } = require('../controllers/roomController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticate);

router.post('/create', createRoom);
router.post('/join', joinRoom);
router.get('/active', getActiveRoom);
router.post('/coin-flip', coinFlip);

module.exports = router;
