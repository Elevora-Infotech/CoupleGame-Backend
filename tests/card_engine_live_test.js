'use strict';

/**
 * @file   card_engine_live_test.js
 * @desc   Integration test for Card Game Engine (Phase 4):
 *         Room scope, daily limits, active limits, state transitions, Socket.io
 * @rules  No database deletion. Exits 1 if bug found.
 */

const axios = require('axios');
const { io } = require('socket.io-client');

const BASE    = 'http://localhost:3000/api/v1';
const SOCKET  = 'http://localhost:3000';
const ADMIN   = { email: 'admin@elevora.com', password: 'admin123' };

let adminToken = '';
let p1Token = '', p1Id = '', p1Email = '';
let p2Token = '', p2Id = '', p2Email = '';
let roomId = '', roomCode = '';
let catId = '';
let cardIds = [];
let bundleId = '';
let planId   = '';

let passed = 0; let failed = 0; const bugs = [];

const ok = (msg) => { passed++; console.log(`  ✔ PASS | ${msg}`); };
const bug = (name, err) => {
  failed++;
  const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || String(err);
  const status = err?.response?.status || 'NO_RESPONSE';
  bugs.push({ name, status, msg });
  console.log(`\n  ✘ BUG FOUND | ${name}`);
  console.log(`    Status  : ${status}`);
  console.log(`    Message : ${msg}`);
  printReport();
  process.exit(1);
};

const printReport = () => {
  console.log(`\n${'═'.repeat(58)}`);
  console.log(`  📊 CARD ENGINE LIVE TEST REPORT`);
  console.log(`${'═'.repeat(58)}`);
  console.log(`  ✅ Passed : ${passed}`);
  console.log(`  ❌ Bugs   : ${failed}`);
  if (bugs.length) {
    bugs.forEach((b, i) => console.log(`  ${i+1}. [${b.status}] ${b.name}\n     → ${b.msg}`));
  } else {
    console.log(`\n  🎉 CARD GAME ENGINE IS WORKING PERFECTLY IN REAL-TIME!`);
  }
  console.log(`${'═'.repeat(58)}\n`);
};

const auth = (t) => ({ headers: { Authorization: `Bearer ${t}` } });

async function run() {
  console.log('\n🚀 STARTING LIVE CARD GAME ENGINE TEST...');

  // 1. Admin Login
  try {
    const r = await axios.post(`${BASE}/admin/auth/login`, ADMIN);
    adminToken = r.data.data.token;
    ok('Admin login');
  } catch (e) { bug('Admin login', e); }

  // 2. Create Category
  try {
    const r = await axios.post(`${BASE}/admin/dashboard/categories`, {
      name: `Category_${Date.now()}`, description: 'Test Cat', theme_color: '#FF00FF', order_index: 1
    }, auth(adminToken));
    catId = r.data.data.category.id;
    ok('Category created');
  } catch (e) { bug('Category creation', e); }

  // 3. Create 10 Cards
  for (let i = 1; i <= 10; i++) {
    try {
      const r = await axios.post(`${BASE}/admin/dashboard/cards`, {
        category_id: catId,
        name: `TestCard_${i}_${Date.now()}`,
        power_description: `Description of card ${i}`,
        card_type: 'ACTION'
      }, auth(adminToken));
      cardIds.push(r.data.data.card.id);
    } catch (e) { bug(`Create card ${i}`, e); }
  }
  ok('10 cards created successfully');

  // 4. Create Bundle
  try {
    const r = await axios.post(`${BASE}/admin/bundles`, {
      name: `Bundle_${Date.now()}`,
      description: 'Test Pack description',
      cover_image_url: 'https://example.com/cover.jpg'
    }, auth(adminToken));
    bundleId = r.data.data.bundle.id;
    ok('Bundle created');
  } catch (e) { bug('Bundle creation', e); }

  // 5. Add Cards to Bundle
  try {
    await axios.post(`${BASE}/admin/bundles/${bundleId}/cards`, { card_ids: cardIds }, auth(adminToken));
    ok('Cards added to bundle');
  } catch (e) { bug('Link cards to bundle', e); }

  // 6. Create Plan
  try {
    const r = await axios.post(`${BASE}/admin/bundles/${bundleId}/plans`, {
      name: 'Standard Plan', price: 99.00, card_count: 8
    }, auth(adminToken));
    planId = r.data.data.plan.id;
    ok('Pricing plan created');
  } catch (e) { bug('Plan creation', e); }

  // 7. Register 2 Users
  const ts = Date.now();
  p1Email = `user1_${ts}@engine.com`;
  p2Email = `user2_${ts}@engine.com`;

  try {
    let r = await axios.post(`${BASE}/auth/signup`, { name: 'User One', email: p1Email, password: 'password123' });
    p1Token = r.data.data.accessToken;
    p1Id = r.data.data.user.id;

    r = await axios.post(`${BASE}/auth/signup`, { name: 'User Two', email: p2Email, password: 'password123' });
    p2Token = r.data.data.accessToken;
    p2Id = r.data.data.user.id;

    ok('Two users registered');
  } catch (e) { bug('User registration', e); }

  // 8. Create & Join Room
  try {
    let r = await axios.post(`${BASE}/rooms/create`, { expiry_type: '7_DAYS' }, auth(p1Token));
    roomId = r.data.data.room.id;
    roomCode = r.data.data.room.code;

    await axios.post(`${BASE}/rooms/join`, { code: roomCode }, auth(p2Token));
    ok(`Room created and joined successfully. Code: ${roomCode}`);
  } catch (e) { bug('Room setup', e); }

  // 9. Grant Cards to both Users (using Admin manual purchase service / simulated webhook)
  // Let's use simulate webhook flow for realistic tracking
  const WEBHOOK_SECRET = 'elevora_test_webhook_secret_2026';
  let storeProductId = '';
  try {
    const r = await axios.get(`${BASE}/admin/bundles/${bundleId}/plans`, auth(adminToken));
    storeProductId = r.data.data.plans[0].store_product_id;
  } catch (e) { bug('Get store product id', e); }

  try {
    // User 1 purchase
    await axios.post(`${BASE}/store/purchase/verify`, {
      type: 'NON_RENEWING_PURCHASE',
      event: { app_user_id: p1Id, product_id: storeProductId, transaction_id: `TXN_1_${ts}`, store: 'PLAY_STORE', price: 99, currency: 'INR' }
    }, { headers: { Authorization: `Bearer ${WEBHOOK_SECRET}` } });

    // User 2 purchase
    await axios.post(`${BASE}/store/purchase/verify`, {
      type: 'NON_RENEWING_PURCHASE',
      event: { app_user_id: p2Id, product_id: storeProductId, transaction_id: `TXN_2_${ts}`, store: 'PLAY_STORE', price: 99, currency: 'INR' }
    }, { headers: { Authorization: `Bearer ${WEBHOOK_SECRET}` } });

    ok('Both users successfully acquired cards');
  } catch (e) { bug('Card acquisition via purchase webhook', e); }

  // 10. Fetch available cards for User 1 & User 2
  let p1Cards = [], p2Cards = [];
  try {
    let r = await axios.get(`${BASE}/user/deck/available?room_id=${roomId}`, auth(p1Token));
    p1Cards = r.data.data.cards;
    r = await axios.get(`${BASE}/user/deck/available?room_id=${roomId}`, auth(p2Token));
    p2Cards = r.data.data.cards;
    ok(`User 1 has ${p1Cards.length} cards, User 2 has ${p2Cards.length} cards`);
  } catch (e) { bug('Fetch available cards', e); }

  // 11. Connect sockets to listen for real-time events
  const sock1 = io(SOCKET, { auth: { token: p1Token }, transports: ['websocket'] });
  const sock2 = io(SOCKET, { auth: { token: p2Token }, transports: ['websocket'] });

  let socketReceivedEvents = [];
  sock2.on('card_received', (payload) => {
    socketReceivedEvents.push({ type: 'received', payload });
  });
  sock1.on('card_accepted', (payload) => {
    socketReceivedEvents.push({ type: 'accepted', payload });
  });
  sock1.on('card_deflected', (payload) => {
    socketReceivedEvents.push({ type: 'deflected', payload });
  });
  sock1.on('card_completed_by_receiver', (payload) => {
    socketReceivedEvents.push({ type: 'completed', payload });
  });
  sock2.on('card_confirmed', (payload) => {
    socketReceivedEvents.push({ type: 'confirmed', payload });
  });

  // Join rooms on socket
  await new Promise((resolve) => {
    let joined = 0;
    const onJoin = () => {
      joined++;
      if (joined === 2) resolve();
    };
    sock1.emit('join_room', roomCode);
    sock2.emit('join_room', roomCode);
    sock1.on('connect', onJoin);
    sock2.on('connect', onJoin);
  });
  ok('Both sockets connected and joined room channel');

  // 12. Send Card 1, 2 (User 1 -> User 2)
  let send1Id = '', send2Id = '', send3Id = '';
  try {
    let r = await axios.post(`${BASE}/user/deck/${p1Cards[0].deck_card_id}/send`, {
      room_id: roomId, receiver_id: p2Id, message: 'Message for Card 1'
    }, auth(p1Token));
    send1Id = r.data.data.send.id;

    r = await axios.post(`${BASE}/user/deck/${p1Cards[1].deck_card_id}/send`, {
      room_id: roomId, receiver_id: p2Id, message: 'Message for Card 2'
    }, auth(p1Token));
    send2Id = r.data.data.send.id;

    ok('Successfully sent 2 cards from User 1 to User 2 (Active = 2)');
  } catch (e) { bug('Send 2 cards', e); }

  // 12b. Attempt to send Card 3 directly (should FAIL with 429 Active Limit Reached)
  try {
    await axios.post(`${BASE}/user/deck/${p1Cards[2].deck_card_id}/send`, {
      room_id: roomId, receiver_id: p2Id, message: 'Message for Card 3'
    }, auth(p1Token));
    bug('Active sends limit check', new Error('User 1 was able to send a 3rd active card without closing one first!'));
  } catch (e) {
    if (e.response && e.response.status === 429 && e.response.data.message.includes('active')) {
      ok('Active send limit of 2 successfully blocked sending 3rd card (429 Active Limit) ✓');
    } else {
      bug('Active sends limit check', e);
    }
  }

  // 12c. Deflect Card 2 to free up active slot (Active goes 2 -> 1)
  try {
    await axios.patch(`${BASE}/user/deck/sends/${send2Id}/deflect`, {}, auth(p2Token));
    ok('User 2 deflected Card 2 (Active count is now 1)');
  } catch (e) { bug('Deflect Card 2', e); }

  // 12d. Send Card 3 (now should succeed, Active becomes 2, Daily becomes 3)
  try {
    let r = await axios.post(`${BASE}/user/deck/${p1Cards[2].deck_card_id}/send`, {
      room_id: roomId, receiver_id: p2Id, message: 'Message for Card 3'
    }, auth(p1Token));
    send3Id = r.data.data.send.id;
    ok('Successfully sent Card 3 (Daily = 3, Active = 2)');
  } catch (e) { bug('Send Card 3 after deflecting Card 2', e); }

  // 13. Test Daily Send Limit: Try sending a 4th card (User 1 -> User 2)
  try {
    await axios.post(`${BASE}/user/deck/${p1Cards[3].deck_card_id}/send`, {
      room_id: roomId, receiver_id: p2Id, message: 'Message for Card 4'
    }, auth(p1Token));
    bug('Daily send limit test', new Error('User 1 was able to send a 4th card, daily limit check failed!'));
  } catch (e) {
    if (e.response && e.response.status === 429 && e.response.data.message.includes('Daily limit')) {
      ok('Daily send limit of 3 successfully prevented sending 4th card (429 Daily Limit) ✓');
    } else {
      bug('Daily send limit test', e);
    }
  }

  // 14. Wait a brief moment to let socket receive messages
  await new Promise(r => setTimeout(r, 1000));
  // 3 sends were made (Card 1, Card 2, Card 3)
  const recvCount = socketReceivedEvents.filter(x => x.type === 'received').length;
  if (recvCount >= 3) {
    ok(`Socket.io verified: User 2 received ${recvCount} cards in real-time ✓`);
  } else {
    bug('Socket.io verification', new Error(`Expected User 2 to receive 3 socket notifications, got ${recvCount}`));
  }

  // 15. Action Card 1: Accept -> Mark Complete -> Confirm
  try {
    // Seen
    await axios.patch(`${BASE}/user/deck/sends/${send1Id}/seen`, {}, auth(p2Token));
    
    // Accept
    await axios.patch(`${BASE}/user/deck/sends/${send1Id}/accept`, {}, auth(p2Token));
    ok('User 2 accepted Card 1');

    // Complete
    await axios.patch(`${BASE}/user/deck/sends/${send1Id}/complete`, {}, auth(p2Token));
    ok('User 2 marked Card 1 complete');

    // Confirm
    await axios.patch(`${BASE}/user/deck/sends/${send1Id}/confirm`, {}, auth(p1Token));
    ok('User 1 confirmed Card 1 completion');
  } catch (e) { bug('Card 1 workflow (Accept -> Complete -> Confirm)', e); }

  // 16. Action Card 3: Deflect
  try {
    await axios.patch(`${BASE}/user/deck/sends/${send3Id}/deflect`, {}, auth(p2Token));
    ok('User 2 deflected Card 3 successfully');
  } catch (e) { bug('Card 3 deflection', e); }

  // 17. Verify current sends status history
  try {
    const r = await axios.get(`${BASE}/user/deck/sends?room_id=${roomId}`, auth(p1Token));
    const sends = r.data.data.sends;
    const c1 = sends.find(s => s.id === send1Id);
    const c2 = sends.find(s => s.id === send2Id);
    const c3 = sends.find(s => s.id === send3Id);

    if (c1.status !== 'COMPLETED') throw new Error(`Card 1 should be COMPLETED, got ${c1.status}`);
    if (c2.status !== 'DEFLECTED') throw new Error(`Card 2 should be DEFLECTED, got ${c2.status}`);
    if (c3.status !== 'DEFLECTED') throw new Error(`Card 3 should be DEFLECTED, got ${c3.status}`);

    ok('DB state matching correct engine statuses after transitions (COMPLETED, DEFLECTED, DEFLECTED)');
  } catch (e) { bug('Verify status history values', e); }

  // 18. Test Active Card Limits (User 2 -> User 1)
  // Let's send Card A, B, and then C. Since User 2 has active = 0, they can send Card A & B.
  // Then they have active = 2, so Card C should fail.
  let p2SendA = '', p2SendB = '';
  try {
    let r = await axios.post(`${BASE}/user/deck/${p2Cards[0].deck_card_id}/send`, {
      room_id: roomId, receiver_id: p1Id, message: 'Card A'
    }, auth(p2Token));
    p2SendA = r.data.data.send.id;

    r = await axios.post(`${BASE}/user/deck/${p2Cards[1].deck_card_id}/send`, {
      room_id: roomId, receiver_id: p1Id, message: 'Card B'
    }, auth(p2Token));
    p2SendB = r.data.data.send.id;

    ok('User 2 successfully sent 2 cards to User 1 (Active count = 2)');
  } catch (e) { bug('User 2 sending active cards', e); }

  try {
    await axios.post(`${BASE}/user/deck/${p2Cards[2].deck_card_id}/send`, {
      room_id: roomId, receiver_id: p1Id, message: 'Card C'
    }, auth(p2Token));
    bug('Active sends limit test', new Error('User 2 was able to send a 3rd active card, limit failed!'));
  } catch (e) {
    if (e.response && e.response.status === 429) {
      ok('Active send limit of 2 successfully prevented sending 3rd active card (429 Rate Limit) ✓');
    } else {
      bug('Active send limit test', e);
    }
  }

  // Close sockets
  sock1.disconnect();
  sock2.disconnect();

  printReport();
}

run().catch(e => {
  console.error('\n💥 Crash:', e);
  process.exit(1);
});
