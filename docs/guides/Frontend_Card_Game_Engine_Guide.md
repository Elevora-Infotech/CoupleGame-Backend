# EleVora — Frontend Developer Guide: Card Game Engine
**Version:** Phase 4 | Option B Room-Only Card Game Engine
**Audience:** Mobile Frontend Developer (React Native / Flutter)
**Base URL:** `https://54.91.119.137/api/v1`

---

## 📋 Table of Contents

1. [Understanding the Collaborative Card Loop](#1-understanding-the-collaborative-card-loop)
2. [Managing Daily and Active Card Limits](#2-managing-daily-and-active-card-limits)
3. [Complete API Lifecycle & Response Schemas](#3-complete-api-lifecycle--response-schemas)
4. [Real-time Events (Socket.io Connection)](#4-real-time-events-socketio-connection)
5. [UX Reference, Countdowns, and Deadlines](#5-ux-reference-countdowns-and-deadlines)
6. [State Management Design (Zustand / Riverpod)](#6-state-management-design-zustand--riverpod)
7. [Edge Cases & Error Handling Reference](#7-edge-cases--error-handling-reference)

---

## 1. Understanding the Collaborative Card Loop

The Card Game Engine is a collaborative turn-based lifecycle system. Users do not just play a card locally; they **send it** to their partner with an optional message, which requires acceptance, completion, and validation.

```
       [SENDER]                                           [RECEIVER]
   Select card from deck
             │
             ▼
   POST /user/deck/:id/send ─────────────────────────► Receives Socket event: 'card_received'
             │                                                 │
             │                                                 ▼
             │                                           Renders Card details
             │                                           (Option to Accept or Deflect)
             │                                                 │
             │                                                 ├────────────────────────┐
             │                                                 ▼                        ▼
             │                                           PATCH /.../accept        PATCH /.../deflect
             │                                        (Moves to IN_PROGRESS)      (Status = DEFLECTED)
             │                                                 │                        │
             │                                                 ▼                        ▼
     Receives Socket:                                     Complete Action          Ends Loop ✅
     'card_accepted'                                     in real life
             │                                                 │
             │                                                 ▼
             │                                           PATCH /.../complete
    Receives Socket:                                  (Moves to COMPLETED_BY_RECEIVER)
    'card_completed_by_receiver'                               │
             │                                                 │
             ▼                                                 │
      Sender Confirms                                          │
    PATCH /.../confirm ◄───────────────────────────────────────┘
             │
             ▼
    Status = COMPLETED ✅
    Receives Socket: 'card_confirmed'
```

### Card Status Reference Table

| Status | Terminal? | Meaning |
|:--|:--|:--|
| `SENT` | No | Card is sent, waiting for receiver to accept or deflect. |
| `WAITING` | No | 24 hours have passed without action from the receiver. |
| `PENALTY` | Yes | 48 hours total have passed without action. Penalty triggered. |
| `IN_PROGRESS` | No | Receiver accepted card and is completing the task. |
| `COMPLETED_BY_RECEIVER` | No | Receiver finished task; waiting for sender to confirm. |
| `COMPLETED` | Yes | Sender confirmed. Card completed successfully! |
| `DEFLECTED` | Yes | Receiver used a deflect option. Closed with no penalty. |

---

## 2. Managing Daily and Active Card Limits

To prevent overwhelming users, the backend enforces limits on card creation and play.

### Daily Limit: Max 3 Cards Sent
A user can send a maximum of **3 cards per calendar day** (resets at midnight UTC). If they try to send a 4th card, the backend returns a `429` error.

### Active Card Limit: Max 2 Cards Active
A user can only have **2 active (non-terminal) cards at any given time**.
- Non-terminal statuses: `SENT`, `WAITING`, `IN_PROGRESS`, `COMPLETED_BY_RECEIVER`.
- Terminal statuses: `COMPLETED`, `DEFLECTED`, `PENALTY`.
If a user has 2 cards pending confirmation, deflection, or response, they cannot send another card.

### Fetching Limits
Before rendering the card send interface, fetch the user's active limits:

```
GET /user/deck/sends/limits
Authorization: Bearer <accessToken>
```

**Response Schema:**
```json
{
  "status": "success",
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

---

## 3. Complete API Lifecycle & Response Schemas

### Step 1: Sender Sends Card
Sends a card from the deck with an optional text message to the partner.

```
POST /api/v1/user/deck/:deckCardId/send
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "room_id": "84c962cf-05d8-4cc3-bcad-195eacd2eeb8",
  "receiver_id": "receiver-user-uuid",
  "message": "Let's grab some ice cream tonight! 🍦"
}
```

**Response Schema:**
```json
{
  "status": "success",
  "message": "Card sent to partner!",
  "data": {
    "send": {
      "id": "send-record-uuid",
      "room_id": "84c962cf-05d8-4cc3-bcad-195eacd2eeb8",
      "sender_id": "sender-user-uuid",
      "receiver_id": "receiver-user-uuid",
      "message": "Let's grab some ice cream tonight! 🍦",
      "status": "SENT",
      "respond_deadline": "2026-05-25T15:00:00.000Z",
      "penalty_deadline": "2026-05-26T15:00:00.000Z",
      "sent_at": "2026-05-24T15:00:00.000Z"
    }
  }
}
```

### Step 2: Receiver Marks Card as Seen
Notify the sender that the card has been opened and read.

```
PATCH /api/v1/user/deck/sends/:sendId/seen
Authorization: Bearer <accessToken>
```

### Step 3: Receiver Accepts Card
Moves the card status to `IN_PROGRESS`.

```
PATCH /api/v1/user/deck/sends/:sendId/accept
Authorization: Bearer <accessToken>
```

### Step 4: Receiver Deflects Card (Alternative)
Receiver declines to perform the card. Closes the card cleanly.

```
PATCH /api/v1/user/deck/sends/:sendId/deflect
Authorization: Bearer <accessToken>
```

### Step 5: Receiver Marks Task as Complete
Once the real-life task is done, the receiver marks it as completed. Status becomes `COMPLETED_BY_RECEIVER`.

```
PATCH /api/v1/user/deck/sends/:sendId/complete
Authorization: Bearer <accessToken>
```

### Step 6: Sender Confirms Completion
Sender verifies the card has been completed. Status becomes `COMPLETED` (Terminal).

```
PATCH /api/v1/user/deck/sends/:sendId/confirm
Authorization: Bearer <accessToken>
```

### Optional: Receiver Nudges Sender to Confirm
If the sender has not confirmed, the receiver can send a nudge reminder (rate limited to once every 6 hours).

```
POST /api/v1/user/deck/sends/:sendId/reminder
Authorization: Bearer <accessToken>
```

---

## 4. Real-time Events (Socket.io Connection)

Webhooks and REST calls manage the state database, but Socket.io ensures instantaneous UI transitions.

### Client-Side Socket Listeners

#### Card Received
Renders a popup or banner notifying the partner a card has arrived.
```javascript
socket.on('card_received', (data) => {
  // data: { send_id, sender_id, receiver_id, room_id, card: { name, power_description }, message, sent_at }
  showToast(`New Card: ${data.card.name}!`);
  refreshActiveSendsList();
});
```

#### Card Accepted
Updates the state in the card list to `IN_PROGRESS`.
```javascript
socket.on('card_accepted', (data) => {
  // data: { send_id, receiver_id, accepted_at }
  updateCardStatus(data.send_id, 'IN_PROGRESS');
});
```

#### Card Completed by Receiver
Prompts the sender with an action button to "Confirm Completion".
```javascript
socket.on('card_completed_by_receiver', (data) => {
  // data: { send_id, receiver_id, completed_by_receiver_at }
  updateCardStatus(data.send_id, 'COMPLETED_BY_RECEIVER');
});
```

#### Card Confirmed
Closes the loop, plays success animation.
```javascript
socket.on('card_confirmed', (data) => {
  // data: { send_id, sender_id, confirmed_at }
  updateCardStatus(data.send_id, 'COMPLETED');
  showSuccessConfetti();
});
```

---

## 5. UX Reference, Countdowns, and Deadlines

Both `respond_deadline` (+24h) and `penalty_deadline` (+48h) are timestamps returned in the API responses.

### Calculating Countdowns dynamically:
```javascript
function getRemainingTime(deadlineString) {
  const deadline = new Date(deadlineString).getTime();
  const now = new Date().getTime();
  const diff = deadline - now;

  if (diff <= 0) return "Overdue";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return `${hours}h ${minutes}m left`;
}
```

### Status Visual Styling Guide:

- **SENT / WAITING**: Show a live ticking clock using `respond_deadline`. Color: Orange/Amber.
- **IN_PROGRESS**: Show as active. Clock ticks down to the `penalty_deadline`. Color: Purple/Indigo.
- **COMPLETED_BY_RECEIVER**: Show a glowing checkmark for the receiver: *"Awaiting partner verification"*. Show an action button for the sender: *"Confirm Completion"*.
- **COMPLETED**: Green badge or card border. Remove action buttons.

---

## 6. State Management Design (Zustand / Riverpod)

Keep active sends separate from your static deck inventory.

```javascript
import create from 'zustand';

const useCardGameStore = create((set, get) => ({
  activeSends: [],
  limits: null,

  fetchSends: async (roomId) => {
    const res = await api.get(`/user/deck/sends?room_id=${roomId}`);
    set({ activeSends: res.data.data.sends });
  },

  fetchLimits: async () => {
    const res = await api.get('/user/deck/sends/limits');
    set({ limits: res.data.data });
  },

  optimisticPlay: (deckCardId, details) => {
    // 1. Move card temporarily into state
    // 2. Reduce limits locally to avoid lag
  }
}));
```

---

## 7. Edge Cases & Error Handling Reference

| Error Code | Message String | Handling strategy |
|:--|:--|:--|
| `429` | *Daily limit reached...* | Disable button. Show popup: "No more sends available today." |
| `429` | *You already have 2 active cards...* | Redirect user to their pending card screen so they can clear one. |
| `429` | *You already sent a reminder recently...* | Disable the "remind" button, start a local 6-hour timer. |
| `410` | *This card has expired...* | Room was closed. Re-fetch current room status. |
| `409` | *This card has already been used or sent.* | Card was double-tapped or sent via another session. Remove card locally. |
