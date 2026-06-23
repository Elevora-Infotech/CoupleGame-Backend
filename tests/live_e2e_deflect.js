/**
 * live_e2e_deflect.js
 * ───────────────────
 * Live End-to-End Test for Deflect Cards on the Real Database.
 * This script will:
 * 1. Create a mock sender and receiver.
 * 2. Create an ACTIVE 30-day room for them.
 * 3. Give them each a regular card, and give receiver a deflect card.
 * 4. Send the regular card from Sender → Receiver.
 * 5. Receiver uses the deflect card.
 * 6. Verify the exact outcome on the DB.
 */

'use strict';
require('dotenv').config();
const { supabase } = require('../src/db/supabase');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const roomService = require('../src/services/roomService');
const deckService = require('../src/services/deckService');
const deflectService = require('../src/services/deflectService');

// ── Colors ───────────────────────────────────────────────────
const G  = '\x1b[32m';  // green
const R  = '\x1b[31m';  // red
const Y  = '\x1b[33m';  // yellow
const B  = '\x1b[36m';  // cyan
const RS = '\x1b[0m';   // reset

const log = (msg) => console.log(`${B}ℹ ${msg}${RS}`);
const ok = (msg) => console.log(`${G}✅ ${msg}${RS}`);
const fail = (msg) => { console.log(`${R}❌ ${msg}${RS}`); process.exit(1); };

async function runLiveTest() {
  console.log(`\n${Y}═══════════════════════════════════════════════`);
  console.log(`   🚀 LIVE END-TO-END TEST: DEFLECT CARDS`);
  console.log(`═══════════════════════════════════════════════${RS}\n`);

  try {
    // ── 1. Create 2 Mock Users ──────────────────────────────────────────
    log('1. Setting up mock users...');
    const senderId = uuidv4();
    const receiverId = uuidv4();

    await supabase.from('users').insert([
      { id: senderId, email: `sender_${Date.now()}@test.com`, name: 'Test Sender' },
      { id: receiverId, email: `receiver_${Date.now()}@test.com`, name: 'Test Receiver' }
    ]);
    ok('Created User A (Sender) and User B (Receiver).');

    // ── 2. Create and Activate a 30-Day Room ────────────────────────────
    log('\n2. Creating 30-Day Room...');
    const room = await roomService.createRoom(senderId, '30_DAYS');
    ok(`Created room with code: ${room.code} (Status: ${room.status})`);

    const activeRoom = await roomService.joinRoom(receiverId, room.code);
    ok(`User B joined. Room status is now: ${activeRoom.status}`);

    // Wait 2 seconds to ensure grantDeflectCards (background task in joinRoom) finishes
    await new Promise(res => setTimeout(res, 2000));

    // Verify User B received exactly 5 deflect cards automatically!
    const { count: deflectCount } = await supabase.from('user_card_deck')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', receiverId)
      .eq('room_id', activeRoom.id);
    
    // We expect 5 because room is 30_DAYS
    if (deflectCount === 5) ok(`Verified: User B received exactly 5 deflect cards automatically on join.`);
    else fail(`User B has ${deflectCount} cards in deck, expected 5 deflect cards.`);

    // ── 3. Give Normal Cards to User A & Find a Deflect Card for B ──────
    log('\n3. Provisioning Cards...');
    // Find one active normal card
    const { data: normalCard } = await supabase.from('cards')
      .select('id, name').is('deflect_action', null).limit(1).single();
    
    // Give User A 30 normal cards to simulate what the user asked
    const userA_cards = Array(30).fill({
        user_id: senderId,
        card_id: normalCard.id,
        room_id: activeRoom.id,
        is_used: false
    });
    await supabase.from('user_card_deck').insert(userA_cards);
    ok(`Gave User A 30 normal cards ("${normalCard.name}").`);

    // Get User A's deck to find the deck_card_id to play
    const { data: senderDeck } = await supabase.from('user_card_deck')
      .select('id')
      .eq('user_id', senderId)
      .eq('room_id', activeRoom.id)
      .limit(1).single();

    // Find User B's first deflect card
    const bDeflectCards = await deflectService.getDeflectCards(receiverId, activeRoom.id);
    const deflectCard = bDeflectCards[0];
    
    if (!deflectCard) fail('User B did not receive any deflect cards.');
    ok(`Identified User B's Deflect Card: "${deflectCard.cards.name}" (Action: ${deflectCard.cards.deflect_action})`);

    // ── 4. Send the Card (A -> B) ───────────────────────────────────────
    log('\n4. User A sends a card to User B...');
    const sendRecord = await deckService.sendCard(senderId, senderDeck.id, activeRoom.id, receiverId, "Let's do this!");
    ok(`Card Sent! Send ID: ${sendRecord.id} | Status: ${sendRecord.status}`);

    // ── 5. User B Uses Deflect Card ─────────────────────────────────────
    log('\n5. User B deflects the card...');
    const deflectResult = await deflectService.useDeflectCard(receiverId, sendRecord.id, deflectCard.id);
    ok(`Deflect Action Executed: ${deflectResult.outcome} (${deflectResult.message})`);

    // ── 6. Verify Final Database State ──────────────────────────────────
    log('\n6. Verifying Live Database State...');
    const { data: finalSend } = await supabase.from('room_card_sends')
      .select('status, is_deflect_immune')
      .eq('id', sendRecord.id).single();
    
    // Outcome verification depends on the action used
    const action = deflectCard.cards.deflect_action;
    if (action === 'TIMEOUT') {
      if (finalSend.status === 'SENT') ok('Success: TIMEOUT kept status as SENT.');
      else fail(`Expected status SENT for TIMEOUT, got ${finalSend.status}`);
    } else {
      if (finalSend.status === 'DEFLECTED') ok('Success: room_card_sends status is exactly DEFLECTED.');
      else fail(`Expected status DEFLECTED, got ${finalSend.status}`);
    }

    const { data: finalDeck } = await supabase.from('user_card_deck')
      .select('is_used')
      .eq('id', deflectCard.id).single();
    
    if (finalDeck.is_used === true) {
      ok('Success: User B\'s deflect card is marked as used.');
    } else {
      fail(`Expected deflect card to be used, but is_used is false`);
    }

    // ── Cleanup ─────────────────────────────────────────────────────────
    log('\n7. Cleaning up test data...');
    await supabase.from('users').delete().in('id', [senderId, receiverId]);
    ok('Cleanup complete.');

    console.log(`\n${G}🎉 LIVE END-TO-END TEST PASSED SUCCESSFULLY! The logic is 100% working in the real DB.${RS}\n`);

  } catch (err) {
    fail(`Test threw an error: ${err.message}\n${err.stack}`);
  }
}

runLiveTest();
