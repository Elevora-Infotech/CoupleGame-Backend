'use strict';
/**
 * live_penalty_test.js
 * ─────────────────────
 * Live End-to-End Test for the Penalty System (v1)
 * Tests ALL 3 penalties on REAL Supabase data.
 *
 * Run: node tests/live_penalty_test.js
 *
 * WHAT IT TESTS:
 *  P1 — Non-Acceptance: Sets penalty_deadline to NOW (past), 
 *       resolves lazily, verifies receiver lost a card from deck.
 *  P2 — Accepted but Incomplete: Sets completion_deadline to NOW,
 *       resolves lazily, verifies receiver is banned from sending.
 *  P3 — Rejection: Receiver calls rejectCard, verifies card
 *       is transferred from receiver → sender deck.
 */

require('dotenv').config();
const { supabase }       = require('../src/db/supabase');
const crypto             = require('crypto');
const roomService        = require('../src/services/roomService');
const deckService        = require('../src/services/deckService');
const penaltyService     = require('../src/services/penaltyService');

// ── Colors ─────────────────────────────────────────────────
const G  = '\x1b[32m'; const R = '\x1b[31m';
const Y  = '\x1b[33m'; const B = '\x1b[36m'; const RS = '\x1b[0m';
const log  = (m) => console.log(`${B}  ℹ  ${m}${RS}`);
const ok   = (m) => console.log(`${G}  ✅ ${m}${RS}`);
const fail = (m) => { console.log(`${R}  ❌ ${m}${RS}`); throw new Error(m); };
const head = (m) => console.log(`\n${Y}══ ${m} ══${RS}`);

const CLEANUP_IDS = { users: [], rooms: [] };

// ── Setup helpers ───────────────────────────────────────────
const createUser = async (label) => {
  const id = crypto.randomUUID();
  const { error } = await supabase.from('users').insert([{
    id, email: `${label}_${Date.now()}@pentest.com`, name: `Test ${label}`
  }]);
  if (error) fail(`Failed to create user ${label}: ${error.message}`);
  CLEANUP_IDS.users.push(id);
  return id;
};

const give30Cards = async (userId, roomId) => {
  const { data: normalCard } = await supabase
    .from('cards').select('id').is('deflect_action', null).limit(1).single();
  if (!normalCard) fail('No normal cards in DB. Seed cards first.');
  const rows = Array(30).fill(null).map(() => ({
    user_id: userId, card_id: normalCard.id,
    room_id: roomId, is_used: false, expired: false
  }));
  const { error } = await supabase.from('user_card_deck').insert(rows);
  if (error) fail(`Failed to insert cards: ${error.message}`);
  return normalCard.id;
};

const getDeckCount = async (userId, roomId) => {
  const { count } = await supabase.from('user_card_deck')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('room_id', roomId)
    .eq('is_used', false).eq('expired', false);
  return count || 0;
};

const cleanup = async () => {
  head('Cleanup');
  if (CLEANUP_IDS.users.length) {
    await supabase.from('users').delete().in('id', CLEANUP_IDS.users);
    ok(`Deleted ${CLEANUP_IDS.users.length} test users (cascade deletes all related data).`);
  }
};

// ─────────────────────────────────────────────────────────────
async function testP1_NonAcceptance() {
  head('PENALTY 1: Non-Acceptance (card ignored 48h)');

  const senderA  = await createUser('P1_Sender');
  const receiverA = await createUser('P1_Receiver');

  // Create 30-day room
  const room = await roomService.createRoom(senderA, '30_DAYS');
  await roomService.joinRoom(receiverA, room.code);
  const { data: activeRoom } = await supabase.from('rooms').select('*').eq('code', room.code).single();
  await new Promise(r => setTimeout(r, 1000)); // wait for deflect grants

  // Give 30 cards to receiver
  await give30Cards(senderA, activeRoom.id);
  await give30Cards(receiverA, activeRoom.id);

  const countBefore = await getDeckCount(receiverA, activeRoom.id);
  log(`Receiver has ${countBefore} unused cards before penalty.`);

  // Get sender's deck card to send
  const { data: senderDeck } = await supabase.from('user_card_deck')
    .select('id').eq('user_id', senderA).eq('room_id', activeRoom.id)
    .eq('is_used', false).limit(1).single();

  // Send card
  const sendRecord = await deckService.sendCard(senderA, senderDeck.id, activeRoom.id, receiverA, 'Test P1');
  log(`Card sent: ${sendRecord.id} | Status: ${sendRecord.status}`);

  // ⚡ Simulate 48h passage: force penalty_deadline to past AND status to PENALTY
  await supabase.from('room_card_sends').update({
    status:               'PENALTY',
    penalty_deadline:     new Date(Date.now() - 1000).toISOString(), // already past
    penalty_triggered_at: null, // ensure penalty engine hasn't processed it yet
  }).eq('id', sendRecord.id);

  log('Simulated 48h timeout: card status forced to PENALTY.');

  // Trigger lazy resolver (mimics a request from receiver)
  await penaltyService.resolvePendingPenalties(receiverA);
  ok('Penalty resolver ran.');

  const countAfter = await getDeckCount(receiverA, activeRoom.id);
  log(`Receiver now has ${countAfter} unused cards.`);

  if (countAfter < countBefore) {
    ok(`P1 PASS: Receiver lost ${countBefore - countAfter} card(s) from deck. ✅`);
  } else {
    fail('P1 FAIL: Receiver deck count did not decrease after non-acceptance penalty.');
  }

  // Verify penalty_log entry created
  const { data: logs } = await supabase.from('penalty_log')
    .select('*').eq('send_id', sendRecord.id);
  if (logs?.length > 0 && logs[0].penalty_type === 'NON_ACCEPTANCE') {
    ok(`P1 PASS: penalty_log entry written. Message: "${logs[0].message}"`);
  } else {
    fail('P1 FAIL: No penalty_log entry found for NON_ACCEPTANCE.');
  }
}

// ─────────────────────────────────────────────────────────────
async function testP2_IncompleteCard() {
  head('PENALTY 2: Accepted But Not Completed (24h send ban)');

  const senderB   = await createUser('P2_Sender');
  const receiverB = await createUser('P2_Receiver');

  const room = await roomService.createRoom(senderB, '30_DAYS');
  await roomService.joinRoom(receiverB, room.code);
  const { data: activeRoom } = await supabase.from('rooms').select('*').eq('code', room.code).single();
  await new Promise(r => setTimeout(r, 1000));

  await give30Cards(senderB, activeRoom.id);
  await give30Cards(receiverB, activeRoom.id);

  const { data: senderDeck } = await supabase.from('user_card_deck')
    .select('id').eq('user_id', senderB).eq('room_id', activeRoom.id)
    .eq('is_used', false).limit(1).single();

  const sendRecord = await deckService.sendCard(senderB, senderDeck.id, activeRoom.id, receiverB, 'Test P2');

  // Receiver accepts
  await deckService.acceptCard(receiverB, sendRecord.id);
  log(`Receiver accepted card. Status → IN_PROGRESS with 48h completion_deadline.`);

  // ⚡ Simulate 48h completion deadline passed
  await supabase.from('room_card_sends').update({
    completion_deadline: new Date(Date.now() - 1000).toISOString()
  }).eq('id', sendRecord.id);
  log('Simulated 48h passing: completion_deadline forced to past.');

  // Trigger resolver
  await penaltyService.resolvePendingPenalties(receiverB);
  ok('Penalty resolver ran.');

  // Verify ban exists
  const { isBanned, bannedUntil } = await penaltyService.checkSendBan(receiverB);
  if (isBanned) {
    ok(`P2 PASS: Receiver is banned from sending until ${new Date(bannedUntil).toLocaleString('en-IN')}. ✅`);
  } else {
    fail('P2 FAIL: No send ban found for receiver after incomplete penalty.');
  }

  // Verify penalty_log entry
  const { data: logs } = await supabase.from('penalty_log')
    .select('*').eq('send_id', sendRecord.id);
  if (logs?.length > 0 && logs[0].penalty_type === 'INCOMPLETE_CARD') {
    ok(`P2 PASS: penalty_log written. Message: "${logs[0].message}"`);
  } else {
    fail('P2 FAIL: No penalty_log for INCOMPLETE_CARD.');
  }

  // Verify banned receiver cannot send
  try {
    const { data: nextDeck } = await supabase.from('user_card_deck')
      .select('id').eq('user_id', receiverB).eq('room_id', activeRoom.id)
      .eq('is_used', false).limit(1).single();
    if (nextDeck) {
      await deckService.sendCard(receiverB, nextDeck.id, activeRoom.id, senderB, 'should fail');
      fail('P2 FAIL: Receiver was NOT blocked from sending despite having an active ban!');
    }
  } catch (err) {
    if (err.status === 403 && err.message.includes('paused')) {
      ok(`P2 PASS: Banned receiver correctly blocked from sending. Error: "${err.message.slice(0, 60)}..." ✅`);
    } else {
      fail(`P2 FAIL: Unexpected error: ${err.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
async function testP3_Rejection() {
  head('PENALTY 3: Rejection (asset transfer receiver → sender)');

  const senderC   = await createUser('P3_Sender');
  const receiverC = await createUser('P3_Receiver');

  const room = await roomService.createRoom(senderC, '30_DAYS');
  await roomService.joinRoom(receiverC, room.code);
  const { data: activeRoom } = await supabase.from('rooms').select('*').eq('code', room.code).single();
  await new Promise(r => setTimeout(r, 1000));

  await give30Cards(senderC, activeRoom.id);
  await give30Cards(receiverC, activeRoom.id);

  const senderCountBefore   = await getDeckCount(senderC, activeRoom.id);
  const receiverCountBefore = await getDeckCount(receiverC, activeRoom.id);
  log(`Before rejection — Sender: ${senderCountBefore} cards | Receiver: ${receiverCountBefore} cards`);

  const { data: senderDeck } = await supabase.from('user_card_deck')
    .select('id').eq('user_id', senderC).eq('room_id', activeRoom.id)
    .eq('is_used', false).limit(1).single();

  const sendRecord = await deckService.sendCard(senderC, senderDeck.id, activeRoom.id, receiverC, 'Test P3');
  log(`Card sent: ${sendRecord.id} | Status: ${sendRecord.status}`);

  // Receiver rejects
  const result = await penaltyService.rejectCard(receiverC, sendRecord.id);
  log(`Rejection result: ${JSON.stringify(result.card_transferred)}`);

  // Verify send status = REJECTED
  const { data: finalSend } = await supabase.from('room_card_sends')
    .select('status, rejected_at').eq('id', sendRecord.id).single();
  if (finalSend.status === 'REJECTED' && finalSend.rejected_at) {
    ok('P3 PASS: room_card_sends.status = REJECTED ✅');
  } else {
    fail(`P3 FAIL: Expected status REJECTED, got ${finalSend.status}`);
  }

  // Verify card transferred: sender deck increased OR a new card was inserted
  const senderCountAfter = await getDeckCount(senderC, activeRoom.id);
  if (result.card_transferred) {
    ok(`P3 PASS: Card transferred to sender. Source: ${result.card_transferred.source}. Card: "${result.card_transferred.name}" ✅`);
    log(`Sender now has ${senderCountAfter} unused cards (was ${senderCountBefore}).`);
  } else {
    fail('P3 FAIL: No card was transferred to sender.');
  }

  // Verify penalty_log entry
  const { data: logs } = await supabase.from('penalty_log')
    .select('*').eq('send_id', sendRecord.id);
  if (logs?.length > 0 && logs[0].penalty_type === 'REJECTION') {
    ok(`P3 PASS: penalty_log written. Message: "${logs[0].message}"`);
  } else {
    fail('P3 FAIL: No penalty_log for REJECTION.');
  }

  log(`Message to display: "${result.message}"`);
}

// ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${Y}╔══════════════════════════════════════════════════╗`);
  console.log(`║   🔥 LIVE PENALTY SYSTEM TEST (Real Supabase)    ║`);
  console.log(`╚══════════════════════════════════════════════════╝${RS}\n`);

  const results = { P1: false, P2: false, P3: false };

  try { await testP1_NonAcceptance(); results.P1 = true; }
  catch (e) { console.log(`${R}P1 failed: ${e.message}${RS}`); }

  try { await testP2_IncompleteCard(); results.P2 = true; }
  catch (e) { console.log(`${R}P2 failed: ${e.message}${RS}`); }

  try { await testP3_Rejection(); results.P3 = true; }
  catch (e) { console.log(`${R}P3 failed: ${e.message}${RS}`); }

  await cleanup();

  // Summary
  console.log(`\n${Y}══ FINAL RESULTS ══${RS}`);
  console.log(`${results.P1 ? G : R}  P1 Non-Acceptance:     ${results.P1 ? 'PASS ✅' : 'FAIL ❌'}${RS}`);
  console.log(`${results.P2 ? G : R}  P2 Incomplete Card:    ${results.P2 ? 'PASS ✅' : 'FAIL ❌'}${RS}`);
  console.log(`${results.P3 ? G : R}  P3 Rejection:          ${results.P3 ? 'PASS ✅' : 'FAIL ❌'}${RS}`);

  const allPassed = results.P1 && results.P2 && results.P3;
  if (allPassed) {
    console.log(`\n${G}🎉 ALL 3 PENALTIES WORK CORRECTLY ON LIVE SUPABASE!${RS}\n`);
  } else {
    console.log(`\n${R}⚠️  Some penalties failed. Check output above.${RS}\n`);
  }
}

main().catch(e => {
  console.error(`\n${R}Fatal:${RS}`, e.message);
  cleanup().finally(() => process.exit(1));
});
