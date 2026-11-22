const express = require('express');
const { getCatalog, getAllCards, getCategories } = require('../controllers/cardController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();

// Ensure only authenticated users can access the game's premium card data
router.use(authenticate);

// GET /api/v1/cards/categories - Lightweight list of all card categories with icon_url
router.get('/categories', getCategories);

// GET /api/v1/cards - Master list of all cards
router.get('/', getAllCards);

// GET /api/v1/cards/catalog - Fetches the full categorized list of cards
router.get('/catalog', getCatalog);

module.exports = router;
