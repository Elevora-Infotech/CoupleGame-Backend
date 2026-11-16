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
const { logAdminAction } = require('./adminAuditService');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ─────────────────────────────────────────────────────────────
// A. Get All Games (paginated + filterable)
// GET /admin/games?page=1&limit=20&status=ACTIVE&search=ELV-xxx
// ─────────────────────────────────────────────────────────────
const getAllGames = async ({ page = 1, limit = 20, status = '', search = '', type = '', end_reason = '' } = {}) => {
  const offset = (page - 1) * limit;

  let query = supabase
    .from('rooms')
    .select(`
      id, code, status, mode, current_game_number, season_number, source, closed_reason, created_at, expires_at, paired_at,
      host:users!rooms_host_id_fkey (id, name, email, phone, phone_masked, platform),
      partner:users!rooms_partner_id_fkey (id, name, email, phone, phone_masked, platform)
    `, { count: 'exact' });

  if (status) query = query.eq('status', status.toUpperCase());
  if (type) query = query.eq('mode', type.toLowerCase());
  if (end_reason) query = query.ilike('closed_reason', `%${end_reason}%`);

  if (search) {
    query = query.ilike('code', `%${search}%`);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throwError(error.message, 400);

  // For each room fetch card stats
  const roomIds = (data || []).map(r => r.id);
  let cardCountMap = {};
  if (roomIds.length > 0) {
    const { data: sends } = await supabase
      .from('room_card_sends')
      .select('room_id, status')
      .in('room_id', roomIds);

    (sends || []).forEach(s => {
      if (!cardCountMap[s.room_id]) cardCountMap[s.room_id] = { total: 0, pending: 0, completed: 0, deflected: 0, penalties: 0 };
      cardCountMap[s.room_id].total++;
      if (['SENT', 'WAITING', 'IN_PROGRESS', 'COMPLETED_BY_RECEIVER'].includes(s.status)) cardCountMap[s.room_id].pending++;
      if (s.status === 'COMPLETED') cardCountMap[s.room_id].completed++;
      if (s.status === 'DEFLECTED') cardCountMap[s.room_id].deflected++;
      if (s.status === 'PENALTY') cardCountMap[s.room_id].penalties++;
    });
  }

  const now = new Date();
  const rooms = (data || []).map(r => {
    const start = new Date(r.created_at);
    const day = Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
    return {
      ...r,
      mode: r.mode || 'free',
      current_day: day,
      cards: cardCountMap[r.id] || { total: 0, pending: 0, completed: 0, deflected: 0, penalties: 0 },
    };
  });

  return {
    games: rooms,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  };
};

// ─────────────────────────────────────────────────────────────
// B. Get Full Game Detail
// GET /admin/games/:roomId
// ─────────────────────────────────────────────────────────────
const getGameById = async (roomId) => {
  // Run all independent queries in parallel to ensure sub-0.5s response time
  const [
    { data: room, error: roomErr },
    { data: sends },
    { data: penalties },
    { data: allDeckCards }
  ] = await Promise.all([
    supabase
      .from('rooms')
      .select(`
        id, code, status, expiry_type, created_at, expires_at, updated_at,
        host:users!rooms_host_id_fkey (id, name, email, is_blocked),
        partner:users!rooms_partner_id_fkey (id, name, email, is_blocked)
      `)
      .eq('id', roomId)
      .single(),

    supabase
      .from('room_card_sends')
      .select(`
        id, status, message, sent_at, respond_deadline, penalty_deadline,
        deflected_at, completed_at,
        sender:users!room_card_sends_sender_id_fkey (id, name),
        receiver:users!room_card_sends_receiver_id_fkey (id, name),
        cards (id, name, power_description, card_type, deflect_action)
      `)
      .eq('room_id', roomId)
      .order('sent_at', { ascending: false }),

    supabase
      .from('user_penalties')
      .select('id, user_id, reason, created_at, resolved_at, is_resolved')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false }),

    supabase
      .from('user_card_deck')
      .select(`
        id, user_id, is_used, expired, used_at, master_deck_id,
        cards (id, name, power_description, card_type, deflect_action, image_url)
      `)
      .eq('room_id', roomId)
      .order('user_id')
  ]);

  if (roomErr || !room) throwError('Game (room) not found.', 404);

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
const forceEndGame = async (roomId, { admin, reason } = {}) => {
  const { data: room } = await supabase
    .from('rooms')
    .select('id, code, status')
    .eq('id', roomId)
    .single();

  if (!room) throwError('Game not found.', 404);
  if (room.status === 'COMPLETED' || room.status === 'EXPIRED') {
    throwError(`Room ${room.code} is already ${room.status}. Nothing to end.`, 409);
  }

  // Mark room COMPLETED with end_reason 'force_ended'
  const { error: roomErr } = await supabase
    .from('rooms')
    .update({ 
      status: 'COMPLETED', 
      closed_reason: 'force_ended',
      updated_at: new Date().toISOString() 
    })
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

  // Record into immutable admin_audit_logs if admin session provided
  if (admin && reason) {
    try {
      await logAdminAction({
        adminId: admin.id,
        adminName: admin.name,
        role: admin.role,
        actionType: 'FORCE_END_GAME',
        targetEntity: 'room',
        targetId: room.code || roomId,
        beforeState: { status: room.status },
        afterState: { status: 'COMPLETED', closed_reason: 'force_ended' },
        reason: reason,
      });
    } catch (auditErr) {
      console.warn('[AdminGameService] Audit log write warning:', auditErr.message);
    }
  }

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
