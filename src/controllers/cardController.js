const cardService = require('../services/cardService');

/**
 * Fetch the entire organized catalog of card categories and cards.
 * Formatted perfectly for CSS rendering on the frontend.
 */
const getCatalog = async (req, res, next) => {
  try {
    const catalog = await cardService.getCatalog();
    
    res.status(200).json({
      status: 'success',
      data: { catalog }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCatalog
};
