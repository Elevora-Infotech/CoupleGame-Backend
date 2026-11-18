'use strict';

const { supabase } = require('../db/supabase');
const { maskPhoneNumber, maskEmail, stripPrivateCardNotes } = require('../utils/privacyMasker');
const { formatIST, logAdminAction } = require('./adminAuditService');

// ─────────────────────────────────────────────────────────────────────────────
// 1. UNIFIED SEARCH (7 Identifiers)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Global search across:
 * 1. Partner Name
 * 2. Partner Email
 * 3. Partner Phone (searchable, results rendered masked)
 * 4. Room Code (e.g. 4821 or ELV-xxx)
 * 5. Player ID (UUID)
 * 6. Couple ID / Room ID (UUID)
 * 7. Payment / Order ID (RevenueCat transaction ID / store transaction ID)
 */
const unifiedSearch = async (query = '') => {
  const q = String(query).trim();
  if (!q) {
    return { couples: [], players: [], payments: [] };
  }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
  const isDigitsOnly = /^\+?\d{4,15}$/.test(q);
  const isEmail = q.includes('@');

  // Search Couples / Rooms
  let roomsQuery = supabase
    .from('rooms')
    .select(`
      id, code, status, mode, current_game_number, season_number, source, paired_at, created_at,
      host:users!rooms_host_id_fkey(id, name, email, phone, phone_masked, platform),
      partner:users!rooms_partner_id_fkey(id, name, email, phone, phone_masked, platform)
    `);

  if (isUUID) {
    roomsQuery = roomsQuery.or(`id.eq.${q},host_id.eq.${q},partner_id.eq.${q}`);
  } else {
    roomsQuery = roomsQuery.or(`code.ilike.%${q}%`);
  }

  // Search Users / Players
  let usersQuery = supabase
    .from('users')
    .select('id, name, email, phone, phone_masked, platform, app_version, push_enabled, created_at, last_active_at');

  if (isUUID) {
    usersQuery = usersQuery.eq('id', q);
  } else if (isEmail) {
    usersQuery = usersQuery.ilike('email', `%${q}%`);
  } else if (isDigitsOnly) {
    const rawDigits = q.replace(/\D/g, '');
    usersQuery = usersQuery.or(`phone.ilike.%${rawDigits}%,phone_masked.ilike.%${rawDigits}%`);
  } else {
    usersQuery = usersQuery.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  // Search Purchases / Payments
  let purchasesQuery = supabase
    .from('user_purchases')
    .select('id, user_id, room_id, amount_paid, status, payment_source, store_transaction_id, created_at')
    .limit(10);

  if (isUUID) {
    purchasesQuery = purchasesQuery.or(`id.eq.${q},user_id.eq.${q},room_id.eq.${q}`);
  } else {
    purchasesQuery = purchasesQuery.or(`store_transaction_id.ilike.%${q}%`);
  }

  const [roomsRes, usersRes, purchasesRes] = await Promise.all([
    roomsQuery.limit(15),
    usersQuery.limit(15),
    purchasesQuery,
  ]);

  // Format Couples
  const couples = (roomsRes.data || []).map((room) => ({
    couple_id: room.id,
    room_code: room.code,
    status: room.status,
    mode: room.mode || 'free',
    current_game_number: room.current_game_number || 1,
    season_number: room.season_number || 1,
    source: room.source || 'organic',
    paired_at_ist: room.paired_at ? formatIST(room.paired_at) : null,
    created_at_ist: formatIST(room.created_at),
    partner_1: room.host ? {
      id: room.host.id,
      name: room.host.name,
      phone_masked: maskPhoneNumber(room.host.phone_masked || room.host.phone),
      email_masked: maskEmail(room.host.email),
      platform: room.host.platform,
    } : null,
    partner_2: room.partner ? {
      id: room.partner.id,
      name: room.partner.name,
      phone_masked: maskPhoneNumber(room.partner.phone_masked || room.partner.phone),
      email_masked: maskEmail(room.partner.email),
      platform: room.partner.platform,
    } : null,
  }));

  // Format Players
  const players = (usersRes.data || []).map((user) => ({
    player_id: user.id,
    name: user.name,
    email_masked: maskEmail(user.email),
    phone_masked: maskPhoneNumber(user.phone_masked || user.phone),
    platform: user.platform,
    app_version: user.app_version,
    push_enabled: user.push_enabled !== false,
    created_at_ist: formatIST(user.created_at),
    last_active_ist: user.last_active_at ? formatIST(user.last_active_at) : null,
  }));

  // Format Payments
  const payments = (purchasesRes.data || []).map((p) => ({
    purchase_id: p.id,
    user_id: p.user_id,
    room_id: p.room_id,
    amount_paid: p.amount_paid,
    status: p.status,
    payment_source: p.payment_source || 'revenuecat',
    store_transaction_id: p.store_transaction_id,
    created_at_ist: formatIST(p.created_at),
  }));

  return { couples, players, payments };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. COMPLETE COUPLE SCREEN (7 Tiers Ordered Top to Bottom)
// ─────────────────────────────────────────────────────────────────────────────
const getCoupleDetail = async (roomId) => {
  // 1. Fetch Room & Partners
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select(`
      id, code, status, mode, current_game_number, season_number, source, paired_at, created_at, closed_reason, settings_snapshot, updated_at,
      host:users!rooms_host_id_fkey(id, name, email, phone, phone_masked, platform, app_version, push_enabled, created_at, last_active_at),
      partner:users!rooms_partner_id_fkey(id, name, email, phone, phone_masked, platform, app_version, push_enabled, created_at, last_active_at)
    `)
    .eq('id', roomId)
    .single();

  if (roomErr || !room) {
    const err = new Error('Couple room not found.');
    err.status = 404;
    throw err;
  }

  // 2. Fetch Active Subscription & Payer
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('payer_id, status, current_season, autopay_status, started_at, ends_at, cancelled_at')
    .eq('couple_id', roomId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3. Fetch Purchases for this couple
  const { data: purchases } = await supabase
    .from('user_purchases')
    .select('id, user_id, amount_paid, status, payment_source, store_transaction_id, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });

  const payerId = sub?.payer_id || purchases?.find(p => p.status === 'completed')?.user_id || null;

  // 4. Fetch Support Notes
  const { data: supportNotes } = await supabase
    .from('support_notes')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });

  // 5. Fetch Card Sends / Plays
  const { data: cardSends } = await supabase
    .from('room_card_sends')
    .select(`
      id, room_id, sender_id, receiver_id, card_id, card_version, category, is_free_pool,
      optional_note_used, response_action, status, sent_at, accepted_at, completed_at, confirmed_at, expires_at, penalty_applied,
      card:cards(id, name, category_id, prompt)
    `)
    .eq('room_id', roomId)
    .order('sent_at', { ascending: false });

  // Sanitize card sends (privacy protection for dare notes)
  const sanitizedSends = (cardSends || []).map(stripPrivateCardNotes);

  // 6. Fetch Unused Cards in Hand (user_card_deck)
  const { data: deckCards } = await supabase
    .from('user_card_deck')
    .select('id, user_id, card_id, is_used, expired, created_at, cards(id, name, category_id)')
    .eq('room_id', roomId);

  const hostHand = (deckCards || []).filter(c => c.user_id === room.host?.id && !c.is_used && !c.expired);
  const partnerHand = (deckCards || []).filter(c => c.user_id === room.partner?.id && !c.is_used && !c.expired);

  // 7. Calculate Pace & Active Timers
  const activeCards = sanitizedSends.filter(s =>
    ['SENT', 'WAITING', 'IN_PROGRESS', 'COMPLETED_BY_RECEIVER'].includes(s.status)
  );
  const completedCards = sanitizedSends.filter(s => s.status === 'COMPLETED');
  const penaltiesCount = sanitizedSends.filter(s => s.status === 'PENALTY').length;
  const deflectsCount = sanitizedSends.filter(s => s.status === 'DEFLECTED').length;

  const createdAt = new Date(room.created_at);
  const now = new Date();
  const daysActive = Math.max(1, Math.ceil((now - createdAt) / (1000 * 60 * 60 * 24)));
  const pace = Number((sanitizedSends.length / daysActive).toFixed(1));

  // ───────────────────────────────────────────────────────────────────────────
  // BUILD TIER 1: INTERACTIVE LIFECYCLE TIMELINE (With Pre-Event Card Actions)
  // ───────────────────────────────────────────────────────────────────────────
  const timeline = [];

  // A. Room Created
  timeline.push({
    id: `tl_room_created`,
    type: 'ROOM_CREATED',
    title: 'Room Created',
    description: `Room code ${room.code} created by ${room.host?.name || 'Creator'}`,
    timestamp_utc: room.created_at,
    timestamp_ist: formatIST(room.created_at),
    icon: 'DoorOpen',
    badge_color: 'blue',
  });

  // B. Partner Paired
  if (room.paired_at) {
    timeline.push({
      id: `tl_paired`,
      type: 'PARTNER_PAIRED',
      title: 'Partner Joined (Paired)',
      description: `${room.partner?.name || 'Partner'} joined room ${room.code}`,
      timestamp_utc: room.paired_at,
      timestamp_ist: formatIST(room.paired_at),
      icon: 'HeartHandshake',
      badge_color: 'emerald',
    });
  }

  // C. Purchases / Payments
  (purchases || []).forEach(p => {
    timeline.push({
      id: `tl_payment_${p.id}`,
      type: 'PAYMENT_EVENT',
      title: p.status === 'completed' ? 'Payment Succeeded' : p.status === 'refunded' ? 'Payment Refunded' : 'Payment Started',
      description: `₹${p.amount_paid} via ${p.payment_source || 'In-App Purchase'} (Status: ${p.status})`,
      timestamp_utc: p.created_at,
      timestamp_ist: formatIST(p.created_at),
      icon: 'CreditCard',
      badge_color: p.status === 'completed' ? 'emerald' : p.status === 'refunded' ? 'amber' : 'yellow',
    });
  });

  // D. Subscription Events
  if (sub) {
    if (sub.started_at) {
      timeline.push({
        id: `tl_sub_started`,
        type: 'SEASON_STARTED',
        title: `Paid Season ${sub.current_season || 1} Started`,
        description: `Subscription activated. Autopay: ${sub.autopay_status || 'active'}`,
        timestamp_utc: sub.started_at,
        timestamp_ist: formatIST(sub.started_at),
        icon: 'Sparkles',
        badge_color: 'purple',
      });
    }
    if (sub.cancelled_at) {
      timeline.push({
        id: `tl_sub_cancelled`,
        type: 'AUTOPAY_CANCELLED',
        title: 'Autopay Cancelled',
        description: 'Payer cancelled auto-renewal. Access continues until season end.',
        timestamp_utc: sub.cancelled_at,
        timestamp_ist: formatIST(sub.cancelled_at),
        icon: 'CalendarX',
        badge_color: 'amber',
      });
    }
  }

  // E. Room Closed / Ended
  if (room.status === 'COMPLETED' || room.status === 'EXPIRED') {
    timeline.push({
      id: `tl_room_closed`,
      type: 'GAME_ENDED',
      title: `Game Ended (${room.closed_reason || 'Normal Completion'})`,
      description: `Final status: ${room.status}`,
      timestamp_utc: room.updated_at,
      timestamp_ist: formatIST(room.updated_at),
      icon: 'Flag',
      badge_color: 'slate',
    });
  }

  // F. Support Notes in Timeline
  (supportNotes || []).forEach(note => {
    timeline.push({
      id: `tl_note_${note.id}`,
      type: 'SUPPORT_NOTE',
      title: `Support Note (${note.reason_tag})`,
      description: `"${note.note_text}" — by ${note.author_name}`,
      timestamp_utc: note.created_at,
      timestamp_ist: formatIST(note.created_at),
      icon: 'MessageSquare',
      badge_color: 'indigo',
    });
  });

  // Sort Timeline: Newest event at the top
  timeline.sort((a, b) => new Date(b.timestamp_utc) - new Date(a.timestamp_utc));

  // Attach Pre-Event Card Actions (last 5 card actions before each major event)
  timeline.forEach(event => {
    const eventTime = new Date(event.timestamp_utc).getTime();
    const precedingCards = sanitizedSends
      .filter(s => new Date(s.sent_at).getTime() <= eventTime)
      .slice(0, 5)
      .map(s => ({
        id: s.id,
        card_name: s.card?.name || 'Dare Card',
        status: s.status,
        sent_at_ist: formatIST(s.sent_at),
        sender_name: s.sender_id === room.host?.id ? room.host?.name : room.partner?.name,
      }));
    event.pre_event_actions = precedingCards;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ASSEMBLE COMPLETE 7-TIER RESPONSE (Strict Spec B2 Order)
  // ───────────────────────────────────────────────────────────────────────────
  return {
    tier_1_timeline: timeline,

    tier_2_key_facts: {
      mode: room.mode || 'free',
      current_game_number: room.current_game_number || 1,
      season_number: room.season_number || 1,
      current_day: daysActive,
      subscription_status: sub ? (sub.autopay_status === 'cancelled' ? 'autopay off' : sub.status) : (purchases?.length ? 'paid' : 'none'),
      source: room.source || 'organic',
      platforms: {
        partner_1: room.host?.platform || 'android',
        partner_2: room.partner?.platform || 'ios',
      },
      pace_cards_per_day: pace,
    },

    tier_3_partners: {
      partner_1: room.host ? {
        id: room.host.id,
        name: room.host.name,
        phone_masked: maskPhoneNumber(room.host.phone_masked || room.host.phone),
        email_masked: maskEmail(room.host.email),
        platform: room.host.platform,
        is_payer: room.host.id === payerId,
      } : null,
      partner_2: room.partner ? {
        id: room.partner.id,
        name: room.partner.name,
        phone_masked: maskPhoneNumber(room.partner.phone_masked || room.partner.phone),
        email_masked: maskEmail(room.partner.email),
        platform: room.partner.platform,
        is_payer: room.partner.id === payerId,
      } : null,
      payer_id: payerId,
    },

    tier_4_current_game: {
      status: room.status,
      hand_count: {
        partner_1: hostHand.length,
        partner_2: partnerHand.length,
      },
      active_cards: activeCards.map(s => ({
        id: s.id,
        card_name: s.card?.name || 'Dare Card',
        status: s.status,
        sender_name: s.sender_id === room.host?.id ? room.host?.name : room.partner?.name,
        receiver_name: s.receiver_id === room.host?.id ? room.host?.name : room.partner?.name,
        sent_at_ist: formatIST(s.sent_at),
        expires_at_ist: s.expires_at ? formatIST(s.expires_at) : null,
        optional_note_used: s.optional_note_used,
      })),
      deflects_left: Math.max(0, 5 - deflectsCount),
      penalties_given: penaltiesCount,
      send_ban: null, // Will populate if active
    },

    tier_5_per_partner_history: {
      partner_1_performed: completedCards
        .filter(s => s.receiver_id === room.host?.id)
        .map(s => ({
          id: s.id,
          card_name: s.card?.name || 'Completed Card',
          category: s.category || 'General',
          card_version: s.card_version || 1,
          completed_at_ist: formatIST(s.completed_at || s.confirmed_at),
          optional_note_used: s.optional_note_used,
        })),
      partner_2_performed: completedCards
        .filter(s => s.receiver_id === room.partner?.id)
        .map(s => ({
          id: s.id,
          card_name: s.card?.name || 'Completed Card',
          category: s.category || 'General',
          card_version: s.card_version || 1,
          completed_at_ist: formatIST(s.completed_at || s.confirmed_at),
          optional_note_used: s.optional_note_used,
        })),
    },

    tier_6_support_notes: (supportNotes || []).map(n => ({
      id: n.id,
      author_id: n.author_id,
      author_name: n.author_name,
      reason_tag: n.reason_tag,
      note_text: n.note_text,
      created_at_ist: formatIST(n.created_at),
    })),

    tier_7_technical_details: {
      couple_id: room.id,
      room_code: room.code,
      host_telemetry: {
        user_id: room.host?.id,
        app_version: room.host?.app_version || '1.0.0',
        platform: room.host?.platform || 'android',
        push_enabled: room.host?.push_enabled !== false,
        last_seen_ist: room.host?.last_active_at ? formatIST(room.host.last_active_at) : null,
      },
      partner_telemetry: {
        user_id: room.partner?.id,
        app_version: room.partner?.app_version || '1.0.0',
        platform: room.partner?.platform || 'ios',
        push_enabled: room.partner?.push_enabled !== false,
        last_seen_ist: room.partner?.last_active_at ? formatIST(room.partner.last_active_at) : null,
      },
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. SUPPORT ACTIONS (Resend Invite, Close Room, Restore Card, Extend Timer)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Add a Support Note to a Couple Record
 */
const addSupportNote = async ({ roomId, authorId, authorName, reasonTag, noteText }) => {
  if (!noteText || noteText.trim().length < 3) {
    const err = new Error('Support note text is required (minimum 3 characters).');
    err.status = 400;
    throw err;
  }

  const { data, error } = await supabase
    .from('support_notes')
    .insert({
      room_id: roomId,
      author_id: authorId,
      author_name: authorName,
      reason_tag: reasonTag || 'General Inquiry',
      note_text: noteText.trim(),
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[AdminOperationsService] Add support note error:', error.message);
    throw error;
  }

  return {
    ...data,
    created_at_ist: formatIST(data.created_at),
  };
};

/**
 * Resend Invite Link (generates clean WhatsApp deep link)
 */
const resendInviteLink = async (roomId) => {
  const { data: room, error } = await supabase
    .from('rooms')
    .select('id, code, host:users!rooms_host_id_fkey(name)')
    .eq('id', roomId)
    .single();

  if (error || !room) {
    const err = new Error('Room not found.');
    err.status = 404;
    throw err;
  }

  const inviteUrl = `https://soulshuffle.app/join/${room.code}`;
  const whatsappMessage = `Hey! Join me on SoulShuffle to play our couple dare card game. My room code is: ${room.code}. Tap here to join: ${inviteUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessage)}`;

  return {
    room_code: room.code,
    invite_url: inviteUrl,
    whatsapp_url: whatsappUrl,
    message: `Invite link generated for room ${room.code}.`,
  };
};

/**
 * Restore a Card Lost to Outage or Confirmed Bug
 */
const restoreCard = async ({ roomId, cardSendId, reason, admin }) => {
  if (!reason || reason.trim().length < 5) {
    const err = new Error('A detailed reason (minimum 5 characters) is required to restore a card.');
    err.status = 400;
    throw err;
  }

  const { data: cardSend, error } = await supabase
    .from('room_card_sends')
    .select('id, room_id, status, card_id')
    .eq('id', cardSendId)
    .single();

  if (error || !cardSend) {
    const err = new Error('Card send record not found.');
    err.status = 404;
    throw err;
  }

  // Restore status from PENALTY back to WAITING
  const { data: updated, error: updateErr } = await supabase
    .from('room_card_sends')
    .update({
      status: 'WAITING',
      penalty_applied: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cardSendId)
    .select()
    .single();

  if (updateErr) throw updateErr;

  // Record into immutable admin_audit_logs
  if (admin) {
    try {
      await logAdminAction({
        adminId: admin.id,
        adminName: admin.name,
        role: admin.role,
        actionType: 'RESTORE_LOST_CARD',
        targetEntity: 'card_send',
        targetId: cardSendId,
        beforeState: { status: cardSend.status },
        afterState: { status: 'WAITING', penalty_applied: null },
        reason: reason.trim(),
      });
    } catch (auditErr) {
      console.warn('[AdminOperationsService] Audit log warning:', auditErr.message);
    }
  }

  return {
    message: 'Card restored successfully to active hand.',
    card: updated,
  };
};

/**
 * Extend an Active Card Timer by 24 Hours
 */
const extendTimer = async ({ roomId, cardSendId, hours = 24, reason, admin }) => {
  if (!reason || reason.trim().length < 5) {
    const err = new Error('A detailed reason (minimum 5 characters) is required to extend a timer.');
    err.status = 400;
    throw err;
  }

  const { data: cardSend, error } = await supabase
    .from('room_card_sends')
    .select('id, expires_at, status')
    .eq('id', cardSendId)
    .single();

  if (error || !cardSend) {
    const err = new Error('Active card send not found.');
    err.status = 404;
    throw err;
  }

  const currentExpires = cardSend.expires_at ? new Date(cardSend.expires_at) : new Date();
  const newExpires = new Date(currentExpires.getTime() + hours * 60 * 60 * 1000);

  const { data: updated, error: updateErr } = await supabase
    .from('room_card_sends')
    .update({
      expires_at: newExpires.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', cardSendId)
    .select()
    .single();

  if (updateErr) throw updateErr;

  // Record audit log
  if (admin) {
    try {
      await logAdminAction({
        adminId: admin.id,
        adminName: admin.name,
        role: admin.role,
        actionType: 'EXTEND_CARD_TIMER',
        targetEntity: 'card_send',
        targetId: cardSendId,
        beforeState: { expires_at: cardSend.expires_at },
        afterState: { expires_at: newExpires.toISOString() },
        reason: reason.trim(),
      });
    } catch (auditErr) {
      console.warn('[AdminOperationsService] Audit log warning:', auditErr.message);
    }
  }

  return {
    message: `Timer extended by ${hours} hours.`,
    new_expires_at_ist: formatIST(newExpires),
    card: updated,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. APP-WIDE CONTROLS (Pause All Timers, Maintenance Banner, Version Control)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Emergency: Pause All Timers (Outage Mode)
 */
const pauseAllTimers = async ({ reason, admin }) => {
  if (!reason || reason.trim().length < 5) {
    const err = new Error('A mandatory reason is required to pause all system timers.');
    err.status = 400;
    throw err;
  }

  const pausePayload = {
    is_paused: true,
    paused_at: new Date().toISOString(),
    reason: reason.trim(),
    paused_by: admin?.name || 'Admin',
  };

  const { error } = await supabase
    .from('game_settings')
    .upsert({
      setting_key: 'timers_paused_control',
      setting_value: pausePayload,
      description: 'Emergency outage timer freeze control',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'setting_key' });

  if (error) throw error;

  // Audit log
  if (admin) {
    await logAdminAction({
      adminId: admin.id,
      adminName: admin.name,
      role: admin.role,
      actionType: 'PAUSE_ALL_TIMERS',
      targetEntity: 'system_timers',
      targetId: 'all_active_rooms',
      afterState: pausePayload,
      reason: reason.trim(),
    });
  }

  return {
    message: 'EMERGENCY: All card timers across all rooms have been paused. No penalties will be applied.',
    control: pausePayload,
  };
};

/**
 * Resume All Timers (Extends active card deadlines by outage duration)
 */
const resumeAllTimers = async ({ reason, admin }) => {
  if (!reason || reason.trim().length < 5) {
    const err = new Error('A mandatory reason is required to resume system timers.');
    err.status = 400;
    throw err;
  }

  const { data: currentSetting } = await supabase
    .from('game_settings')
    .select('setting_value')
    .eq('setting_key', 'timers_paused_control')
    .maybeSingle();

  const pausedAtStr = currentSetting?.setting_value?.paused_at;
  const pausedAt = pausedAtStr ? new Date(pausedAtStr).getTime() : Date.now();
  const outageDurationMs = Math.max(0, Date.now() - pausedAt);
  const outageMinutes = Math.round(outageDurationMs / (1000 * 60));

  // Fetch all active card sends and extend expires_at by outage duration
  const { data: activeSends } = await supabase
    .from('room_card_sends')
    .select('id, expires_at')
    .in('status', ['SENT', 'WAITING', 'IN_PROGRESS']);

  if (activeSends && activeSends.length > 0) {
    for (const send of activeSends) {
      if (send.expires_at) {
        const curExp = new Date(send.expires_at).getTime();
        const newExp = new Date(curExp + outageDurationMs).toISOString();
        await supabase
          .from('room_card_sends')
          .update({ expires_at: newExp })
          .eq('id', send.id);
      }
    }
  }

  const resumePayload = {
    is_paused: false,
    paused_at: null,
    last_outage_minutes: outageMinutes,
    resumed_at: new Date().toISOString(),
    resumed_by: admin?.name || 'Admin',
  };

  await supabase
    .from('game_settings')
    .upsert({
      setting_key: 'timers_paused_control',
      setting_value: resumePayload,
      description: 'Emergency outage timer freeze control',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'setting_key' });

  if (admin) {
    await logAdminAction({
      adminId: admin.id,
      adminName: admin.name,
      role: admin.role,
      actionType: 'RESUME_ALL_TIMERS',
      targetEntity: 'system_timers',
      targetId: 'all_active_rooms',
      afterState: resumePayload,
      reason: reason.trim(),
    });
  }

  return {
    message: `System timers resumed. All ${activeSends?.length || 0} active card deadlines extended by ${outageMinutes} minutes.`,
    control: resumePayload,
  };
};

/**
 * Fetch Current App-Wide Controls Status
 */
const getAppControls = async () => {
  const { data: settings } = await supabase
    .from('game_settings')
    .select('setting_key, setting_value, description, updated_at');

  const settingsMap = {};
  (settings || []).forEach(s => {
    settingsMap[s.setting_key] = s.setting_value;
  });

  return {
    timers_paused: settingsMap['timers_paused_control'] || { is_paused: false },
    maintenance_banner: settingsMap['maintenance_banner'] || {
      is_active: false,
      message: "We're fixing a minor problem — back soon!",
    },
    version_control: settingsMap['app_version_control'] || {
      min_android_version: '1.0.0',
      min_ios_version: '1.0.0',
      force_update: false,
    },
  };
};

/**
 * Update Maintenance Banner or Version Control
 */
const updateAppControlSetting = async ({ key, value, reason, admin }) => {
  if (!reason || reason.trim().length < 5) {
    const err = new Error('A detailed reason (minimum 5 characters) is required to update system controls.');
    err.status = 400;
    throw err;
  }

  const { error } = await supabase
    .from('game_settings')
    .upsert({
      setting_key: key,
      setting_value: value,
      updated_by: admin?.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'setting_key' });

  if (error) throw error;

  if (admin) {
    await logAdminAction({
      adminId: admin.id,
      adminName: admin.name,
      role: admin.role,
      actionType: `UPDATE_CONTROL_${key.toUpperCase()}`,
      targetEntity: 'app_controls',
      targetId: key,
      afterState: value,
      reason: reason.trim(),
    });
  }

  return {
    message: `Control ${key} updated successfully.`,
    key,
    value,
  };
};

module.exports = {
  unifiedSearch,
  getCoupleDetail,
  addSupportNote,
  resendInviteLink,
  restoreCard,
  extendTimer,
  pauseAllTimers,
  resumeAllTimers,
  getAppControls,
  updateAppControlSetting,
};
