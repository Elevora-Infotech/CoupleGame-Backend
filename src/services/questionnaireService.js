const { supabase } = require('../db/supabase');

/**
 * Fetch all active questions and their available options
 */
const getAllQuestions = async () => {
  const { data: questions, error } = await supabase
    .from('questions')
    .select(`
      id,
      text,
      input_type,
      order_index,
      question_options (
        id,
        option_text,
        order_index
      ),
      question_dependencies!child_question_id (
        parent_question_id,
        required_option_id
      )
    `)
    .eq('is_active', true)
    .order('order_index', { ascending: true });

  if (error) {
    const err = new Error(error.message);
    err.status = 400;
    throw err;
  }

  return questions;
};

/**
 * Submit or Update user answers (Upsert)
 */
const upsertUserAnswers = async (userId, answers) => {
  // answers is an array: [{ question_id, selected_option_id, text_value }, ...]
  
  const preparedAnswers = answers.map(answer => ({
    user_id: userId,
    question_id: answer.question_id,
    selected_option_id: answer.selected_option_id || null,
    text_value: answer.text_value || null,
    updated_at: new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from('user_answers')
    .upsert(preparedAnswers, { 
      onConflict: 'user_id, question_id' 
    })
    .select();

  if (error) {
    const err = new Error(error.message);
    err.status = 400;
    throw err;
  }

  return data;
};

/**
 * Get User's already submitted answers
 */
const getUserAnswers = async (userId) => {
  const { data, error } = await supabase
    .from('user_answers')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    const err = new Error(error.message);
    err.status = 400;
    throw err;
  }

  return data;
};

module.exports = {
  getAllQuestions,
  upsertUserAnswers,
  getUserAnswers
};
