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

const getAllQuestions = async () => {
  const { data, error } = await supabase
    .from('questions')
    .select('*, options:question_options(*)');

  if (error) throw error;
  return data;
};

const updateQuestion = async (id, data) => {
  const { text, input_type, is_active } = data;
  const { data: question, error } = await supabase
    .from('questions')
    .update({ text, input_type, is_active })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return question;
};

const softDeleteQuestion = async (id) => {
  const { data, error } = await supabase
    .from('questions')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Admin: Card Categories Management
 */
const createCategory = async (data) => {
  const { name, description, theme_color, icon_url, order_index } = data;
  const { data: category, error } = await supabase
    .from('card_categories')
    .insert([{ name, description, theme_color, icon_url, order_index }])
    .select()
    .single();

  if (error) throw error;
  return category;
};

const updateCategory = async (id, data) => {
  const { name, description, theme_color, icon_url, order_index, is_active } = data;
  const { data: category, error } = await supabase
    .from('card_categories')
    .update({ name, description, theme_color, icon_url, order_index, is_active })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return category;
};

const softDeleteCategory = async (id) => {
  const { data, error } = await supabase
    .from('card_categories')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Admin: Cards Management
 */
const createCard = async (data) => {
  const { category_id, name, power_description, image_url, attributes, card_type } = data;
  const { data: card, error } = await supabase
    .from('cards')
    .insert([{ category_id, name, power_description, image_url, attributes, card_type }])
    .select()
    .single();

  if (error) throw error;
  return card;
};

const updateCard = async (id, data) => {
  const { category_id, name, power_description, image_url, attributes, card_type, is_active } = data;
  const { data: card, error } = await supabase
    .from('cards')
    .update({ category_id, name, power_description, image_url, attributes, card_type, is_active })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return card;
};

const softDeleteCard = async (id) => {
  const { data, error } = await supabase
    .from('cards')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Admin: Get all card categories (lightweight list)
 */
const getAllCategories = async () => {
  const { data, error } = await supabase
    .from('card_categories')
    .select('id, name, description, theme_color, icon_url, order_index, is_active, created_at')
    .order('order_index', { ascending: true });

  if (error) throw error;
  return data;
};

/**
 * Admin: Get all cards with their category name (for bundle card picker)
 */
const getAllCards = async () => {
  const { data, error } = await supabase
    .from('cards')
    .select('id, name, card_type, power_description, is_active, card_categories(id, name, theme_color)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

/**
 * Admin: Get just the pricing plans for one bundle (lightweight — no cards)
 */
const getBundlePlans = async (bundleId) => {
  const { data, error } = await supabase
    .from('bundle_plans')
    .select('id, name, price, card_count, is_active, created_at')
    .eq('bundle_id', bundleId)
    .order('price', { ascending: true });

  if (error) throw error;
  return data;
};

/**
 * Admin: Get just the cards inside one bundle (lightweight — no plans)
 */
const getBundleCards = async (bundleId) => {
  const { data, error } = await supabase
    .from('bundle_cards')
    .select('id, added_at, cards(id, name, card_type, power_description, is_active, card_categories(name, theme_color))')
    .eq('bundle_id', bundleId);

  if (error) throw error;
  return data.map((bc) => ({ bundle_card_id: bc.id, added_at: bc.added_at, ...bc.cards }));
};

/**
 * Admin: Get a single pricing plan by ID (for pre-filling the edit form)
 */
const getPlanById = async (planId) => {
  const { data, error } = await supabase
    .from('bundle_plans')
    .select('id, bundle_id, name, price, card_count, is_active, created_at')
    .eq('id', planId)
    .single();

  if (error) {
    const err = new Error('Plan not found.');
    err.status = 404;
    throw err;
  }
  return data;
};

module.exports = {
  getStats,
  createQuestion,
  getAllQuestions,
  updateQuestion,
  softDeleteQuestion,
  createCategory,
  getAllCategories,
  updateCategory,
  softDeleteCategory,
  createCard,
  getAllCards,
  updateCard,
  softDeleteCard,
  getBundlePlans,
  getBundleCards,
  getPlanById,
};
