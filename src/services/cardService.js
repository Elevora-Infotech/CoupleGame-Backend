const { supabase } = require('../db/supabase');

const getAllCards = async () => {
  const { data, error } = await supabase
    .from('cards')
    .select(`
      id,
      name,
      power_description,
      card_type,
      image_url,
      attributes,
      is_wildcard,
      category_id,
      card_categories (
        id,
        name,
        theme_color,
        icon_url,
        image_url
      )
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    const err = new Error(error.message);
    err.status = 500;
    throw err;
  }

  return data;
};

const getCatalog = async () => {
  // Fetch active categories and their nested active cards using Supabase relationships
  const { data, error } = await supabase
    .from('card_categories')
    .select(`
      id,
      name,
      description,
      theme_color,
      icon_url,
      image_url,
      cards (
        id,
        name,
        power_description,
        card_type,
        image_url,
        attributes
      )
    `)
    .eq('is_active', true)
    .eq('cards.is_active', true)
    .order('order_index', { ascending: true });

  if (error) {
    const err = new Error(error.message);
    err.status = 500;
    throw err;
  }

  return data;
};

const getCategories = async () => {
  const { data, error } = await supabase
    .from('card_categories')
    .select('id, name, description, theme_color, icon_url, order_index')
    .eq('is_active', true)
    .order('order_index', { ascending: true });

  if (error) {
    const err = new Error(error.message);
    err.status = 500;
    throw err;
  }

  return data;
};

module.exports = {
  getCatalog,
  getAllCards,
  getCategories,
};
