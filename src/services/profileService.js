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

  // Notify partner if they are in an active room
  try {
    const { getActiveRoom } = require('./roomService');
    const { emitToUser } = require('./socketService');
    const activeRoom = await getActiveRoom(userId);
    if (activeRoom && activeRoom.status === 'ACTIVE') {
      const partnerId = activeRoom.host_id === userId ? activeRoom.partner_id : activeRoom.host_id;
      if (partnerId && avatar_url) {
        emitToUser(partnerId, 'partner_avatar_updated', { avatar_url });
      }
    }
  } catch (e) {
    console.error('[ProfileService] Failed to notify partner of avatar update', e.message);
  }

  return profileData;
};

/**
 * Fetch Relationship Stats (Anniversary)
 */
const getRelationshipStats = async (userId) => {
  // 1. Find the Anniversary Question
  const { data: question, error: qError } = await supabase
    .from('questions')
    .select('id')
    .ilike('text', '%Anniversary%')
    .single();

  if (qError || !question) {
    return { anniversaryDate: null, daysTogether: 0, formattedTime: 'Unknown' };
  }

  // 2. Find the User's Answer
  const { data: answer, error: aError } = await supabase
    .from('user_answers')
    .select('text_value')
    .eq('user_id', userId)
    .eq('question_id', question.id)
    .single();

  if (aError || !answer || !answer.text_value) {
    // If not found for user, we could theoretically check partner, but assuming user answered it.
    return { anniversaryDate: null, daysTogether: 0, formattedTime: 'Unknown' };
  }

  const anniversaryDate = new Date(answer.text_value);
  const now = new Date();
  
  // Calculate days difference
  const diffTime = Math.abs(now - anniversaryDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // Calculate years, months, days roughly for formatted string
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  const days = (diffDays % 365) % 30;

  let formattedTime = [];
  if (years > 0) formattedTime.push(`${years} Year${years > 1 ? 's' : ''}`);
  if (months > 0) formattedTime.push(`${months} Month${months > 1 ? 's' : ''}`);
  if (days > 0) formattedTime.push(`${days} Day${days > 1 ? 's' : ''}`);

  return {
    anniversaryDate: answer.text_value,
    daysTogether: diffDays,
    formattedTime: formattedTime.length > 0 ? formattedTime.join(', ') : '0 Days'
  };
};

module.exports = {
  getProfile,
  updateProfile,
  getRelationshipStats
};
