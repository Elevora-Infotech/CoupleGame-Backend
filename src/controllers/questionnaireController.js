const questionnaireService = require('../services/questionnaireService');

/**
 * Get all available onboarding questions
 */
const getQuestions = async (req, res, next) => {
  try {
    const questions = await questionnaireService.getAllQuestions();
    
    res.status(200).json({
      status: 'success',
      data: { questions }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit multiple answers at once (Upsert)
 */
const submitAnswers = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { answers } = req.body; // Array of objects
    
    if (!answers || !Array.isArray(answers)) {
      const err = new Error('Answers must be an array.');
      err.status = 400;
      throw err;
    }

    const savedAnswers = await questionnaireService.upsertUserAnswers(userId, answers);
    
    res.status(200).json({
      status: 'success',
      message: 'Answers submitted successfully.',
      data: { answers: savedAnswers }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user's submitted answers
 */
const getMyAnswers = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const answers = await questionnaireService.getUserAnswers(userId);
    
    res.status(200).json({
      status: 'success',
      data: { answers }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getQuestions,
  submitAnswers,
  getMyAnswers
};
