'use strict';
/**
 * @file   adminUserService.js
 * @desc   Admin-side service for full User Management:
 *         - View / Search all users
 *         - View per-user game history, activity, stats
 *         - Block / Suspend / Unblock users
 *         - Reset a user's active room / deck
 */

const { supabase } = require('../db/supabase');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ─────────────────────────────────────────────────────────────
// A: Get All Users (Paginated + Search)
// ─────────────────────────────────────────────────────────────
const getAllUsers = async (filters = {}) => {
  const { page = 1, limit = 20, search = '', status = '' } = filters;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('users')
    .select('id, name, email, auth_provider, is_blocked, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search && search.trim()) {
    query = query.or(`name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
  }

  if (status === 'blocked') {
    query = query.eq('is_blocked', true);
  } else if (status === 'active') {
    query = query.eq('is_blocked', false);
  }

  const { data, error, count } = await query;
  if (error) throwError(error.message, 400);

  return {
    users: data || [],
    pagination: {
      page: +page,
      limit: +limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  };
};

// ─────────────────────────────────────────────────────────────
// B: Get One User — Full Detail (room history, card stats, penalties)
// ─────────────────────────────────────────────────────────────
const getUserById = async (userId) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, auth_provider, is_blocked, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (error || !user) throwError('User not found.', 404);

  // Fetch room stats
  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, code, status, expiry_type, created_at, expires_at, host_id, partner_id')
    .or(`host_id.eq.${userId},partner_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  const roomIds = (rooms || []).map(r => r.id);

  // Card send stats
  let sendStats = { total_sent: 0, total_received: 0, completed: 0, rejected: 0, deflected: 0 };
  if (roomIds.length > 0) {
    const { data: sends } = await supabase
      .from('room_card_sends')
      .select('sender_id, receiver_id, status')
      .in('room_id', roomIds);

    if (sends) {
      sendStats.total_sent = sends.filter(s => s.sender_id === userId).length;
      sendStats.total_received = sends.filter(s => s.receiver_id === userId).length;
      sendStats.completed = sends.filter(s => s.status === 'COMPLETED' && s.sender_id === userId).length;
      sendStats.rejected = sends.filter(s => s.status === 'REJECTED' && s.receiver_id === userId).length;
      sendStats.deflected = sends.filter(s => s.status === 'DEFLECTED' && s.receiver_id === userId).length;
    }
  }

  // Penalty stats
  const { count: penaltyCount } = await supabase
    .from('penalty_log')
    .select('id', { count: 'exact', head: true })
    .eq('penalized_user_id', userId);

  // Active cards in deck
  const { count: deckCount } = await supabase
    .from('user_card_deck')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_used', false)
    .eq('expired', false);

  // Purchase history
  const { data: purchases } = await supabase
    .from('user_purchases')
    .select('id, amount_paid, currency, status, purchased_at, bundles(name)')
    .eq('user_id', userId)
    .order('purchased_at', { ascending: false })
    .limit(10);

  const activeRoom = (rooms || []).find(r => r.status === 'ACTIVE');

  return {
    user,
    stats: {
      total_rooms: (rooms || []).length,
      active_room: activeRoom || null,
      card_stats: sendStats,
      total_penalties: penaltyCount || 0,
      deck_cards_remaining: deckCount || 0,
      total_purchases: (purchases || []).length,
    },
    rooms: rooms || [],
    purchases: purchases || [],
  };
};

// ─────────────────────────────────────────────────────────────
// C: Block or Unblock a User
// ─────────────────────────────────────────────────────────────
const setUserBlockStatus = async (userId, isBlocked) => {
  const { data: user, error } = await supabase
    .from('users')
    .update({ is_blocked: isBlocked, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, name, email, is_blocked')
    .single();

  if (error) throwError(error.message, 400);
  return user;
};

// ─────────────────────────────────────────────────────────────
// D: Reset User's Active Room (Force-expire the room)
// ─────────────────────────────────────────────────────────────
const resetUserRoom = async (userId, adminNote = '') => {
  // Find any active room for this user
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, code, host_id, partner_id, status')
    .or(`host_id.eq.${userId},partner_id.eq.${userId}`)
    .in('status', ['ACTIVE', 'WAITING'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (roomError || !room) throwError('No active room found for this user.', 404);

  // Expire the room
  const { data: updatedRoom, error: updateError } = await supabase
    .from('rooms')
    .update({
      status: 'COMPLETED',
      expires_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', room.id)
    .select()
    .single();

  if (updateError) throwError(updateError.message, 500);

  // Expire all cards in this room
  await supabase
    .from('user_card_deck')
    .update({ expired: true, updated_at: new Date().toISOString() })
    .eq('room_id', room.id)
    .eq('expired', false);

  return {
    message: `Room ${room.code} has been force-closed and all cards expired.`,
    room: updatedRoom,
  };
};

// ─────────────────────────────────────────────────────────────
// E: Quick Stats for Overview (DAU, new users, etc.)
// ─────────────────────────────────────────────────────────────
const getUserGrowthStats = async () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  const last7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
  const last30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString();

  const [
    { count: total },
    { count: newToday },
    { count: newLast7 },
    { count: newLast30 },
    { count: blocked },
    { count: activeRooms },
  ] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', last7),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', last30),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_blocked', true),
    supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
  ]);

  return {
    total_users: total || 0,
    new_today: newToday || 0,
    new_last_7_days: newLast7 || 0,
    new_last_30_days: newLast30 || 0,
    blocked_users: blocked || 0,
    active_rooms: activeRooms || 0,
  };
};

module.exports = {
  getAllUsers,
  getUserById,
  setUserBlockStatus,
  resetUserRoom,
  getUserGrowthStats,
};
