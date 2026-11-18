'use strict';

/**
 * @file   adminRevenueService.js
 * @desc   Business, Subscriptions & Revenue Operations Service (Part B3 & C9)
 *
 * Capabilities:
 *  1. getSubscriptionsLedger    — Paginated couples subscription registry with Golden Payer badge & countdown
 *  2. getRevenueMetrics         — MRR, Gross, Net, ARPPU, Refund rate, daily trends, iOS/Android breakdown
 *  3. getPaywallFunnelMetrics   — Real-time paywall impressions, trigger screen performance, 6-stage funnel
 *  4. getMarketingROI           — Ad spend tracking, Blended CAC, ROAS, angle performance
 *  5. recordAdSpend             — Add marketing spend records with mandatory audit reason
 *  6. processAdminRefund        — Role-gated refund with mandatory reason & entitlement revocation
 *  7. grantComplimentarySubscription — Complimentary season pass grants for support/PR resolution
 */

const { supabase } = require('../db/supabase');
const { maskPhoneNumber, maskEmail } = require('../utils/privacyMasker');
const { formatIST, logAdminAction } = require('./adminAuditService');

const throwError = (message, status = 500) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

// ─────────────────────────────────────────────────────────────
// 1. SUBSCRIPTIONS LEDGER (Couple Registry & Season Passes)
// ─────────────────────────────────────────────────────────────
const getSubscriptionsLedger = async ({
  page = 1,
  limit = 20,
  status = '',
  platform = '',
  search = '',
} = {}) => {
  const offset = (page - 1) * limit;

  let query = supabase
    .from('subscriptions')
    .select(`
      id, room_id, payer_id, store_product_id, payment_source, status,
      current_season, autopay_status, started_at, ends_at, cancelled_at, created_at,
      room:rooms!subscriptions_room_id_fkey(
        id, code, mode, status, paired_at, created_at,
        host:users!rooms_host_id_fkey(id, name, email, phone, phone_masked, platform),
        partner:users!rooms_partner_id_fkey(id, name, email, phone, phone_masked, platform)
      ),
      payer:users!subscriptions_payer_id_fkey(id, name, email, phone, phone_masked, platform)
    `, { count: 'exact' });

  if (status) {
    query = query.eq('status', status.toLowerCase());
  }

  query = query
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    console.error('[AdminRevenueService] Subscriptions ledger error:', error.message);
    throwError(error.message, 400);
  }

  const now = Date.now();

  let formatted = (data || []).map((sub) => {
    const room = sub.room || {};
    const payer = sub.payer || {};
    const partner = (room.host?.id === payer.id) ? room.partner : room.host;
    const endsAtTime = new Date(sub.ends_at).getTime();
    const daysRemaining = Math.max(0, Math.ceil((endsAtTime - now) / (1000 * 60 * 60 * 24)));

    return {
      subscription_id: sub.id,
      couple_id: sub.room_id,
      room_code: room.code || 'N/A',
      room_status: room.status || 'ACTIVE',
      season_number: sub.current_season || 1,
      status: sub.status,
      autopay_status: sub.autopay_status || 'active',
      started_at_ist: formatIST(sub.started_at),
      ends_at_ist: formatIST(sub.ends_at),
      days_remaining: daysRemaining,
      store_product_id: sub.store_product_id,
      payment_source: sub.payment_source || 'revenuecat',
      payer: payer.id ? {
        id: payer.id,
        name: payer.name || 'Payer',
        email_masked: maskEmail(payer.email),
        phone_masked: maskPhoneNumber(payer.phone_masked || payer.phone),
        platform: payer.platform || 'android',
        is_payer: true,
      } : null,
      partner: partner?.id ? {
        id: partner.id,
        name: partner.name || 'Partner',
        email_masked: maskEmail(partner.email),
        phone_masked: maskPhoneNumber(partner.phone_masked || partner.phone),
        platform: partner.platform || 'ios',
        is_payer: false,
      } : null,
      price_inr: 299,
    };
  });

  // Client-side search & platform filter (if combined)
  if (platform) {
    formatted = formatted.filter(s => 
      s.payer?.platform?.toLowerCase() === platform.toLowerCase() ||
      s.partner?.platform?.toLowerCase() === platform.toLowerCase() ||
      s.payment_source?.toLowerCase().includes(platform.toLowerCase())
    );
  }

  if (search) {
    const q = search.toLowerCase().trim();
    formatted = formatted.filter(s =>
      s.room_code.toLowerCase().includes(q) ||
      s.payer?.name?.toLowerCase().includes(q) ||
      s.partner?.name?.toLowerCase().includes(q) ||
      s.store_product_id?.toLowerCase().includes(q)
    );
  }

  return {
    subscriptions: formatted,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: count || formatted.length,
      pages: Math.ceil((count || formatted.length) / limit),
    },
  };
};

// ─────────────────────────────────────────────────────────────
// 2. REVENUE METRICS & FINANCIAL KPIS (Part C9)
// ─────────────────────────────────────────────────────────────
const getRevenueMetrics = async ({ range = '30d' } = {}) => {
  // 1. Fetch completed and refunded purchases
  const { data: purchases, error: purErr } = await supabase
    .from('user_purchases')
    .select('id, amount_paid, status, platform, payment_source, purchased_at, refunded_at');

  if (purErr) throwError(purErr.message, 400);

  const completedPurchases = (purchases || []).filter(p => p.status === 'completed');
  const refundedPurchases  = (purchases || []).filter(p => p.status === 'refunded');

  const grossRevenue = completedPurchases.reduce((acc, p) => acc + Number(p.amount_paid || 0), 0);
  const refundedAmount = refundedPurchases.reduce((acc, p) => acc + Number(p.amount_paid || 0), 0);
  // Standard app store commission model (15% platform tier)
  const platformFees = +(grossRevenue * 0.15).toFixed(2);
  const netRevenue = +(grossRevenue - platformFees - refundedAmount).toFixed(2);

  // 2. Active Subscriptions & MRR
  const { data: activeSubs, error: subErr } = await supabase
    .from('subscriptions')
    .select('id, room_id, status, payer_id, payment_source, started_at, ends_at')
    .eq('status', 'active');

  const activeSubscriptionsCount = activeSubs ? activeSubs.length : 0;
  // Normalized 30-day Season Pass price: ₹299
  const mrr = activeSubscriptionsCount * 299;

  // 3. Distinct Paying Couples / Users
  const payingUserIds = new Set(completedPurchases.map(p => p.user_id));
  const totalPayingCouples = Math.max(1, payingUserIds.size);
  const arppu = +(grossRevenue / totalPayingCouples).toFixed(2);

  const totalTransactions = purchases ? purchases.length : 0;
  const refundRate = totalTransactions > 0 
    ? +((refundedPurchases.length / totalTransactions) * 100).toFixed(2) 
    : 0.0;

  // 4. Platform Breakdown
  const platformBreakdown = {
    ios: { revenue: 0, transactions: 0 },
    android: { revenue: 0, transactions: 0 },
  };

  completedPurchases.forEach(p => {
    const plat = (p.platform || 'android').toLowerCase().includes('ios') ? 'ios' : 'android';
    platformBreakdown[plat].revenue += Number(p.amount_paid || 0);
    platformBreakdown[plat].transactions += 1;
  });

  // 5. Daily Revenue Trend (Last 30 Days)
  const days = 30;
  const dailyTrend = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    const dayPurchases = completedPurchases.filter(p => p.purchased_at && p.purchased_at.startsWith(dateStr));
    const dayRefunds   = refundedPurchases.filter(p => p.refunded_at && p.refunded_at.startsWith(dateStr));

    const dayGross = dayPurchases.reduce((acc, p) => acc + Number(p.amount_paid || 0), 0);
    const dayRefAmt = dayRefunds.reduce((acc, p) => acc + Number(p.amount_paid || 0), 0);

    dailyTrend.push({
      date: dateStr,
      gross: dayGross,
      refunds: dayRefAmt,
      net: +(dayGross * 0.85 - dayRefAmt).toFixed(2),
      transactions: dayPurchases.length,
    });
  }

  return {
    kpis: {
      mrr,
      gross_revenue: grossRevenue,
      net_revenue: netRevenue,
      platform_fees: platformFees,
      refunded_amount: refundedAmount,
      active_subscriptions: activeSubscriptionsCount,
      total_paying_couples: totalPayingCouples,
      arppu,
      refund_rate: refundRate,
      currency: 'INR',
    },
    platform_breakdown: platformBreakdown,
    daily_trend: dailyTrend,
  };
};

// ─────────────────────────────────────────────────────────────
// 3. PAYWALL & CONVERSION FUNNEL METRICS (Part C9)
// ─────────────────────────────────────────────────────────────
const getPaywallFunnelMetrics = async () => {
  // A. Fetch Paywall Impressions
  const { data: views, error: viewErr } = await supabase
    .from('paywall_views')
    .select('id, player_id, room_id, game_number, action_taken, store_offering_id, viewed_at');

  if (viewErr) throwError(viewErr.message, 400);

  const totalViews = views ? views.length : 0;
  const paidViews = (views || []).filter(v => v.action_taken === 'paid').length;
  const replayedFreeViews = (views || []).filter(v => v.action_taken === 'replayed_free').length;
  const closedViews = (views || []).filter(v => v.action_taken === 'closed').length;

  const conversionRate = totalViews > 0 ? +((paidViews / totalViews) * 100).toFixed(2) : 0.0;

  // Breakdown by trigger screen
  const triggerMap = {};
  (views || []).forEach(v => {
    const trigger = v.store_offering_id || 'default_store';
    if (!triggerMap[trigger]) {
      triggerMap[trigger] = { trigger, views: 0, conversions: 0 };
    }
    triggerMap[trigger].views += 1;
    if (v.action_taken === 'paid') {
      triggerMap[trigger].conversions += 1;
    }
  });

  const byTrigger = Object.values(triggerMap).map(t => ({
    ...t,
    conversion_rate: t.views > 0 ? +((t.conversions / t.views) * 100).toFixed(2) : 0.0,
  }));

  // B. Complete 6-Stage Conversion Funnel
  const [usersCountRes, roomsCountRes, pairedRoomsRes, subscriptionsCountRes] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('rooms').select('id', { count: 'exact', head: true }),
    supabase.from('rooms').select('id', { count: 'exact', head: true }).not('paired_at', 'is', null),
    supabase.from('subscriptions').select('id, current_season'),
  ]);

  const totalUsers = usersCountRes.count || 0;
  const totalRooms = roomsCountRes.count || 0;
  const pairedRooms = pairedRoomsRes.count || 0;
  const season1Couples = (subscriptionsCountRes.data || []).length;
  const season2Renewals = (subscriptionsCountRes.data || []).filter(s => (s.current_season || 1) >= 2).length;

  const funnelStages = [
    { stage: 'App Installs / Signups', count: totalUsers, dropoff_rate: 0 },
    {
      stage: 'Room Created',
      count: totalRooms,
      dropoff_rate: totalUsers > 0 ? +(((totalUsers - totalRooms) / totalUsers) * 100).toFixed(1) : 0,
    },
    {
      stage: 'Partner Paired',
      count: pairedRooms,
      dropoff_rate: totalRooms > 0 ? +(((totalRooms - pairedRooms) / totalRooms) * 100).toFixed(1) : 0,
    },
    {
      stage: 'Paywall Viewed',
      count: totalViews,
      dropoff_rate: pairedRooms > 0 ? +(((pairedRooms - Math.min(pairedRooms, totalViews)) / pairedRooms) * 100).toFixed(1) : 0,
    },
    {
      stage: 'Season 1 Subscribed',
      count: season1Couples,
      dropoff_rate: totalViews > 0 ? +(((totalViews - season1Couples) / totalViews) * 100).toFixed(1) : 0,
    },
    {
      stage: 'Season 2 Renewed',
      count: season2Renewals,
      dropoff_rate: season1Couples > 0 ? +(((season1Couples - season2Renewals) / season1Couples) * 100).toFixed(1) : 0,
    },
  ];

  return {
    summary: {
      total_views: totalViews,
      conversions_paid: paidViews,
      conversions_replayed_free: replayedFreeViews,
      closed_without_action: closedViews,
      conversion_rate: conversionRate,
    },
    by_trigger: byTrigger,
    funnel_stages: funnelStages,
  };
};

// ─────────────────────────────────────────────────────────────
// 4. MARKETING ROI & AD SPEND CAC ENGINE (Part B3 & C9)
// ─────────────────────────────────────────────────────────────
const getMarketingROI = async () => {
  // Fetch marketing ad spend
  const { data: adSpendRows, error } = await supabase
    .from('ad_spend')
    .select('*')
    .order('week_start_ist', { ascending: false });

  if (error) throwError(error.message, 400);

  const totalAdSpend = (adSpendRows || []).reduce((acc, r) => acc + Number(r.amount_inr || 0), 0);

  // Fetch paying couples count
  const { data: purchases } = await supabase
    .from('user_purchases')
    .select('user_id, amount_paid')
    .eq('status', 'completed');

  const grossRevenue = (purchases || []).reduce((acc, p) => acc + Number(p.amount_paid || 0), 0);
  const payingUsersCount = new Set((purchases || []).map(p => p.user_id)).size;

  const blendedCAC = payingUsersCount > 0 ? +(totalAdSpend / payingUsersCount).toFixed(2) : 0.0;
  const roas = totalAdSpend > 0 ? +(grossRevenue / totalAdSpend).toFixed(2) : 0.0;
  // Payback period (months): CAC / (ARPPU * margin)
  const cacPaybackDays = blendedCAC > 0 && grossRevenue > 0
    ? Math.round((blendedCAC / (grossRevenue / Math.max(1, payingUsersCount))) * 30)
    : 14;

  // Breakdown by campaign type and angle
  const campaignMap = {};
  (adSpendRows || []).forEach(r => {
    const key = `${r.campaign_type} - ${r.ad_angle}`;
    if (!campaignMap[key]) {
      campaignMap[key] = {
        campaign_type: r.campaign_type,
        ad_angle: r.ad_angle,
        total_spend: 0,
        entries_count: 0,
      };
    }
    campaignMap[key].total_spend += Number(r.amount_inr || 0);
    campaignMap[key].entries_count += 1;
  });

  return {
    metrics: {
      total_ad_spend: totalAdSpend,
      blended_cac: blendedCAC,
      roas,
      cac_payback_days: cacPaybackDays,
      paying_couples_acquired: payingUsersCount,
    },
    campaign_breakdown: Object.values(campaignMap),
    recent_entries: (adSpendRows || []).slice(0, 10),
  };
};

/**
 * Record New Ad Spend Entry
 */
const recordAdSpend = async ({
  week_start_ist,
  week_end_ist,
  campaign_type,
  ad_angle,
  amount_inr,
  reason,
  admin,
}) => {
  if (!reason || reason.trim().length < 5) {
    throwError('A detailed reason (minimum 5 characters) is required to record ad spend.', 400);
  }
  if (!week_start_ist || !week_end_ist || !amount_inr) {
    throwError('week_start_ist, week_end_ist, and amount_inr are required.', 400);
  }

  const { data, error } = await supabase
    .from('ad_spend')
    .insert({
      week_start_ist,
      week_end_ist,
      campaign_type: campaign_type || 'install',
      ad_angle: ad_angle || 'general',
      amount_inr: Number(amount_inr),
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throwError(error.message, 400);

  if (admin) {
    await logAdminAction({
      adminId: admin.id,
      adminName: admin.name,
      role: admin.role,
      actionType: 'RECORD_AD_SPEND',
      targetEntity: 'ad_spend',
      targetId: data.id,
      afterState: data,
      reason: reason.trim(),
    });
  }

  return {
    message: 'Ad spend entry successfully recorded.',
    entry: data,
  };
};

// ─────────────────────────────────────────────────────────────
// 5. PROCESS REFUND & REVOKE ENTITLEMENTS (Part B3)
// ─────────────────────────────────────────────────────────────
const processAdminRefund = async ({ purchaseId, reason, admin }) => {
  if (!reason || reason.trim().length < 5) {
    throwError('A mandatory reason (minimum 5 characters) is required to process refunds.', 400);
  }

  // 1. Fetch Purchase Record
  const { data: purchase, error: purErr } = await supabase
    .from('user_purchases')
    .select('id, user_id, amount_paid, status, store_transaction_id')
    .eq('id', purchaseId)
    .single();

  if (purErr || !purchase) {
    throwError('Purchase record not found.', 404);
  }
  if (purchase.status === 'refunded') {
    throwError('Purchase has already been refunded.', 409);
  }

  // 2. Mark Purchase as Refunded
  const { data: updatedPurchase, error: updErr } = await supabase
    .from('user_purchases')
    .update({
      status: 'refunded',
      admin_note: reason.trim(),
      refunded_at: new Date().toISOString(),
    })
    .eq('id', purchaseId)
    .select()
    .single();

  if (updErr) throwError(updErr.message, 500);

  // 3. Revoke active subscription if payer matched
  const { data: activeSub } = await supabase
    .from('subscriptions')
    .select('id, room_id, status')
    .eq('payer_id', purchase.user_id)
    .eq('status', 'active')
    .maybeSingle();

  if (activeSub) {
    await supabase
      .from('subscriptions')
      .update({
        status: 'ended',
        autopay_status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', activeSub.id);

    // Revert room mode back to free
    await supabase
      .from('rooms')
      .update({ mode: 'free' })
      .eq('id', activeSub.room_id);
  }

  // 4. Log to Immutable Audit Logs
  if (admin) {
    await logAdminAction({
      adminId: admin.id,
      adminName: admin.name,
      role: admin.role,
      actionType: 'PROCESS_REVENUECAT_REFUND',
      targetEntity: 'user_purchases',
      targetId: purchaseId,
      beforeState: { status: purchase.status, amount_paid: purchase.amount_paid },
      afterState: { status: 'refunded', refunded_at: updatedPurchase.refunded_at },
      reason: reason.trim(),
    });
  }

  return {
    message: 'Refund successfully recorded and couple entitlement revoked.',
    purchase: updatedPurchase,
  };
};

// ─────────────────────────────────────────────────────────────
// 6. GRANT COMPLIMENTARY SEASON PASS (Support & PR Resolution)
// ─────────────────────────────────────────────────────────────
const grantComplimentarySubscription = async ({
  roomId,
  seasonNumber = 1,
  durationDays = 30,
  reason,
  admin,
}) => {
  if (!reason || reason.trim().length < 5) {
    throwError('A detailed reason (minimum 5 characters) is mandatory to grant complimentary access.', 400);
  }

  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select('id, code, host_id, partner_id')
    .eq('id', roomId)
    .single();

  if (roomErr || !room) {
    throwError('Room not found.', 404);
  }

  const payerId = room.host_id;
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // Upsert into subscriptions
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .insert({
      room_id: roomId,
      payer_id: payerId,
      store_product_id: 'season_pass_complimentary_grant',
      payment_source: 'revenuecat_admin_grant',
      status: 'active',
      current_season: seasonNumber,
      autopay_status: 'cancelled', // Complimentary does not auto-renew
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
      created_at: startedAt.toISOString(),
      updated_at: startedAt.toISOString(),
    })
    .select()
    .single();

  if (subErr) throwError(subErr.message, 500);

  // Upgrade room to paid mode
  await supabase
    .from('rooms')
    .update({ mode: 'paid', current_game_number: seasonNumber })
    .eq('id', roomId);

  // Audit log
  if (admin) {
    await logAdminAction({
      adminId: admin.id,
      adminName: admin.name,
      role: admin.role,
      actionType: 'GRANT_COMPLIMENTARY_SUBSCRIPTION',
      targetEntity: 'subscriptions',
      targetId: sub.id,
      afterState: sub,
      reason: reason.trim(),
    });
  }

  return {
    message: `Complimentary Season ${seasonNumber} pass granted to room ${room.code} for ${durationDays} days.`,
    subscription: sub,
  };
};

module.exports = {
  getSubscriptionsLedger,
  getRevenueMetrics,
  getPaywallFunnelMetrics,
  getMarketingROI,
  recordAdSpend,
  processAdminRefund,
  grantComplimentarySubscription,
};
