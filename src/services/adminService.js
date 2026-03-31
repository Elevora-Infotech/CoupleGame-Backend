const { supabase } = require('../db/supabase');

/**
 * Get overall system stats for the dashboard
 */
const getStats = async () => {
  // 1. Total Users
  const { count: usersCount, error: usersError } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  // 2. Total Completed Questionnaires (Approximate)
  const { count: answersCount, error: answersError } = await supabase
    .from('user_answers')
    .select('user_id', { count: 'exact', head: true });

  if (usersError || answersError) {
    const err = new Error('Error fetching stats.');
    err.status = 400;
    throw err;
  }

  return {
    totalUsers: usersCount || 0,
    activeSessions: answersCount || 0, // Simplified for this example
    lastUpdated: new Date().toISOString()
  };
};

/**
 * Admin: Create a new question
 */
const createQuestion = async (questionData) => {
  const { text, input_type, options } = questionData;

  // Insert Question
  const { data: question, error: qError } = await supabase
    .from('questions')
    .insert([{ text, input_type }])
    .select()
    .single();

  if (qError) throw qError;

  // Insert Options if provided
  if (options && Array.isArray(options)) {
    const preparedOptions = options.map((opt, index) => ({
      question_id: question.id,
      option_text: opt,
      order_index: index
    }));

    const { error: oError } = await supabase
      .from('question_options')
      .insert(preparedOptions);

    if (oError) throw oError;
  }

  return question;
};

module.exports = {
  getStats,
  createQuestion
};
