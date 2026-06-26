'use strict';

/**
 * @file   adminGameService.js
 * @desc   Admin: Game / Room Management
 *
 * Features:
 *  A. getAllGames   — paginated list, filterable by status, searchable by room code or player name
 *  B. getGameById  — full room detail: players, cards played, pending, penalties, deflects
 *  C. forceEndGame — mark room COMPLETED, expire all pending cards
 *  D. getGameStats — aggregate metrics for the analytics cards at the top of the page
 */

const { supabase } = require('../db/supabase');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ─────────────────────────────────────────────────────────────
// A. Get All Games (paginated + filterable)
// GET /admin/games?page=1&limit=20&status=ACTIVE&search=ELV-xxx
// ─────────────────────────────────────────────────────────────
const getAllGames = async ({ page = 1, limit = 20, status = '', search = '' } = {}) => {
  const offset = (page - 1) * limit;

  let query = supabase
    .from('rooms')
    .select(`
      id, code, status, expiry_type, created_at, expires_at,
      host:users!rooms_host_id_fkey (id, name, email),
      partner:users!rooms_partner_id_fkey (id, name, email)
    `, { count: 'exact' });

  if (status) query = query.eq('status', status.toUpperCase());

  if (search) {
    // search by room code (partial, case-insensitive)
    query = query.ilike('code', `%${search}%`);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throwError(error.message, 400);

  // For each room fetch quick card counts
  const roomIds = (data || []).map(r => r.id);
  let cardCountMap = {};
  if (roomIds.length > 0) {
    const { data: sends } = await supabase
      .from('room_card_sends')
      .select('room_id, status')
      .in('room_id', roomIds);

    (sends || []).forEach(s => {
      if (!cardCountMap[s.room_id]) cardCountMap[s.room_id] = { total: 0, pending: 0, completed: 0, deflected: 0 };
      cardCountMap[s.room_id].total++;
      if (['SENT', 'WAITING', 'IN_PROGRESS', 'COMPLETED_BY_RECEIVER'].includes(s.status)) cardCountMap[s.room_id].pending++;
      if (s.status === 'COMPLETED') cardCountMap[s.room_id].completed++;
      if (s.status === 'DEFLECTED') cardCountMap[s.room_id].deflected++;
    });
  }

  const rooms = (data || []).map(r => ({
    ...r,
    cards: cardCountMap[r.id] || { total: 0, pending: 0, completed: 0, deflected: 0 },
  }));

  return {
    games: rooms,
    pagination: {
      total: count || 0,
      page,
      limit,
      pages: Math.ceil((count || 0) / limit),
    },
  };
};

// ─────────────────────────────────────────────────────────────
// B. Get Full Game Detail
// GET /admin/games/:roomId
// ─────────────────────────────────────────────────────────────
const getGameById = async (roomId) => {
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select(`
      id, code, status, expiry_type, created_at, expires_at, updated_at,
      host:users!rooms_host_id_fkey (id, name, email, is_blocked),
      partner:users!rooms_partner_id_fkey (id, name, email, is_blocked)
    `)
    .eq('id', roomId)
    .single();

  if (roomErr || !room) throwError('Game (room) not found.', 404);

  // Card sends in this room
  const { data: sends } = await supabase
    .from('room_card_sends')
    .select(`
      id, status, message, sent_at, respond_deadline, penalty_deadline,
      deflected_at, completed_at,
      sender:users!room_card_sends_sender_id_fkey (id, name),
      receiver:users!room_card_sends_receiver_id_fkey (id, name),
      cards (id, name, power_description, card_type, deflect_action)
    `)
    .eq('room_id', roomId)
    .order('sent_at', { ascending: false });

  // Penalties in this room
  const { data: penalties } = await supabase
    .from('user_penalties')
    .select('id, user_id, reason, created_at, resolved_at, is_resolved')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });

  // ── All deck cards granted in this room (regular + deflect, both users) ──
  const { data: allDeckCards } = await supabase
    .from('user_card_deck')
    .select(`
      id, user_id, is_used, expired, used_at, master_deck_id,
      cards (id, name, power_description, card_type, deflect_action, image_url)
    `)
    .eq('room_id', roomId)
    .order('user_id');

  // Group deck cards per player
  const buildPlayerDeck = (userId) => {
    const playerCards = (allDeckCards || []).filter(d => d.user_id === userId);
    const regular  = playerCards.filter(d => !d.cards?.deflect_action);
    const deflect  = playerCards.filter(d =>  d.cards?.deflect_action);
    return {
      regular,
      deflect,
      regular_total:   regular.length,
      regular_used:    regular.filter(d => d.is_used).length,
      regular_expired: regular.filter(d => d.expired).length,
      deflect_total:   deflect.length,
      deflect_used:    deflect.filter(d => d.is_used).length,
    };
  };

  const hostDeck    = room.host?.id    ? buildPlayerDeck(room.host.id)    : null;
  const partnerDeck = room.partner?.id ? buildPlayerDeck(room.partner.id) : null;

  // Deflect usages (used deflect cards only, for the "Deflects" tab)
  const deflects = (allDeckCards || []).filter(d => d.cards?.deflect_action && d.is_used);

  // Stats summary
  const allSends = sends || [];
  const stats = {
    total_cards_played:  allSends.length,
    completed:           allSends.filter(s => s.status === 'COMPLETED').length,
    pending:             allSends.filter(s => ['SENT', 'WAITING', 'IN_PROGRESS', 'COMPLETED_BY_RECEIVER'].includes(s.status)).length,
    deflected:           allSends.filter(s => s.status === 'DEFLECTED').length,
    penalty:             allSends.filter(s => s.status === 'PENALTY').length,
    total_penalties:     (penalties || []).length,
    deflect_cards_used:  deflects.length,
  };

  return { room, stats, sends: allSends, penalties: penalties || [], deflects, hostDeck, partnerDeck };
};


// ─────────────────────────────────────────────────────────────
// C. Force-End Game
// POST /admin/games/:roomId/force-end
// ─────────────────────────────────────────────────────────────
const forceEndGame = async (roomId) => {
  const { data: room } = await supabase
    .from('rooms')
    .select('id, code, status')
    .eq('id', roomId)
    .single();

  if (!room) throwError('Game not found.', 404);
  if (room.status === 'COMPLETED' || room.status === 'EXPIRED') {
    throwError(`Room ${room.code} is already ${room.status}. Nothing to end.`, 409);
  }

  // Mark room COMPLETED
  const { error: roomErr } = await supabase
    .from('rooms')
    .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
    .eq('id', roomId);
  if (roomErr) throwError('Failed to close room: ' + roomErr.message);

  // Expire all pending cards in this room
  await supabase
    .from('room_card_sends')
    .update({ status: 'PENALTY' })
    .eq('room_id', roomId)
    .in('status', ['SENT', 'WAITING', 'IN_PROGRESS', 'COMPLETED_BY_RECEIVER']);

  // Expire all unused deck cards in this room
  await supabase
    .from('user_card_deck')
    .update({ expired: true })
    .eq('room_id', roomId)
    .eq('is_used', false)
    .eq('expired', false);

  return { message: `Room ${room.code} has been force-ended successfully.`, room_code: room.code };
};

// ─────────────────────────────────────────────────────────────
// D. Game Analytics Stats (for the KPI cards at the top)
// GET /admin/games/stats
// ─────────────────────────────────────────────────────────────
const getGameStats = async () => {
  const now = new Date().toISOString();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const [
    { count: totalGames },
    { count: activeGames },
    { count: waitingGames },
    { count: completedGames },
    { count: gamesStartedToday },
    { count: totalCardsSent },
    { count: totalPenalties },
    { count: deflectsUsed },
  ] = await Promise.all([
    supabase.from('rooms').select('id', { count: 'exact', head: true }),
    supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('status', 'WAITING'),
    supabase.from('rooms').select('id', { count: 'exact', head: true }).in('status', ['COMPLETED', 'EXPIRED']),
    supabase.from('rooms').select('id', { count: 'exact', head: true }).gte('created_at', todayISO),
    supabase.from('room_card_sends').select('id', { count: 'exact', head: true }),
    supabase.from('user_penalties').select('id', { count: 'exact', head: true }),
    supabase.from('user_card_deck').select('id', { count: 'exact', head: true }).eq('is_used', true),
  ]);

  return {
    total_games: totalGames || 0,
    active_games: activeGames || 0,
    waiting_games: waitingGames || 0,
    completed_games: completedGames || 0,
    games_started_today: gamesStartedToday || 0,
    total_cards_sent: totalCardsSent || 0,
    total_penalties: totalPenalties || 0,
    deflects_used: deflectsUsed || 0,
  };
};

module.exports = { getAllGames, getGameById, forceEndGame, getGameStats };
