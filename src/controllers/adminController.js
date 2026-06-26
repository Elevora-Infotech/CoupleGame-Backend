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

const getAllQuestions = async (req, res, next) => {
  try {
    const questions = await adminService.getAllQuestions();
    res.status(200).json({ status: 'success', data: { questions } });
  } catch (error) { next(error); }
};

const updateQuestion = async (req, res, next) => {
  try {
    const question = await adminService.updateQuestion(req.params.id, req.body);
    res.status(200).json({ status: 'success', data: { question } });
  } catch (error) { next(error); }
};

const deleteQuestion = async (req, res, next) => {
  try {
    const question = await adminService.softDeleteQuestion(req.params.id);
    res.status(200).json({ status: 'success', message: 'Question soft-deleted successfully', data: { question } });
  } catch (error) { next(error); }
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


// ── Lightweight Read-Only Controllers ────────────────────────────────────

const getAllCategories = async (req, res, next) => {
  try {
    const categories = await adminService.getAllCategories();
    res.status(200).json({ status: 'success', data: { categories } });
  } catch (error) { next(error); }
};

const getAllCards = async (req, res, next) => {
  try {
    const { search, card_type, category_id, deflect_only, is_active } = req.query;
    const cards = await adminService.getAllCards({ search, card_type, category_id, deflect_only, is_active });
    res.status(200).json({ status: 'success', data: { cards } });
  } catch (error) { next(error); }
};

const getCardById = async (req, res, next) => {
  try {
    const card = await adminService.getCardById(req.params.id);
    res.status(200).json({ status: 'success', data: { card } });
  } catch (error) { next(error); }
};

const toggleCardActive = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    const card = await adminService.toggleCardActive(req.params.id, is_active);
    res.status(200).json({ status: 'success', data: { card } });
  } catch (error) { next(error); }
};

const getCardStats = async (req, res, next) => {
  try {
    const stats = await adminService.getCardStats();
    res.status(200).json({ status: 'success', data: { stats } });
  } catch (error) { next(error); }
};

const getBundlePlans = async (req, res, next) => {
  try {
    const plans = await adminService.getBundlePlans(req.params.id);
    res.status(200).json({ status: 'success', data: { plans } });
  } catch (error) { next(error); }
};

const getBundleCards = async (req, res, next) => {
  try {
    const cards = await adminService.getBundleCards(req.params.id);
    res.status(200).json({ status: 'success', data: { cards } });
  } catch (error) { next(error); }
};

const getPlanById = async (req, res, next) => {
  try {
    const plan = await adminService.getPlanById(req.params.planId);
    res.status(200).json({ status: 'success', data: { plan } });
  } catch (error) { next(error); }
};

module.exports = {
  getDashboardStats,
  createNewQuestion,
  getAllQuestions,
  updateQuestion,
  deleteQuestion,
  createCardCategory,
  getAllCategories,
  updateCardCategory,
  deleteCardCategory,
  createCard,
  getAllCards,
  getCardById,
  updateCard,
  deleteCard,
  toggleCardActive,
  getCardStats,
  getBundlePlans,
  getBundleCards,
  getPlanById,
};

