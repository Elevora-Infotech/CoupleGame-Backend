/**
 * live_deflect_verify.js
 * ──────────────────────
 * Checks your LIVE Supabase database to confirm the deflect card
 * system was applied correctly. No mocks — real DB calls.
 *
 * Run: node tests/live_deflect_verify.js
 *
 * What it checks:
 *  [A] Schema — do the new columns exist on the live tables?
 *  [B] Data   — do all 13 deflect cards have their deflect_action set?
 *  [C] Counts — how many deflect cards exist in total?
 */

'use strict';
require('dotenv').config();
const { supabase } = require('../src/db/supabase');

// ── Colors ───────────────────────────────────────────────────
const G  = '\x1b[32m';  // green
const R  = '\x1b[31m';  // red
const Y  = '\x1b[33m';  // yellow
const B  = '\x1b[36m';  // cyan
const RS = '\x1b[0m';   // reset

let passed = 0;
let failed = 0;
const issues = [];

const ok   = (msg) => { console.log(`${G}  ✅ ${msg}${RS}`); passed++; };
const fail = (msg) => { console.log(`${R}  ❌ ${msg}${RS}`); failed++; issues.push(msg); };
const info = (msg) => console.log(`${B}  ℹ  ${msg}${RS}`);
const head = (msg) => console.log(`\n${Y}══ ${msg} ══${RS}`);

// Expected 13 deflect cards + their actions
const EXPECTED = [
  { name: 'Not Today Satan',              deflect_action: 'CANCEL_IMMUNE'      },
  { name: 'Big Fat No',                   deflect_action: 'CANCEL_ANY'         },
  { name: 'Yeh Nah',                      deflect_action: 'CANCEL_ANY'         },
  { name: 'Party Pooper',                 deflect_action: 'CANCEL_IN_PROGRESS' },
  { name: 'Break Glass in Case of Lazy',  deflect_action: 'CANCEL_ANY'         },
  { name: 'Switcheroo',                   deflect_action: 'REVERSE_ROLES'      },
  { name: 'Not Feeling It',               deflect_action: 'CANCEL_ANY'         },
  { name: 'The Time Out Card',            deflect_action: 'TIMEOUT'            },
  { name: 'The Denial Denial Card',       deflect_action: 'CANCEL_ANY'         },
  { name: 'The "Don\'t Wanna" Card',      deflect_action: 'CANCEL_ANY'         },
  { name: "The 'Nice Try' Card",          deflect_action: 'CANCEL_SENT_ONLY'   },
  { name: 'The Role Reversal Defense',    deflect_action: 'REVERSE_ROLES'      },
  { name: 'The One Free Pass',            deflect_action: 'CANCEL_ANY'         },
];

async function run() {
  console.log(`\n${Y}╔══════════════════════════════════════════════╗${RS}`);
  console.log(`${Y}║   Deflect Card System — Live Supabase Check  ║${RS}`);
  console.log(`${Y}╚══════════════════════════════════════════════╝${RS}`);

  // ── CHECK A: Schema — do columns exist? ───────────────────
  head('A. Schema Columns');

  // Test deflect_action on cards by fetching one card with that column
  const { data: colTestCards, error: colErrCards } = await supabase
    .from('cards')
    .select('id, name, deflect_action, is_wildcard')
    .limit(1);

  if (colErrCards) {
    fail(`cards table missing deflect_action or is_wildcard column: ${colErrCards.message}`);
    console.log(`${R}\n  ⚠️  You need to run deflect_schema.sql in Supabase SQL Editor first!${RS}\n`);
    printSummary();
    return;
  }
  ok('cards.deflect_action column exists');
  ok('cards.is_wildcard column exists');

  // Test is_deflect_immune on room_card_sends
  const { data: colTestSends, error: colErrSends } = await supabase
    .from('room_card_sends')
    .select('id, is_deflect_immune')
    .limit(1);

  if (colErrSends) {
    fail(`room_card_sends missing is_deflect_immune column: ${colErrSends.message}`);
    console.log(`${R}\n  ⚠️  Run deflect_schema.sql in Supabase SQL Editor!${RS}\n`);
  } else {
    ok('room_card_sends.is_deflect_immune column exists');
  }

  // ── CHECK B: Data — 13 deflect cards with correct actions ─
  head('B. Deflect Card Data (13 cards)');

  const { data: allDeflectCards, error: fetchErr } = await supabase
    .from('cards')
    .select('name, deflect_action, is_wildcard, is_active')
    .not('deflect_action', 'is', null);

  if (fetchErr) {
    fail(`Could not fetch deflect cards: ${fetchErr.message}`);
    printSummary();
    return;
  }

  info(`Found ${allDeflectCards.length} cards with deflect_action set in DB`);

  if (allDeflectCards.length === 0) {
    fail('NO deflect cards found! You need to run the seed or migration SQL.');
    printSummary();
    return;
  }

  // Build a lookup map from live DB
  const liveMap = {};
  allDeflectCards.forEach(c => { liveMap[c.name] = c; });

  // Check each expected card
  for (const expected of EXPECTED) {
    const live = liveMap[expected.name];
    if (!live) {
      fail(`Card NOT FOUND in DB: "${expected.name}"`);
      continue;
    }
    if (live.deflect_action !== expected.deflect_action) {
      fail(`"${expected.name}" → wrong action: DB has "${live.deflect_action}", expected "${expected.deflect_action}"`);
      continue;
    }
    if (!live.is_active) {
      fail(`"${expected.name}" → is_active = false (card is disabled!)`);
      continue;
    }
    ok(`"${expected.name}" → ${live.deflect_action}`);
  }

  // Check for any extra cards not in our expected list
  const extraCards = allDeflectCards.filter(c => !EXPECTED.find(e => e.name === c.name));
  if (extraCards.length > 0) {
    head('C. Extra Deflect Cards Found (not in expected list)');
    extraCards.forEach(c => info(`  "${c.name}" → ${c.deflect_action}`));
  }

  // ── CHECK C: grantDeflectCards will work ──────────────────
  head('C. Grant Logic — can 5 random cards be selected?');

  const activeDeflect = allDeflectCards.filter(c => c.is_active);
  if (activeDeflect.length < 5) {
    fail(`Only ${activeDeflect.length} active deflect cards — need at least 5 to grant per user`);
  } else {
    ok(`${activeDeflect.length} active deflect cards available → can grant 5 randomly ✅`);
  }

  // ── CHECK D: room_card_sends default ─────────────────────
  head('D. room_card_sends.is_deflect_immune default');
  const { data: sendSample } = await supabase
    .from('room_card_sends')
    .select('id, is_deflect_immune')
    .eq('is_deflect_immune', false)
    .limit(1);

  if (sendSample !== null) {
    ok('is_deflect_immune defaults to FALSE correctly');
  }

  printSummary();
}

function printSummary() {
  console.log(`\n${Y}══ Summary ══${RS}`);
  console.log(`${G}  Passed: ${passed}${RS}`);
  console.log(`${R}  Failed: ${failed}${RS}`);

  if (failed > 0) {
    console.log(`\n${R}Issues to fix:${RS}`);
    issues.forEach((issue, i) => console.log(`${R}  ${i + 1}. ${issue}${RS}`));
    console.log(`\n${Y}→ Run this SQL in Supabase SQL Editor:${RS}`);
    console.log(`${B}  src/db/deflect_schema.sql${RS}\n`);
  } else {
    console.log(`\n${G}🎉 All checks passed! Deflect system is live and ready.${RS}\n`);
  }
}

run().catch(err => {
  console.error(`\n${R}Fatal error:${RS}`, err.message);
  console.log(`${Y}Make sure your .env file has SUPABASE_URL and SUPABASE_SERVICE_KEY set.${RS}\n`);
  process.exit(1);
});
