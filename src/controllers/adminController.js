const adminService = require('../services/adminService');

/**
 * Get dashboard overview stats
 * Protected by: adminProtect middleware
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const stats = await adminService.getStats();
    
    res.status(200).json({
      status: 'success',
      data: { stats }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Create a new game question
 */
const createNewQuestion = async (req, res, next) => {
  try {
    const { text, input_type, options } = req.body;
    
    if (!text) {
      const err = new Error('Question text is required.');
      err.status = 400;
      throw err;
    }

    const question = await adminService.createQuestion({ text, input_type, options });
    
    res.status(201).json({
      status: 'success',
      message: 'Question created successfully',
      data: { question }
    });
  } catch (error) {
    next(error);
  }
};

const createCardCategory = async (req, res, next) => {
  try {
    const category = await adminService.createCategory(req.body);
    res.status(201).json({ status: 'success', data: { category } });
  } catch (error) { next(error); }
};

const updateCardCategory = async (req, res, next) => {
  try {
    const category = await adminService.updateCategory(req.params.id, req.body);
    res.status(200).json({ status: 'success', data: { category } });
  } catch (error) { next(error); }
};

const deleteCardCategory = async (req, res, next) => {
  try {
    const category = await adminService.softDeleteCategory(req.params.id);
    res.status(200).json({ status: 'success', message: 'Category soft-deleted successfully', data: { category } });
  } catch (error) { next(error); }
};

const createCard = async (req, res, next) => {
  try {
    const card = await adminService.createCard(req.body);
    res.status(201).json({ status: 'success', data: { card } });
  } catch (error) { next(error); }
};

const updateCard = async (req, res, next) => {
  try {
    const card = await adminService.updateCard(req.params.id, req.body);
    res.status(200).json({ status: 'success', data: { card } });
  } catch (error) { next(error); }
};

const deleteCard = async (req, res, next) => {
  try {
    const card = await adminService.softDeleteCard(req.params.id);
    res.status(200).json({ status: 'success', message: 'Card soft-deleted successfully', data: { card } });
  } catch (error) { next(error); }
};

module.exports = {
  getDashboardStats,
  createNewQuestion,
  createCardCategory,
  updateCardCategory,
  deleteCardCategory,
  createCard,
  updateCard,
  deleteCard
};
