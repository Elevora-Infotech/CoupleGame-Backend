const { supabase } = require('../db/supabase');

/**
 * Fetch a User Profile by ID (Join users and profiles)
 */
const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      first_name,
      last_name,
      avatar_url,
      bio,
      date_of_birth,
      preferences,
      users:id (email, name, created_at)
    `)
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      console.log(`[Self-Healing] Profile missing for user ${userId}. Creating...`);
      const { data: newUser, error: fetchUserErr } = await supabase
        .from('users')
        .select('name')
        .eq('id', userId)
        .single();
      
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert([{ id: userId, first_name: newUser ? newUser.name.split(' ')[0] : 'User' }])
        .select(`
          id, first_name, last_name, avatar_url, bio, date_of_birth, preferences,
          users:id (email, name, created_at)
        `)
        .single();

      if (createError) {
        console.error('[Self-Healing] Failed to create profile:', createError);
        throw createError;
      }
      console.log(`[Self-Healing] Profile created successfully for ${userId}.`);
      return newProfile;
    }
    console.error('[ProfileService] getProfile error:', error);
    const err = new Error(error.message);
    err.status = 400;
    throw err;
  }

  return data;
};

/**
 * Update a User Profile and Name in users table
 */
const updateProfile = async (userId, updateData) => {
  const { first_name, last_name, avatar_url, bio, date_of_birth, preferences } = updateData;

  // Update Profile table
  let profileData;
  const { data, error: profileError } = await supabase
    .from('profiles')
    .update({ 
      first_name, 
      last_name, 
      avatar_url, 
      bio, 
      date_of_birth, 
      preferences 
    })
    .eq('id', userId)
    .select()
    .single();

  if (profileError) {
    if (profileError.code === 'PGRST116') {
      // SELF-HEALING: Profile missing during update? Create it!
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert([{ 
          id: userId, 
          first_name, 
          last_name, 
          avatar_url, 
          bio, 
          date_of_birth, 
          preferences 
        }])
        .select()
        .single();

      if (createError) throw createError;
      profileData = newProfile;
    } else {
      const err = new Error(profileError.message);
      err.status = 400;
      throw err;
    }
  } else {
    profileData = data;
  }

  // Update Name in Users table (optional, but keep it in sync)
  if (first_name || last_name) {
    const fullName = `${first_name || ''} ${last_name || ''}`.trim();
    await supabase
      .from('users')
      .update({ name: fullName })
      .eq('id', userId);
  }

  return profileData;
};

module.exports = {
  getProfile,
  updateProfile
};
