# EleVora — Card Game Engine: Complete API Reference & Admin Panel Guide
**Level:** Advanced | Backend + Admin Dashboard
**Version:** Phase 4 — Card Game Engine

---

## Table of Contents

1. [System Overview — What Is Built](#1-system-overview)
2. [Database Schema Reference](#2-database-schema)
3. [Complete API Reference — Card Game Engine](#3-api-reference)
4. [Socket.io Events Reference](#4-socketio-events)
5. [Admin Panel — Game Management APIs](#5-admin-game-management)
6. [Admin Panel — Card Analytics APIs](#6-admin-card-analytics)
7. [Admin Panel — Relationship Dynamics APIs](#7-relationship-dynamics)
8. [Admin Panel — User Performance APIs](#8-user-performance)
9. [Business Metrics Queries](#9-business-metrics)
10. [Implementation Notes for Admin Dashboard](#10-implementation-notes)

---

## 1. System Overview

### What Is Built (Code Complete ✅)

The card game engine is a full state-machine system layered on top of the deck. Every card send between partners goes through a defined lifecycle — and **every data point needed for admin analytics is captured automatically** at the moment it occurs.

```
SENT ──(24h no action)──► WAITING ──(48h total)──► PENALTY
  │
  ├──► accepted ──► IN_PROGRESS
  │         ├──► receiver marks done ──► COMPLETED_BY_RECEIVER
  │         │                                  └──► sender confirms ──► COMPLETED ✅
  │         └──► deflect ──► DEFLECTED ✅
  └──► deflect ──► DEFLECTED ✅
```

### Business Rules Enforced in Code

| Rule | Value | Enforcement |
|:--|:--|:--|
| Max cards sent per day | 3 | Checked in `sendCard()`, resets midnight UTC |
| Max active cards at once | 2 | Checked in `sendCard()` and `acceptCard()` |
| Respond window | 24h | `respond_deadline = sent_at + 24h` |
| Penalty trigger | 48h total | `penalty_deadline = sent_at + 48h` |
| Reminder rate limit | 1 per 6h | Checked in `sendReminder()` |
| Status updates | Lazy | `resolveOverdueStatuses()` runs on fetch/send |

---

## 2. Database Schema

### Table: `room_card_sends`

```sql
id                       UUID PRIMARY KEY
room_id                  UUID → rooms.id
sender_id                UUID → users.id
receiver_id              UUID → users.id
deck_card_id             UUID → user_card_deck.id (UNIQUE — one send per card)
card_id                  UUID → cards.id
message                  TEXT (max 200 chars, nullable)

status                   ENUM: SENT | WAITING | PENALTY |
                               IN_PROGRESS | COMPLETED_BY_RECEIVER |
                               COMPLETED | DEFLECTED

respond_deadline         TIMESTAMP  ← sent_at + 24h
penalty_deadline         TIMESTAMP  ← sent_at + 48h

sent_at                  TIMESTAMP  ← when card was sent
accepted_at              TIMESTAMP  ← when receiver accepted
deflected_at             TIMESTAMP  ← when receiver deflected
completed_by_receiver_at TIMESTAMP  ← when receiver marked done
confirmed_at             TIMESTAMP  ← when sender confirmed
penalty_triggered_at     TIMESTAMP  ← when penalty status set
reminder_sent_at         TIMESTAMP  ← last reminder timestamp
reminder_count           INTEGER    ← total reminders sent (analytics)
is_seen                  BOOLEAN    ← receiver opened the card
seen_at                  TIMESTAMP
```

### Key Computed Metrics Available from This Table

| Metric | Formula |
|:--|:--|
| Response time | `accepted_at - sent_at` |
| Completion time | `confirmed_at - accepted_at` |
| Total active time | `confirmed_at - sent_at` |
| Initiation balance | `COUNT(*) WHERE sender_id = userA vs userB` |
| Acceptance rate | `COUNT(accepted_at NOT NULL) / COUNT(*)` |
| Deflect rate | `COUNT(status='DEFLECTED') / COUNT(*)` |
| Penalty rate | `COUNT(status='PENALTY') / COUNT(*)` |
| Completion rate | `COUNT(status='COMPLETED') / COUNT(*)` |
| Sender non-responsiveness | `AVG(reminder_count)` |

---

## 3. API Reference — Card Game Engine (User-Facing)

All routes are under `/api/v1/user/deck/`. All require `Authorization: Bearer <accessToken>`.

---

### GET `/user/deck`
Get user's full card deck (all visible cards).

**Response:**
```json
{
  "data": {
    "total": 5,
    "cards": [
      {
        "deck_card_id": "uuid",
        "card_name": "Moonlight Walk",
        "power_description": "Take a moonlit walk together",
        "category_name": "Romance",
        "category_color": "#FF6B6B",
        "room_id": "room-uuid",
        "is_used": false,
        "expired": false,
        "acquired_at": "2026-05-24T10:00:00Z"
      }
    ]
  }
}
```

---

### GET `/user/deck/available?room_id=<uuid>`
Get only unused, unexpired cards for the current room.

**Query:** `room_id` (required)

---

### POST `/user/deck/:deckCardId/use`
Play a card (mark as used, no send to partner).

**Body:** `{ "room_id": "uuid" }`

---

### GET `/user/deck/sends/limits`
Check how many cards the user can still send today.

**Response:**
```json
{
  "data": {
    "daily_sent": 1,
    "daily_limit": 3,
    "daily_remaining": 2,
    "active_count": 1,
    "active_limit": 2,
    "active_remaining": 1,
    "can_send": true
  }
}
```

**Frontend use:** Call this before showing the Send button. If `can_send = false`, disable button and show reason.

---

### POST `/user/deck/:deckCardId/send`
Send a card to partner with optional message.

**Body:**
```json
{
  "room_id": "uuid",
  "receiver_id": "partner-user-uuid",
  "message": "Thinking of you ❤️"
}
```

**Validation enforced:**
- Daily limit (max 3) — returns `429` if exceeded
- Active limit (max 2) — returns `429` if exceeded
- Card belongs to sender — `403`
- Card already used — `409`
- Card expired — `410`
- Receiver not in room — `400`
- Message > 200 chars — `400`

**Emits:** `card_received` → receiver (real-time)

**Response:**
```json
{
  "data": {
    "send": {
      "id": "send-uuid",
      "status": "SENT",
      "respond_deadline": "2026-05-25T10:00:00Z",
      "penalty_deadline": "2026-05-25T22:00:00Z",
      "message": "Thinking of you ❤️",
      "cards": {
        "name": "Moonlight Walk",
        "power_description": "Take a moonlit walk tonight",
        "card_type": "ACTION"
      }
    }
  }
}
```

---

### PATCH `/user/deck/sends/:sendId/seen`
Receiver marks card as seen (read receipt).

**Emits:** `card_seen` → sender

---

### PATCH `/user/deck/sends/:sendId/accept`
Receiver accepts card → moves to `IN_PROGRESS`.

**Validation:** Receiver's active IN_PROGRESS cards < 2

**Emits:** `card_accepted` → sender

**Response:**
```json
{
  "data": {
    "send": {
      "id": "send-uuid",
      "status": "IN_PROGRESS",
      "accepted_at": "2026-05-24T11:00:00Z"
    }
  }
}
```

---

### PATCH `/user/deck/sends/:sendId/deflect`
Receiver deflects card → `DEFLECTED` (no penalty, card closed).

**Emits:** `card_deflected` → sender

---

### PATCH `/user/deck/sends/:sendId/complete`
Receiver marks card as done → `COMPLETED_BY_RECEIVER`. Sender must confirm.

**Emits:** `card_completed_by_receiver` → sender

---

### PATCH `/user/deck/sends/:sendId/confirm`
Sender confirms receiver's completion → `COMPLETED` ✅

**Emits:** `card_confirmed` → receiver

---

### POST `/user/deck/sends/:sendId/reminder`
Receiver nudges sender to confirm. Rate limited: once per 6 hours.

**Emits:** `card_reminder` → sender

**Error if too soon:** `429 — You already sent a reminder recently. Wait at least 6 hours.`

---

### GET `/user/deck/sends?room_id=<uuid>`
Get full send history for a room (both directions).

**Response:**
```json
{
  "data": {
    "total": 3,
    "sends": [
      {
        "id": "send-uuid",
        "sender_id": "uuid",
        "receiver_id": "uuid",
        "status": "COMPLETED",
        "message": "Did you enjoy it?",
        "sent_at": "2026-05-24T10:00:00Z",
        "accepted_at": "2026-05-24T12:00:00Z",
        "confirmed_at": "2026-05-24T18:00:00Z",
        "respond_deadline": "2026-05-25T10:00:00Z",
        "penalty_deadline": "2026-05-25T22:00:00Z",
        "reminder_count": 1,
        "cards": {
          "name": "Moonlight Walk",
          "power_description": "...",
          "card_type": "ACTION",
          "card_categories": { "name": "Romance", "theme_color": "#FF6B6B" }
        }
      }
    ]
  }
}
```

---

## 4. Socket.io Events Reference

All events are broadcast to the `room_id` channel. Both users should be subscribed to the room channel after joining.

| Event | Emitted When | Payload |
|:--|:--|:--|
| `card_received` | Sender sends a card | `{ send_id, sender_id, receiver_id, card, message, sent_at, respond_deadline }` |
| `card_seen` | Receiver opens card | `{ send_id, receiver_id, seen_at }` |
| `card_accepted` | Receiver accepts | `{ send_id, receiver_id, accepted_at }` |
| `card_deflected` | Receiver deflects | `{ send_id, receiver_id, deflected_at }` |
| `card_completed_by_receiver` | Receiver marks done | `{ send_id, receiver_id, completed_by_receiver_at }` |
| `card_confirmed` | Sender confirms | `{ send_id, sender_id, confirmed_at }` |
| `card_reminder` | Receiver sends reminder | `{ send_id, receiver_id, message }` |

### Socket Connection (Frontend)
```javascript
// Connect after login
const socket = io('https://54.91.119.137', {
  auth: { token: accessToken },
  transports: ['websocket'],
});

// Join room channel
socket.emit('join_room', roomCode);  // e.g. "ELV-ABC123"

// Listen for card events
socket.on('card_received', (payload) => {
  showCardReceivedModal(payload);
});
socket.on('card_accepted', ({ send_id }) => {
  updateCardStatus(send_id, 'IN_PROGRESS');
});
socket.on('card_confirmed', ({ send_id, confirmed_at }) => {
  updateCardStatus(send_id, 'COMPLETED');
  showConfetti();
});
```

---

## 5. Admin Panel — Game Management APIs

> **Status:** Phase 1 — To be built. Data is already available.

### GET `/admin/games`
List all rooms/games with card send summary.

**Query params:** `status`, `from_date`, `to_date`, `page`, `limit`

**Response shape (planned):**
```json
{
  "data": {
    "games": [
      {
        "room_id": "uuid",
        "room_code": "ELV-ABC123",
        "status": "ACTIVE",
        "created_at": "2026-05-24T08:00:00Z",
        "players": [
          { "user_id": "uuid", "name": "User A" },
          { "user_id": "uuid", "name": "User B" }
        ],
        "cards_summary": {
          "total_sent": 5,
          "completed": 2,
          "in_progress": 1,
          "pending": 1,
          "penalty": 1,
          "deflected": 0
        }
      }
    ]
  }
}
```

**Supabase query pattern:**
```javascript
const { data } = await supabase
  .from('rooms')
  .select(`
    id, code, status, created_at, expiry_type,
    room_members ( user_id, users(id, name, email) ),
    room_card_sends (
      id, status, sent_at, accepted_at, confirmed_at, penalty_triggered_at
    )
  `)
  .eq('status', filterStatus)
  .order('created_at', { ascending: false });
```

---

### GET `/admin/games/:roomId`
Full game detail — players, all card sends, penalties, deflects.

**Data sources:**
- `rooms` — room metadata
- `room_members` + `users` — player details
- `room_card_sends` + `cards` — full card send history with statuses
- `user_card_deck` — all cards owned in this room

---

### POST `/admin/games/:roomId/force-end`
Force-expire a room immediately.

**Effect:**
- Sets `rooms.status = 'EXPIRED'`
- DB trigger fires automatically → all cards expired

---

## 6. Admin Panel — Card Analytics APIs

> **Status:** Phase 2 — To be built. All data is captured now.

### GET `/admin/analytics/cards`
Per-card performance metrics across all games.

**Response shape (planned):**
```json
{
  "data": {
    "cards": [
      {
        "card_id": "uuid",
        "card_name": "Moonlight Walk",
        "category": "Romance",
        "times_sent": 45,
        "acceptance_rate": 0.82,
        "deflect_rate": 0.08,
        "penalty_rate": 0.04,
        "completion_rate": 0.75,
        "avg_response_time_hours": 3.2,
        "avg_completion_time_hours": 18.5,
        "avg_reminder_count": 0.3
      }
    ]
  }
}
```

**Supabase query pattern:**
```javascript
// Group by card_id, compute ratios
const { data } = await supabase
  .from('room_card_sends')
  .select(`
    card_id,
    status,
    accepted_at,
    sent_at,
    confirmed_at,
    reminder_count,
    cards ( name, card_categories(name) )
  `);

// Then aggregate in JS or use a DB view
```

---

### GET `/admin/analytics/cards/:cardId`
Detailed analytics for one specific card.

**Returns:** Full history of every send of this card — who sent, who received, how long to accept, outcome.

---

## 7. Relationship Dynamics APIs

> **Status:** Phase 2 — To be built.

### GET `/admin/analytics/relationships`
Aggregate relationship health metrics across all games.

**Response shape (planned):**
```json
{
  "data": {
    "avg_initiation_balance": 0.62,
    "avg_response_time_hours": 4.8,
    "avg_completion_rate": 0.71,
    "penalty_frequency_per_game": 0.3,
    "one_sided_games_pct": 0.12
  }
}
```

**Key query — initiation balance:**
```sql
-- For each room: ratio of cards sent by person A vs person B
SELECT
  room_id,
  sender_id,
  COUNT(*) as cards_sent
FROM room_card_sends
GROUP BY room_id, sender_id;
-- Balance = abs(A_count - B_count) / total
-- 0 = perfectly balanced, 1 = entirely one-sided
```

### GET `/admin/analytics/relationships/:roomId`
Deep dive on one specific room's relationship dynamics.

---

## 8. User Performance APIs

> **Status:** Phase 2 — To be built.

### GET `/admin/users/:userId/performance`
Full behavioral profile of one user.

**Response shape (planned):**
```json
{
  "data": {
    "user_id": "uuid",
    "name": "John",
    "total_cards_sent": 28,
    "total_cards_received": 24,
    "avg_response_time_hours": 2.1,
    "acceptance_rate": 0.88,
    "deflect_rate": 0.04,
    "completion_rate_as_sender": 0.79,
    "completion_rate_as_receiver": 0.83,
    "avg_reminder_count_sent": 0.5,
    "penalty_rate_as_receiver": 0.02,
    "initiation_rate": 0.54,
    "total_games": 6,
    "active_games": 1
  }
}
```

**All computed from existing `room_card_sends` data. No new tables needed.**

---

### GET `/admin/analytics/retention`
Day 3, Day 7, Day 30 retention.

**Query pattern:**
```sql
-- Day 7 retention: users who signed up 7 days ago AND have a room_card_sends row in the last 7 days
SELECT
  COUNT(DISTINCT u.id) FILTER (
    WHERE u.created_at >= NOW() - INTERVAL '8 days'
    AND u.created_at < NOW() - INTERVAL '6 days'
    AND EXISTS (
      SELECT 1 FROM room_card_sends rcs
      WHERE rcs.sender_id = u.id
      AND rcs.sent_at >= NOW() - INTERVAL '1 day'
    )
  )::FLOAT /
  NULLIF(COUNT(DISTINCT u.id) FILTER (
    WHERE u.created_at >= NOW() - INTERVAL '8 days'
    AND u.created_at < NOW() - INTERVAL '6 days'
  ), 0) AS day7_retention
FROM users u;
```

---

## 9. Business Metrics Queries

These are all computable from existing data. For the admin dashboard:

```javascript
// Cards played per user (avg)
SELECT AVG(cards_per_user) FROM (
  SELECT user_id, COUNT(*) as cards_per_user
  FROM room_card_sends GROUP BY user_id
) sub;

// Penalty frequency per game
SELECT AVG(penalties) FROM (
  SELECT room_id, COUNT(*) as penalties
  FROM room_card_sends WHERE status = 'PENALTY'
  GROUP BY room_id
) sub;

// Conversion to paid (users who bought AND played)
SELECT
  COUNT(DISTINCT p.user_id) as paid_and_played,
  COUNT(DISTINCT u.id) as total_users,
  COUNT(DISTINCT p.user_id)::FLOAT / COUNT(DISTINCT u.id) as conversion_rate
FROM users u
LEFT JOIN user_purchases p ON p.user_id = u.id AND p.status = 'completed';
```

---

## 10. Implementation Notes for Admin Dashboard

### Lazy Status Resolution
The engine uses lazy status updates — statuses are recalculated when data is fetched.
For admin queries, always trigger resolution first OR add a cron-style scheduled function:

```javascript
// Run daily on server (or use Supabase scheduled functions)
const resolveAllOverdueStatuses = async () => {
  const now = new Date().toISOString();

  await supabase
    .from('room_card_sends')
    .update({ status: 'WAITING' })
    .eq('status', 'SENT')
    .lt('respond_deadline', now);

  await supabase
    .from('room_card_sends')
    .update({ status: 'PENALTY', penalty_triggered_at: now })
    .in('status', ['SENT', 'WAITING'])
    .lt('penalty_deadline', now);
};
```

### No Schema Changes Needed for Phase 2 Analytics
Every column required for Phase 2 admin analytics is already captured:
- Response time → `accepted_at - sent_at`
- Completion time → `confirmed_at - accepted_at`
- Reminder pressure → `reminder_count`
- Initiation balance → `sender_id` grouping
- All rates → `status` grouping

### Admin Query Optimization
For heavy analytics queries, create DB views in Supabase:
```sql
-- Recommended view for card analytics (create in Supabase)
CREATE VIEW v_card_send_analytics AS
SELECT
  rcs.card_id,
  c.name as card_name,
  cc.name as category_name,
  rcs.status,
  EXTRACT(EPOCH FROM (rcs.accepted_at - rcs.sent_at))/3600 as response_time_hours,
  EXTRACT(EPOCH FROM (rcs.confirmed_at - rcs.accepted_at))/3600 as completion_time_hours,
  rcs.reminder_count,
  rcs.room_id,
  rcs.sender_id,
  rcs.receiver_id,
  rcs.sent_at
FROM room_card_sends rcs
JOIN cards c ON c.id = rcs.card_id
JOIN card_categories cc ON cc.id = c.category_id;
```
