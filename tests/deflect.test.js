'use strict';
/**
 * Deflect Card System — Comprehensive Unit Tests (v3)
 * Run: npx jest tests/deflect.test.js --verbose
 */

jest.mock('../src/db/supabase', () => ({ supabase: { from: jest.fn() } }));
const { supabase } = require('../src/db/supabase');
const deflectService = require('../src/services/deflectService');

// ── Reset ALL mocks (including queued mockReturnValueOnce) between every test ─
beforeEach(() => jest.resetAllMocks());

// ── Test Data ─────────────────────────────────────────────────
const SEND_ID   = 'send-1';
const ROOM_ID   = 'room-1';
const USER_A    = 'user-A';   // sender
const USER_B    = 'user-B';   // receiver (= the one using deflect)
const DECK_ID   = 'deck-d1';

const makeSend = (overrides = {}) => ({
  id: SEND_ID, room_id: ROOM_ID,
  sender_id: USER_A, receiver_id: USER_B,
  status: 'SENT',
  respond_deadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  penalty_deadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  is_deflect_immune: false,
  cards: { id: 'card-base', name: 'Heart-to-Heart Hour', deflect_action: null },
  ...overrides,
});

const makeDeck = (deflect_action, overrides = {}) => ({
  id: DECK_ID, user_id: USER_B, card_id: 'dc-1',
  is_used: false, expired: false, room_id: ROOM_ID,
  cards: { id: 'dc-1', name: 'Big Fat No', deflect_action },
  ...overrides,
});

// ── Mock Builders ─────────────────────────────────────────────
// selectChain: supabase.from().select().eq()...single() → { data, error }
const selectChain = (data, error = null) => ({
  select: jest.fn().mockReturnThis(),
  eq:     jest.fn().mockReturnThis(),
  not:    jest.fn().mockReturnThis(),
  in:     jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data, error }),
});

// updateChain: supabase.from().update().eq()...
// Service does: await supabase.from('x').update({}).eq('id', x).eq('y', z)
// The chain must resolve as a Promise → we make .eq() return a Promise on the last call
const makeUpdateChain = () => {
  const eqMock = jest.fn();
  // First .eq() call → returns same mock (still chaining)
  // Second (and any further) .eq() → returns a resolved Promise
  let callCount = 0;
  eqMock.mockImplementation(() => {
    callCount++;
    if (callCount >= 2) return Promise.resolve({ error: null });
    return { update: jest.fn().mockReturnThis(), eq: eqMock };
  });
  const chain = {
    update: jest.fn().mockReturnValue({ eq: eqMock }),
    _getEqMock: () => eqMock,
  };
  return chain;
};

// insertChain: supabase.from().insert([]).select().single() → { data, error }
const makeInsertChain = (data) => ({
  insert: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data, error: null }),
});

// Setup: wire supabase.from() to return correct objects in sequence
// Returns references for assertion.
const wire = (...responses) => {
  responses.forEach(r => supabase.from.mockReturnValueOnce(r));
};

// ─────────────────────────────────────────────────────────────
// 1. grantDeflectCards
// ─────────────────────────────────────────────────────────────
describe('grantDeflectCards', () => {

  it('✅ inserts exactly 5 rows (shuffled from 13 available)', async () => {
    const allCards = Array.from({ length: 13 }, (_, i) => ({ id: `c-${i}` }));
    const fetchMock = {
      select: jest.fn().mockReturnThis(),
      not:    jest.fn().mockReturnThis(),
      eq:     jest.fn().mockResolvedValue({ data: allCards, error: null }),
    };
    const insertMock = { insert: jest.fn().mockResolvedValue({ error: null }) };
    wire(fetchMock, insertMock);

    await deflectService.grantDeflectCards(USER_B, ROOM_ID);

    const rows = insertMock.insert.mock.calls[0][0];
    expect(rows).toHaveLength(5);
    rows.forEach(r => {
      expect(r.user_id).toBe(USER_B);
      expect(r.room_id).toBe(ROOM_ID);
      expect(r.is_used).toBe(false);
      expect(r.expired).toBe(false);
    });
  });

  it('✅ does NOT crash when 0 deflect cards in DB (silent fail)', async () => {
    const fetchMock = {
      select: jest.fn().mockReturnThis(),
      not:    jest.fn().mockReturnThis(),
      eq:     jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    wire(fetchMock);
    await expect(deflectService.grantDeflectCards(USER_B, ROOM_ID)).resolves.toBeUndefined();
  });

});

// ─────────────────────────────────────────────────────────────
// 2. useDeflectCard — Validation Guards
// ─────────────────────────────────────────────────────────────
describe('useDeflectCard — validation guards', () => {

  it('❌ non-receiver → 403', async () => {
    wire({ select: jest.fn().mockReturnValue(selectChain(makeSend({ receiver_id: 'user-C' }))) });
    await expect(deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID))
      .rejects.toMatchObject({ status: 403, message: 'You are not the receiver of this card.' });
  });

  it('❌ deck card not found → 404', async () => {
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend())) },
      { select: jest.fn().mockReturnValue(selectChain(null, { message: 'not found' })) }
    );
    await expect(deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID))
      .rejects.toMatchObject({ status: 404 });
  });

  it('❌ deck card already used → 409', async () => {
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend())) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('CANCEL_ANY', { is_used: true }))) }
    );
    await expect(deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('already been played') });
  });

  it('❌ deck card expired → 410', async () => {
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend())) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('CANCEL_ANY', { expired: true }))) }
    );
    await expect(deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID))
      .rejects.toMatchObject({ status: 410 });
  });

  it('❌ not a deflect card (null deflect_action) → 400', async () => {
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend())) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck(null))) }
    );
    await expect(deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID))
      .rejects.toMatchObject({ status: 400, message: 'This is not a deflect card.' });
  });

  it('❌ CANCEL_ANY on IN_PROGRESS (already accepted) → 409', async () => {
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status: 'IN_PROGRESS' }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('CANCEL_ANY'))) }
    );
    await expect(deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('accepted') });
  });

  it('❌ CANCEL_ANY on DEFLECTED card (already closed) → 409', async () => {
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status: 'DEFLECTED' }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('CANCEL_ANY'))) }
    );
    await expect(deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('already closed') });
  });

});

// ─────────────────────────────────────────────────────────────
// 3. CANCEL_ANY
// Tests: Big Fat No, Yeh Nah, Not Feeling It, Break Glass, etc.
// ─────────────────────────────────────────────────────────────
describe('CANCEL_ANY (Big Fat No / Yeh Nah / etc.)', () => {

  const runTest = async (status) => {
    const upd = makeUpdateChain();    // update send → DEFLECTED
    const markUsed = makeUpdateChain(); // mark deck card used
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('CANCEL_ANY'))) },
      upd, markUsed
    );
    const result = await deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID);
    expect(result.outcome).toBe('CANCELLED');
    expect(result.deflect_action).toBe('CANCEL_ANY');
    expect(upd.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'DEFLECTED' }));
  };

  it('✅ SENT → DEFLECTED',    () => runTest('SENT'));
  it('✅ WAITING → DEFLECTED', () => runTest('WAITING'));

});

// ─────────────────────────────────────────────────────────────
// 4. CANCEL_SENT_ONLY  (The 'Nice Try' Card)
// ─────────────────────────────────────────────────────────────
describe("CANCEL_SENT_ONLY (The 'Nice Try' Card)", () => {

  it('✅ SENT → DEFLECTED', async () => {
    const upd = makeUpdateChain();
    const markUsed = makeUpdateChain();
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status: 'SENT' }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('CANCEL_SENT_ONLY'))) },
      upd, markUsed
    );
    const result = await deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID);
    expect(result.outcome).toBe('CANCELLED');
    expect(upd.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'DEFLECTED' }));
  });

  it('❌ WAITING → 409 (missed the instant-cancel window)', async () => {
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status: 'WAITING' }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('CANCEL_SENT_ONLY'))) }
    );
    await expect(deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('"Nice Try"') });
  });

});

// ─────────────────────────────────────────────────────────────
// 5. CANCEL_IN_PROGRESS  (Party Pooper)
// Special: the ONLY card that can fire on IN_PROGRESS status.
// ─────────────────────────────────────────────────────────────
describe('CANCEL_IN_PROGRESS (Party Pooper)', () => {

  const runTest = async (status) => {
    const upd = makeUpdateChain();
    const markUsed = makeUpdateChain();
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('CANCEL_IN_PROGRESS'))) },
      upd, markUsed
    );
    const result = await deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID);
    expect(result.outcome).toBe('CANCELLED');
    expect(upd.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'DEFLECTED' }));
  };

  it('✅ IN_PROGRESS → DEFLECTED (bypasses acceptance guard)', () => runTest('IN_PROGRESS'));
  it('✅ SENT → DEFLECTED',                                     () => runTest('SENT'));
  it('✅ WAITING → DEFLECTED',                                  () => runTest('WAITING'));

  it('❌ COMPLETED → 409 (cannot reopen already closed card)', async () => {
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status: 'COMPLETED' }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('CANCEL_IN_PROGRESS'))) }
    );
    await expect(deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID))
      .rejects.toMatchObject({ status: 409 });
  });

});

// ─────────────────────────────────────────────────────────────
// 6. CANCEL_IMMUNE  (Not Today Satan)
// ─────────────────────────────────────────────────────────────
describe('CANCEL_IMMUNE (Not Today Satan)', () => {

  it('✅ SENT → DEFLECTED + is_deflect_immune=true on send record', async () => {
    const upd = makeUpdateChain();
    const markUsed = makeUpdateChain();
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status: 'SENT' }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('CANCEL_IMMUNE'))) },
      upd, markUsed
    );
    const result = await deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID);
    expect(result.outcome).toBe('CANCELLED_IMMUNE');
    expect(result.is_deflect_immune).toBe(true);
    expect(upd.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'DEFLECTED',
      is_deflect_immune: true,
    }));
  });

  it('❌ WAITING → still works (immune card works on WAITING too)', async () => {
    const upd = makeUpdateChain();
    const markUsed = makeUpdateChain();
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status: 'WAITING' }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('CANCEL_IMMUNE'))) },
      upd, markUsed
    );
    const result = await deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID);
    expect(result.outcome).toBe('CANCELLED_IMMUNE');
  });

});

// ─────────────────────────────────────────────────────────────
// 7. REVERSE_ROLES  (Switcheroo / Role Reversal Defense)
// ─────────────────────────────────────────────────────────────
describe('REVERSE_ROLES (Switcheroo / Role Reversal Defense)', () => {

  it('✅ SENT → cancels original + creates reversed send (A→B becomes B→A)', async () => {
    const cancelUpd = makeUpdateChain();
    const newSend   = {
      id: 'new-send-99', sender_id: USER_B, receiver_id: USER_A,
      status: 'SENT', sent_at: new Date().toISOString(), respond_deadline: '',
    };
    const insertCh  = makeInsertChain(newSend);
    const markUsed  = makeUpdateChain();

    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status: 'SENT' }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('REVERSE_ROLES'))) },
      cancelUpd, insertCh, markUsed
    );

    const result = await deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID);
    expect(result.outcome).toBe('REVERSED');
    expect(result.new_send.sender_id).toBe(USER_B);    // original receiver → now sender
    expect(result.new_send.receiver_id).toBe(USER_A);  // original sender   → now receiver
    expect(cancelUpd.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'DEFLECTED' }));
    expect(insertCh.insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ sender_id: USER_B, receiver_id: USER_A, status: 'SENT' }),
    ]));
  });

  it('❌ WAITING → REVERSE_ROLES also works', async () => {
    const cancelUpd = makeUpdateChain();
    const newSend   = { id: 'ns-2', sender_id: USER_B, receiver_id: USER_A, status: 'SENT', sent_at: '', respond_deadline: '' };
    const insertCh  = makeInsertChain(newSend);
    const markUsed  = makeUpdateChain();
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status: 'WAITING' }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('REVERSE_ROLES'))) },
      cancelUpd, insertCh, markUsed
    );
    const result = await deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID);
    expect(result.outcome).toBe('REVERSED');
  });

});

// ─────────────────────────────────────────────────────────────
// 8. TIMEOUT  (The Time Out Card)
// ─────────────────────────────────────────────────────────────
describe('TIMEOUT (The Time Out Card)', () => {

  const TEN_MIN = 10 * 60 * 1000;

  const runTimeout = async (status) => {
    const base = new Date(Date.now() + 24 * 3600 * 1000);
    const sendData = makeSend({
      status,
      respond_deadline: base.toISOString(),
      penalty_deadline: new Date(base.getTime() + 24 * 3600 * 1000).toISOString(),
    });
    const upd = makeUpdateChain();
    const markUsed = makeUpdateChain();
    wire(
      { select: jest.fn().mockReturnValue(selectChain(sendData)) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('TIMEOUT'))) },
      upd, markUsed
    );
    const result = await deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID);
    expect(result.outcome).toBe('TIMEOUT_EXTENDED');
    // Verify deadline extended by exactly 10 minutes
    const diff = new Date(result.new_respond_deadline).getTime() - base.getTime();
    expect(diff).toBe(TEN_MIN);
    // Must NOT set status = DEFLECTED (card stays active)
    expect(upd.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'DEFLECTED' }));
    expect(upd.update).toHaveBeenCalledWith(expect.objectContaining({
      respond_deadline: result.new_respond_deadline,
    }));
    return result;
  };

  it('✅ SENT → deadline extended by +10 min, status unchanged',    () => runTimeout('SENT'));
  it('✅ WAITING → deadline extended by +10 min, status unchanged', () => runTimeout('WAITING'));

  it('❌ IN_PROGRESS → 409 (TIMEOUT only works before acceptance)', async () => {
    wire(
      { select: jest.fn().mockReturnValue(selectChain(makeSend({ status: 'IN_PROGRESS' }))) },
      { select: jest.fn().mockReturnValue(selectChain(makeDeck('TIMEOUT'))) }
    );
    await expect(deflectService.useDeflectCard(USER_B, SEND_ID, DECK_ID))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('accepted') });
  });

});
