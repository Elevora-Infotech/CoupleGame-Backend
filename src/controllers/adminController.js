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

module.exports = {
  getDashboardStats,
  createNewQuestion
};
