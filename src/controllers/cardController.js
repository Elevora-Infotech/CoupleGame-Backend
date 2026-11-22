const cardService = require('../services/cardService');

const getAllCards = async (req, res, next) => {
  try {
    const cards = await cardService.getAllCards();
    res.status(200).json({
      status: 'success',
      data: { cards }
    });
  } catch (error) {
    next(error);
  }
};

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

const getCategories = async (req, res, next) => {
  try {
    const categories = await cardService.getCategories();
    res.status(200).json({
      status: 'success',
      data: { categories }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCatalog,
  getAllCards,
  getCategories,
};
