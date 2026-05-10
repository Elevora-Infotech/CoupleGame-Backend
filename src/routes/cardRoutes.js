const express = require('express');
const { getCatalog } = require('../controllers/cardController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();

// Ensure only authenticated users can access the game's premium card data
router.use(authenticate);

// GET /api/v1/cards/catalog - Fetches the full categorized list of cards
router.get('/catalog', getCatalog);

module.exports = router;
