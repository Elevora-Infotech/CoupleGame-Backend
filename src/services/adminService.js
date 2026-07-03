const { supabase } = require('../db/supabase');

/**
 * Get overall system stats for the dashboard
 */
const getStats = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  // Run all counts in parallel for performance
  const [
    { count: totalUsers },
    { count: newUsersToday },
    { count: dau },
    { count: activeRooms },
    { count: completedRooms },
    { count: totalCardsPlayed },
    { count: totalPenalties }
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', todayStr),
    supabase.from('users').select('*', { count: 'exact', head: true }).gte('updated_at', todayStr),
    supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('status', 'COMPLETED'),
    supabase.from('room_card_sends').select('*', { count: 'exact', head: true }),
    supabase.from('penalty_log').select('*', { count: 'exact', head: true })
  ]);

  const totalGames = (activeRooms || 0) + (completedRooms || 0);
  const avgCardsPlayed = totalGames > 0 ? ((totalCardsPlayed || 0) / totalGames).toFixed(1) : 0;
  const avgPenalties = totalGames > 0 ? ((totalPenalties || 0) / totalGames).toFixed(1) : 0;

  return {
    totalUsers: totalUsers || 0,
    newUsersToday: newUsersToday || 0,
    dau: dau || 0,
    activeSessions: activeRooms || 0,
    completedGames: completedRooms || 0,
    avgCardsPlayed: Number(avgCardsPlayed),
    avgPenalties: Number(avgPenalties),
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
const getAllCards = async ({ search = '', card_type = '', category_id = '', deflect_only = false, is_active = '' } = {}) => {
  let query = supabase
    .from('cards')
    .select('id, name, card_type, power_description, image_url, deflect_action, is_active, created_at, card_categories(id, name, theme_color)')
    .order('created_at', { ascending: false });

  if (search)      query = query.ilike('name', `%${search}%`);
  if (card_type)   query = query.eq('card_type', card_type);
  if (category_id) query = query.eq('category_id', category_id);
  if (deflect_only === 'true' || deflect_only === true) query = query.not('deflect_action', 'is', null);
  if (is_active === 'true')  query = query.eq('is_active', true);
  if (is_active === 'false') query = query.eq('is_active', false);

  const { data, error } = await query;
  if (error) throw error;
  return data;
};

const getCardById = async (id) => {
  const { data, error } = await supabase
    .from('cards')
    .select('id, name, card_type, power_description, image_url, deflect_action, is_active, created_at, card_categories(id, name, theme_color)')
    .eq('id', id)
    .single();
  if (error) { const e = new Error('Card not found.'); e.status = 404; throw e; }
  return data;
};

const toggleCardActive = async (id, is_active) => {
  const { data, error } = await supabase
    .from('cards')
    .update({ is_active })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

const getCardStats = async () => {
  const [{ count: total }, { count: active }, { count: deflect }] = await Promise.all([
    supabase.from('cards').select('id', { count: 'exact', head: true }),
    supabase.from('cards').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('cards').select('id', { count: 'exact', head: true }).not('deflect_action', 'is', null),
  ]);
  const { data: cats } = await supabase.from('card_categories').select('id', { count: 'exact', head: true }).eq('is_active', true);
  return { total: total||0, active: active||0, inactive: (total||0)-(active||0), deflect_cards: deflect||0 };
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

  // Fetch store_product_id for each plan from store_products table
  // We pick the 'android' platform row (same string as ios — auto-generated)
  const planIds = (data || []).map(p => p.id);
  let productMap = {};
  if (planIds.length > 0) {
    const { data: products } = await supabase
      .from('store_products')
      .select('plan_id, store_product_id')
      .in('plan_id', planIds)
      .eq('platform', 'android');
    (products || []).forEach(p => { productMap[p.plan_id] = p.store_product_id; });
  }

  return (data || []).map(plan => ({
    ...plan,
    store_product_id: productMap[plan.id] || null,
  }));
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

/**
 * Get card performance analytics
 */
const getCardPerformanceAnalytics = async () => {
  const { data, error } = await supabase.rpc('get_card_performance_analytics');
  if (error) throw error;
  return data;
};

/**
 * Get relationship dynamics analytics
 */
const getRelationshipDynamics = async () => {
  const { data, error } = await supabase.rpc('get_relationship_dynamics');
  if (error) throw error;
  return data;
};

/**
 * Get Growth Analytics (Funnel, Retention, Dropoff)
 */
const getGrowthAnalytics = async () => {
  const { data: funnel, error: fErr } = await supabase.rpc('get_funnel_analytics');
  if (fErr) throw fErr;
  
  const { data: retention, error: rErr } = await supabase.rpc('get_retention_analytics');
  if (rErr) throw rErr;
  
  const { data: dropoff, error: dErr } = await supabase.rpc('get_dropoff_analysis');
  if (dErr) throw dErr;
  
  // For AB Testing mock/data
  const { data: abTests, error: abErr } = await supabase.from('ab_tests').select('*').order('created_at', { ascending: false });
  
  return {
    funnel,
    retention,
    dropoff,
    abTests: abTests || []
  };
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
  getCardById,
  updateCard,
  softDeleteCard,
  toggleCardActive,
  getCardStats,
  getBundlePlans,
  getBundleCards,
  getPlanById,
  getCardPerformanceAnalytics,
  getRelationshipDynamics,
  getGrowthAnalytics,
};
