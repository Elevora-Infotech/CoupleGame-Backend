'use strict';

/**
 * @file   full_journey_live_test.js
 * @desc   Full end-to-end live test:
 *         Admin setup → Categories → Cards → Bundles → Plans
 *         → 2 Users → Room → Purchase (Option B) → Deck → Play Card
 * @rules  If any bug is found, script STOPS and reports it clearly.
 *         No code is changed automatically.
 */

const axios = require('axios');
const { io } = require('socket.io-client');

const BASE    = 'http://localhost:3000/api/v1';
const SOCKET  = 'http://localhost:3000';
const ADMIN   = { email: 'admin@elevora.com', password: 'admin123' };

// ─── State ────────────────────────────────────────────────────
let adminToken   = '';
let p1Token = '', p1Id = '', p1Email = '';
let p2Token = '', p2Id = '', p2Email = '';
let roomId = '', roomCode = '';
let cat1Id = '', cat2Id = '';
let card1Id = '', card2Id = '', card3Id = '',
    card4Id = '', card5Id = '', card6Id = '',
    card7Id = '', card8Id = '', card9Id = '', card10Id = '';
let bundle1Id = '', bundle2Id = '';
let plan1Id   = '', plan2Id   = '';
let deckCardId = '';

// ─── Helpers ──────────────────────────────────────────────────
let passed = 0; let failed = 0; const bugs = [];

const ok   = (msg)      => { passed++; console.log(`  ✔ PASS | ${msg}`); };
const bug  = (name, err) => {
  failed++;
  const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || String(err);
  const status = err?.response?.status || 'NO_RESPONSE';
  bugs.push({ name, status, msg });
  console.log(`\n  ✘ BUG FOUND | ${name}`);
  console.log(`    Status  : ${status}`);
  console.log(`    Message : ${msg}`);
  console.log(`\n  ⛔ Stopping test. Fix this bug first, then re-run.\n`);
  printReport();
  process.exit(1);
};
const section = (t) => console.log(`\n${'─'.repeat(58)}\n  ${t}\n${'─'.repeat(58)}`);

const printReport = () => {
  console.log(`\n${'═'.repeat(58)}`);
  console.log(`  📊 LIVE TEST REPORT`);
  console.log(`${'═'.repeat(58)}`);
  console.log(`  ✅ Passed : ${passed}`);
  console.log(`  ❌ Bugs   : ${failed}`);
  if (bugs.length) {
    console.log(`\n  🐛 BUGS TO FIX:`);
    bugs.forEach((b, i) =>
      console.log(`  ${i+1}. [${b.status}] ${b.name}\n     → ${b.msg}`));
  } else {
    console.log(`\n  🎉 ALL TESTS PASSED — System is fully operational!`);
  }
  console.log(`${'═'.repeat(58)}\n`);
};

const auth  = (t) => ({ headers: { Authorization: `Bearer ${t}` } });

// ─── MAIN ─────────────────────────────────────────────────────
async function run() {
  console.log('\n🚀 ELEVORA FULL JOURNEY LIVE TEST  →  ' + BASE);
  console.log('   Option B: Room-Only Economy enforced\n');

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Admin Login
  // ═══════════════════════════════════════════════════════════
  section('STEP 1: Admin Login');
  try {
    const r = await axios.post(`${BASE}/admin/auth/login`, ADMIN);
    adminToken = r.data.data.token;
    ok('Admin login');
  } catch (e) { bug('Admin login', e); }

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Create 2 Categories
  // ═══════════════════════════════════════════════════════════
  section('STEP 2: Create 2 Categories');
  try {
    const r = await axios.post(`${BASE}/admin/dashboard/categories`, {
      name: `Romance_${Date.now()}`, description: 'Romantic cards', theme_color: '#FF6B6B', order_index: 1
    }, auth(adminToken));
    cat1Id = r.data.data.category.id;
    ok(`Category 1 created → ${cat1Id}`);
  } catch (e) { bug('Create Category 1', e); }

  try {
    const r = await axios.post(`${BASE}/admin/dashboard/categories`, {
      name: `Adventure_${Date.now()}`, description: 'Adventure cards', theme_color: '#4ECDC4', order_index: 2
    }, auth(adminToken));
    cat2Id = r.data.data.category.id;
    ok(`Category 2 created → ${cat2Id}`);
  } catch (e) { bug('Create Category 2', e); }

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Create 10 Cards (5 in each category)
  // ═══════════════════════════════════════════════════════════
  section('STEP 3: Create 10 Cards (5 per category)');
  const cardDefs = [
    { name: 'Whisper Sweet Nothings', category_id: cat1Id },
    { name: 'Write a Love Letter',    category_id: cat1Id },
    { name: 'Candlelight Dinner',     category_id: cat1Id },
    { name: 'Star Gazing Date',       category_id: cat1Id },
    { name: 'Morning Surprise',       category_id: cat1Id },
    { name: 'Hiking Together',        category_id: cat2Id },
    { name: 'Cook a New Recipe',      category_id: cat2Id },
    { name: 'Dance in the Rain',      category_id: cat2Id },
    { name: 'Road Trip Adventure',    category_id: cat2Id },
    { name: 'Paint Together',         category_id: cat2Id },
  ];
  const cardIds = [];
  for (const def of cardDefs) {
    try {
      const r = await axios.post(`${BASE}/admin/dashboard/cards`, {
        category_id: def.category_id,
        name: def.name,
        power_description: `Power of: ${def.name}`,
        card_type: 'ACTION'
      }, auth(adminToken));
      cardIds.push(r.data.data.card.id);
      ok(`Card created: "${def.name}"`);
    } catch (e) { bug(`Create card "${def.name}"`, e); }
  }
  [card1Id, card2Id, card3Id, card4Id, card5Id,
   card6Id, card7Id, card8Id, card9Id, card10Id] = cardIds;

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Create 2 Bundles
  // ═══════════════════════════════════════════════════════════
  section('STEP 4: Create 2 Bundles');
  try {
    const r = await axios.post(`${BASE}/admin/bundles`, {
      name: `RomancePack_${Date.now()}`,
      description: 'Romantic couple cards',
      cover_image_url: 'https://example.com/romance.jpg'
    }, auth(adminToken));
    bundle1Id = r.data.data.bundle.id;
    ok(`Bundle 1 (Romance) created → ${bundle1Id}`);
  } catch (e) { bug('Create Bundle 1', e); }

  try {
    const r = await axios.post(`${BASE}/admin/bundles`, {
      name: `AdventurePack_${Date.now()}`,
      description: 'Adventure couple cards',
      cover_image_url: 'https://example.com/adventure.jpg'
    }, auth(adminToken));
    bundle2Id = r.data.data.bundle.id;
    ok(`Bundle 2 (Adventure) created → ${bundle2Id}`);
  } catch (e) { bug('Create Bundle 2', e); }

  // ═══════════════════════════════════════════════════════════
  // STEP 5: Add Cards to Bundles
  // ═══════════════════════════════════════════════════════════
  section('STEP 5: Add Cards to Bundles');
  try {
    await axios.post(`${BASE}/admin/bundles/${bundle1Id}/cards`,
      { card_ids: [card1Id, card2Id, card3Id, card4Id, card5Id] },
      auth(adminToken));
    ok('5 Romance cards added to Bundle 1');
  } catch (e) { bug('Add cards to Bundle 1', e); }

  try {
    await axios.post(`${BASE}/admin/bundles/${bundle2Id}/cards`,
      { card_ids: [card6Id, card7Id, card8Id, card9Id, card10Id] },
      auth(adminToken));
    ok('5 Adventure cards added to Bundle 2');
  } catch (e) { bug('Add cards to Bundle 2', e); }

  // ═══════════════════════════════════════════════════════════
  // STEP 6: Create Pricing Plans (₹10 for 5 cards)
  // ═══════════════════════════════════════════════════════════
  section('STEP 6: Create Pricing Plans (₹10 for 5 cards)');
  try {
    const r = await axios.post(`${BASE}/admin/bundles/${bundle1Id}/plans`, {
      name: 'Starter', price: 10.00, card_count: 5
    }, auth(adminToken));
    plan1Id = r.data.data.plan.id;
    ok(`Plan for Bundle 1 created → ₹10 for 5 cards (ID: ${plan1Id})`);
    const sp = r.data.data.plan.store_product_id || 'auto-generated';
    console.log(`     store_product_id: ${sp}`);
  } catch (e) { bug('Create Plan for Bundle 1', e); }

  try {
    const r = await axios.post(`${BASE}/admin/bundles/${bundle2Id}/plans`, {
      name: 'Starter', price: 10.00, card_count: 5
    }, auth(adminToken));
    plan2Id = r.data.data.plan.id;
    ok(`Plan for Bundle 2 created → ₹10 for 5 cards (ID: ${plan2Id})`);
  } catch (e) { bug('Create Plan for Bundle 2', e); }

  // ═══════════════════════════════════════════════════════════
  // STEP 7: Verify Store is Showing Bundles
  // ═══════════════════════════════════════════════════════════
  section('STEP 7: Verify Bundles Appear in User Store');

  // Create Partner 1
  const ts = Date.now();
  p1Email = `partner1_${ts}@test.com`;
  try {
    const r = await axios.post(`${BASE}/auth/signup`, { name: 'Partner One', email: p1Email, password: 'password123' });
    p1Token = r.data.data.accessToken;
    p1Id    = r.data.data.user.id;
    ok(`Partner 1 created (${p1Email})`);
  } catch (e) { bug('Create Partner 1', e); }

  // Create Partner 2
  p2Email = `partner2_${ts}@test.com`;
  try {
    const r = await axios.post(`${BASE}/auth/signup`, { name: 'Partner Two', email: p2Email, password: 'password123' });
    p2Token = r.data.data.accessToken;
    p2Id    = r.data.data.user.id;
    ok(`Partner 2 created (${p2Email})`);
  } catch (e) { bug('Create Partner 2', e); }

  // Check store from Partner 1
  try {
    const r = await axios.get(`${BASE}/store/bundles`, auth(p1Token));
    const count = r.data.data.bundles.length;
    if (count === 0) throw new Error('Store returned 0 bundles!');
    ok(`Store shows ${count} bundle(s) to Partner 1`);
    r.data.data.bundles.slice(0, 3).forEach(b =>
      console.log(`     → Bundle: "${b.name}" with ${b.total_plans || 0} plan(s)`));
  } catch (e) { bug('User store bundles', e); }

  // ═══════════════════════════════════════════════════════════
  // STEP 8: Partner 1 Creates Room, Partner 2 Joins
  // ═══════════════════════════════════════════════════════════
  section('STEP 8: Room Creation & Partner Join');
  try {
    const r = await axios.post(`${BASE}/rooms/create`, { expiry_type: '7_DAYS' }, auth(p1Token));
    roomId   = r.data.data.room.id;
    roomCode = r.data.data.room.code;
    ok(`Partner 1 created room → Code: ${roomCode} | ID: ${roomId}`);
  } catch (e) { bug('Create room', e); }

  try {
    const r = await axios.post(`${BASE}/rooms/join`, { code: roomCode }, auth(p2Token));
    const status = r.data.data.room.status;
    if (status !== 'ACTIVE') throw new Error(`Room status is "${status}", expected "ACTIVE"`);
    ok(`Partner 2 joined room → Status is ACTIVE ✓`);
  } catch (e) { bug('Partner 2 join room', e); }

  // ═══════════════════════════════════════════════════════════
  // STEP 9: Verify Both Partners Connected via Socket.io
  // ═══════════════════════════════════════════════════════════
  section('STEP 9: Socket.io Connection Test (Both Partners)');

  await new Promise((resolve) => {
    let p1Connected = false;
    let p2Connected = false;

    const check = () => {
      if (p1Connected && p2Connected) {
        ok('Partner 1 Socket.io connected via JWT ✓');
        ok('Partner 2 Socket.io connected via JWT ✓');
        resolve();
      }
    };

    const sock1 = io(SOCKET, { auth: { token: p1Token }, transports: ['websocket'] });
    const sock2 = io(SOCKET, { auth: { token: p2Token }, transports: ['websocket'] });

    sock1.on('connect', () => { p1Connected = true; sock1.disconnect(); check(); });
    sock2.on('connect', () => { p2Connected = true; sock2.disconnect(); check(); });

    sock1.on('connect_error', (e) => bug('Partner 1 Socket.io', e));
    sock2.on('connect_error', (e) => bug('Partner 2 Socket.io', e));

    setTimeout(() => {
      if (!p1Connected || !p2Connected) {
        bug('Socket.io timeout', new Error('One or both partners failed to connect within 5 seconds'));
      }
    }, 5000);
  });

  // ═══════════════════════════════════════════════════════════
  // STEP 10: Simulate RevenueCat Webhook (Real Purchase Flow)
  //
  // This is the EXACT same code path that runs in production.
  // We build a fake RevenueCat webhook payload and sign it
  // with the real REVENUECAT_WEBHOOK_SECRET — just like
  // RevenueCat does after a real Apple/Google Pay transaction.
  //
  // Option B: Partner 1 must be in an ACTIVE room at this
  // moment for the backend to accept and process the payment.
  // ═══════════════════════════════════════════════════════════
  section('STEP 10: Simulate RevenueCat Webhook (Real Purchase Flow)');

  // Fetch the store_product_id for bundle 1 plan
  let storeProductId = '';
  try {
    const r = await axios.get(`${BASE}/admin/bundles/${bundle1Id}/plans`, auth(adminToken));
    const plan = r.data.data.plans.find(p => p.id === plan1Id);
    storeProductId = plan?.store_product_id || '';
    if (!storeProductId) throw new Error('store_product_id not found on plan!');
    ok(`Fetched store_product_id: ${storeProductId}`);
  } catch (e) { bug('Fetch store_product_id', e); }

  // Build the RevenueCat-style webhook payload
  // app_user_id = Partner 1's ID (EleVora user ID)
  const webhookPayload = {
    type: 'NON_RENEWING_PURCHASE',
    event: {
      app_user_id:    p1Id,
      product_id:     storeProductId,
      transaction_id: `TEST_TXN_${Date.now()}`,
      store:          'PLAY_STORE',   // or 'APPLE_STORE'
      price:          10.00,
      currency:       'INR',
    }
  };

  // Send exactly like RevenueCat — using the webhook secret as Bearer token
  const WEBHOOK_SECRET = 'elevora_test_webhook_secret_2026';
  try {
    const r = await axios.post(`${BASE}/store/purchase/verify`,
      webhookPayload,
      { headers: { Authorization: `Bearer ${WEBHOOK_SECRET}` } }
    );
    const data = r.data.data;
    if (data.skipped) throw new Error(`Webhook was skipped: ${data.reason}`);
    ok(`RevenueCat webhook processed! cards_received: ${data.cards_received}`);
    ok(`purchase_id: ${data.purchase_id}`);
  } catch (e) { bug('RevenueCat webhook simulation (real purchase flow)', e); }

  // ═══════════════════════════════════════════════════════════
  // STEP 11: Partner 1 Views Full Deck
  // ═══════════════════════════════════════════════════════════
  section('STEP 11: Partner 1 Views Full Deck');
  try {
    const r = await axios.get(`${BASE}/user/deck`, auth(p1Token));
    const total = r.data.data.total;
    if (total === 0) throw new Error('Deck is empty after grant!');
    ok(`Partner 1 deck has ${total} card(s)`);
    r.data.data.cards.forEach((c, i) =>
      console.log(`     Card ${i+1}: "${c.card_name || c.name || c.card_id}" | used: ${c.is_used} | expired: ${c.expired}`));
  } catch (e) { bug('Get user deck', e); }

  // ═══════════════════════════════════════════════════════════
  // STEP 12: Partner 1 Gets Available Cards for THIS Room
  // ═══════════════════════════════════════════════════════════
  section('STEP 12: Partner 1 Fetches Available Cards for Room');
  try {
    const r = await axios.get(`${BASE}/user/deck/available?room_id=${roomId}`, auth(p1Token));
    const total = r.data.data.total;
    if (total === 0) throw new Error('No available cards found for this room!');
    ok(`${total} card(s) available for room ${roomCode}`);
    deckCardId = r.data.data.cards[0].deck_card_id;
    console.log(`     First available deck_card_id: ${deckCardId}`);
  } catch (e) { bug('Get available cards (Option B room filter)', e); }

  // ═══════════════════════════════════════════════════════════
  // STEP 13: Partner 1 Plays a Card in the Room
  // ═══════════════════════════════════════════════════════════
  section('STEP 13: Partner 1 Plays a Card in the Room');
  try {
    const r = await axios.post(`${BASE}/user/deck/${deckCardId}/use`,
      { room_id: roomId }, auth(p1Token));
    const card = r.data.data.card;
    if (!card.is_used) throw new Error('Card is_used flag did NOT update to TRUE!');
    if (card.room_id !== roomId) throw new Error(`Card room_id mismatch! Got: ${card.room_id}`);
    ok(`Card played! is_used=TRUE, linked to room ${roomCode} ✓`);
  } catch (e) { bug('Play card in room', e); }

  // ═══════════════════════════════════════════════════════════
  // STEP 14: Admin Audits Partner 1's Deck
  // ═══════════════════════════════════════════════════════════
  section('STEP 14: Admin Deck Audit for Partner 1');
  try {
    const r = await axios.get(`${BASE}/admin/users/${p1Id}/deck`, auth(adminToken));
    const total = r.data.data.total;
    ok(`Admin audit: Partner 1 has ${total} card(s) in deck`);
  } catch (e) { bug('Admin deck audit', e); }

  // ─────────────────────────────────────────────────────────
  printReport();
}

run().catch(e => {
  console.error('\n💥 Unhandled crash:', e.message);
  process.exit(1);
});
