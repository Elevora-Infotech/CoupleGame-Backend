const { supabase } = require('../db/supabase');

const findUserByEmail = async (email) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    throw error;
  }
  return data;
};

const findUserById = async (id) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

const findUserByResetToken = async (token) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('reset_token', token)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

const createUser = async (userData) => {
  const { data, error } = await supabase
    .from('users')
    .insert([userData])
    .select()
    .single();

  if (error) throw error;
  return data;
};

const updateUser = async (id, updateData) => {
  const { data, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

module.exports = {
  findUserByEmail,
  findUserById,
  findUserByResetToken,
  createUser,
  updateUser
};
