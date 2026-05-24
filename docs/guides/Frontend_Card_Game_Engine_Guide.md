# EleVora — Frontend Integration Guide: Card Game Engine
**Version:** Phase 4 (Card Game Engine Implementation)
**Audience:** Mobile Frontend Developers (React Native / Flutter / iOS / Android)
**Base URL:** `https://54.91.119.137/api/v1`

---

## 📋 Table of Contents

1. [Introduction & Game Loop](#1-introduction--game-loop)
2. [Checking Limits Before Actions](#2-checking-limits)
3. [Card Sends API Reference](#3-card-sends-api-reference)
4. [Real-time Socket.io Integration](#4-real-time-socketio-integration)
5. [UI/UX Reference & Components](#5-uiux-reference--components)
6. [State Management Design (Zustand & Riverpod)](#6-state-management-design)
7. [Calculated Deadlines & Countdowns](#7-calculated-deadlines--countdowns)
8. [Edge Cases & Error Handling](#8-edge-cases--error-handling)

---

## 1. Introduction & Game Loop

The card game engine extends standard card playing into a collaborative turn-based interaction model. Users do not just play a card locally; they **send it** to their partner with an optional message, which requires acceptance, completion, and validation.

### The Card Engine State Machine

```
      [SENDER]                            [RECEIVER]
  
  Select card from deck
           │
           ▼
     Limit Checks ────────► FAIL (429/400) ──► Show tooltip/lock
   (Daily/Active OK?)
           │
           ▼ PASS
  POST /:id/send (with msg) ──► Socket: card_received ──► Popup / Notification
           │
           ├─── (Receiver deflects card) ────────────────► status: DEFLECTED (Terminated)
           │
           ├─── (No action in 24h) ──────────────────────► status: WAITING (Lazy transition)
           │                                                    │
           │                                                    └──► (No action in 48h total) ──► PENALTY
           │
           ▼ (Receiver accepts)
    status: IN_PROGRESS
           │
           ▼ (Receiver completes action)
  PATCH /sends/:id/complete ──► Socket: card_completed_by_receiver
           │
           ├─── (Receiver reminders sender) ─────────────► Rate-limited 6h nudge
           │
           ▼ (Sender confirms)
   status: COMPLETED ✅ (Terminated)
```

### Business Rules Summary

- **Daily Send Limit:** Max **3 cards** can be sent per user per day. This resets at midnight UTC.
- **Active Card Limit:** Max **2 active cards** at any time. A card is active if it is in a non-terminal status (`SENT`, `WAITING`, `IN_PROGRESS`, `COMPLETED_BY_RECEIVER`). Terminal statuses are `COMPLETED`, `DEFLECTED`, and `PENALTY`.
- **Response Window:** The receiver has **24 hours** to accept or deflect a card before it transitions to `WAITING`.
- **Penalty Window:** If the card remains unacted upon for **48 hours total**, the status becomes `PENALTY`.

---

## 2. Checking Limits

Before the user can open the card picker or hit the send action, the frontend should check the daily and active limits to disable buttons or show informative banners.

### API — Check Send Limits

```
GET /user/deck/sends/limits
Authorization: Bearer <accessToken>
```

**Response:**
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

### React Native Integration Example

```javascript
import React, { useEffect, useState } from 'react';
import { Button, Text, View, StyleSheet } from 'react-native';

const SendCardActionButton = ({ navigation, api }) => {
  const [limits, setLimits] = useState(null);

  useEffect(() => {
    const loadLimits = async () => {
      try {
        const res = await api.get('/user/deck/sends/limits');
        setLimits(res.data.data);
      } catch (err) {
        console.error('Failed to load send limits', err);
      }
    };
    loadLimits();
  }, []);

  if (!limits) return <Text>Loading limits...</Text>;

  const getLimitLabel = () => {
    if (limits.daily_remaining === 0) {
      return "Daily Limit Reached (3/3 cards sent today)";
    }
    if (limits.active_remaining === 0) {
      return "2 Active Cards In-Progress. Resolve one first.";
    }
    return `Send a Card (${limits.daily_remaining} left today)`;
  };

  return (
    <View style={styles.container}>
      <Button
        title={getLimitLabel()}
        disabled={!limits.can_send}
        onPress={() => navigation.navigate('CardPicker')}
      />
      <Text style={styles.subtext}>
        Active cards: {limits.active_count}/{limits.active_limit}
      </Text>
    </View>
  );
};
```

---

## 3. Card Sends API Reference

---

### A. Send Card to Partner

Sends a card from the user's available deck with an optional text note. Marks the card as used locally and triggers real-time socket delivery.

```
POST /user/deck/:deckCardId/send
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "room_id": "84c962cf-05d8-4cc3-bcad-195eacd2eeb8",
  "receiver_id": "user-uuid-of-partner",
  "message": "Write a sweet note here (max 200 chars)"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Card sent to partner!",
  "data": {
    "send": {
      "id": "send-record-uuid",
      "room_id": "84c962cf-05d8-4cc3-bcad-195eacd2eeb8",
      "sender_id": "your-user-uuid",
      "receiver_id": "user-uuid-of-partner",
      "message": "Write a sweet note here (max 200 chars)",
      "status": "SENT",
      "respond_deadline": "2026-05-25T15:10:00.000Z",
      "penalty_deadline": "2026-05-26T15:10:00.000Z",
      "sent_at": "2026-05-24T15:10:00.000Z",
      "cards": {
        "id": "card-template-uuid",
        "name": "Moonlight Walk",
        "power_description": "Take a moonlit walk together",
        "card_type": "ACTION",
        "card_categories": {
          "name": "Romance",
          "theme_color": "#FF6B6B"
        }
      }
    }
  }
}
```

---

### B. Mark Card as Seen (Read Receipt)

Call this endpoint as the receiver when opening/viewing a card received from your partner.

```
PATCH /user/deck/sends/:sendId/seen
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": "success",
  "message": "Card marked as seen.",
  "data": {
    "send": {
      "id": "send-record-uuid",
      "is_seen": true,
      "seen_at": "2026-05-24T15:15:00.000Z"
    }
  }
}
```

---

### C. Accept Card

The receiver accepts the card, putting it into `IN_PROGRESS` status.

```
PATCH /user/deck/sends/:sendId/accept
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": "success",
  "message": "Card accepted! It is now in progress.",
  "data": {
    "send": {
      "id": "send-record-uuid",
      "status": "IN_PROGRESS",
      "accepted_at": "2026-05-24T15:20:00.000Z"
    }
  }
}
```

---

### D. Deflect Card

Receiver deflects the card. This instantly moves the status to `DEFLECTED`, resolving the card with no penalties.

```
PATCH /user/deck/sends/:sendId/deflect
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": "success",
  "message": "Card deflected.",
  "data": {
    "send": {
      "id": "send-record-uuid",
      "status": "DEFLECTED",
      "deflected_at": "2026-05-24T15:21:00.000Z"
    }
  }
}
```

---

### E. Mark Completion (Receiver)

Call this when you (the receiver) have completed the task/action on the card. This pushes the card to `COMPLETED_BY_RECEIVER` where it awaits sender validation.

```
PATCH /user/deck/sends/:sendId/complete
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": "success",
  "message": "Marked as complete! Waiting for your partner to confirm.",
  "data": {
    "send": {
      "id": "send-record-uuid",
      "status": "COMPLETED_BY_RECEIVER",
      "completed_by_receiver_at": "2026-05-24T18:00:00.000Z"
    }
  }
}
```

---

### F. Confirm Completion (Sender)

The sender confirms the receiver completed the card action. This moves the status to `COMPLETED` (terminal state).

```
PATCH /user/deck/sends/:sendId/confirm
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": "success",
  "message": "Card completed and confirmed! 🎉",
  "data": {
    "send": {
      "id": "send-record-uuid",
      "status": "COMPLETED",
      "confirmed_at": "2026-05-24T18:15:00.000Z"
    }
  }
}
```

---

### G. Send Reminder (Receiver to Sender)

Receiver sends a rate-limited nudge to remind the sender to confirm completion.

```
POST /user/deck/sends/:sendId/reminder
Authorization: Bearer <accessToken>
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Reminder sent to your partner."
}
```

---

### H. Get Room Card Send History

Fetches the complete history of sent and received cards in the room.

```
GET /user/deck/sends?room_id=84c962cf-05d8-4cc3-bcad-195eacd2eeb8
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "total": 1,
    "sends": [
      {
        "id": "send-record-uuid",
        "room_id": "84c962cf-05d8-4cc3-bcad-195eacd2eeb8",
        "sender_id": "your-user-uuid",
        "receiver_id": "partner-uuid",
        "message": "Let's do this!",
        "status": "IN_PROGRESS",
        "sent_at": "2026-05-24T15:10:00.000Z",
        "accepted_at": "2026-05-24T15:20:00.000Z",
        "reminder_count": 0,
        "respond_deadline": "2026-05-25T15:10:00.000Z",
        "penalty_deadline": "2026-05-26T15:10:00.000Z",
        "cards": {
          "id": "card-uuid",
          "name": "Moonlight Walk",
          "power_description": "Take a moonlit walk together",
          "card_type": "ACTION",
          "card_categories": {
            "name": "Romance",
            "theme_color": "#FF6B6B"
          }
        }
      }
    ]
  }
}
```

---

## 4. Real-time Socket.io Integration

The mobile application should establish a real-time connection using the Socket.io client to listen for events while inside a room.

### Socket Listener Implementation Pattern

```javascript
import io from 'socket.io-client';

const setupSocketListeners = (roomId, userToken, onCardEvent) => {
  const socket = io('https://54.91.119.137', {
    auth: { token: userToken },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('Connected to real-time events.');
    socket.emit('join_room', roomId);
  });

  // 1. Listen for incoming cards
  socket.on('card_received', (payload) => {
    // payload: { send_id, sender_id, card: {...}, message, sent_at, respond_deadline }
    onCardEvent('RECEIVED', payload);
  });

  // 2. Listen for partner read receipts
  socket.on('card_seen', (payload) => {
    // payload: { send_id, receiver_id, seen_at }
    onCardEvent('SEEN', payload);
  });

  // 3. Listen for acceptance
  socket.on('card_accepted', (payload) => {
    // payload: { send_id, receiver_id, accepted_at }
    onCardEvent('ACCEPTED', payload);
  });

  // 4. Listen for deflects
  socket.on('card_deflected', (payload) => {
    // payload: { send_id, receiver_id, deflected_at }
    onCardEvent('DEFLECTED', payload);
  });

  // 5. Listen for receiver completion
  socket.on('card_completed_by_receiver', (payload) => {
    // payload: { send_id, receiver_id, completed_by_receiver_at }
    onCardEvent('COMPLETED_BY_RECEIVER', payload);
  });

  // 6. Listen for sender confirmation
  socket.on('card_confirmed', (payload) => {
    // payload: { send_id, sender_id, confirmed_at }
    onCardEvent('CONFIRMED', payload);
  });

  // 7. Listen for nudges/reminders
  socket.on('card_reminder', (payload) => {
    // payload: { send_id, receiver_id, message }
    onCardEvent('REMINDER', payload);
  });

  return () => {
    socket.disconnect();
  };
};
```

---

## 5. UI/UX Reference & Components

### Received Card Modal

When receiving a `card_received` payload, show a clean modal with:
1. **Sender Info:** "Your partner sent you a card!"
2. **Action/Task Title:** The card's name (e.g. "Breakfast in Bed")
3. **Task Details:** Card's `power_description`
4. **Message Text:** Render `message` inside a handwritten-style note bubble.
5. **Countdowns:** Format a countdown timer to show time remaining before the card slips into `WAITING` status.
6. **Action Triggers:** Dual options to Accept or Deflect.

### List Item Styling per Status

Map the statuses to dynamic UI themes for card list items:

| Status | Theme / Background | Action Button Displayed |
|:--|:--|:--|
| `SENT` | Pulse border, light background | Receiver: "Accept" / "Deflect" |
| `WAITING` | Amber tint / warning icon | Receiver: "Accept" (with warning label) |
| `PENALTY` | Deep red tint | Disabled, show penalty label |
| `IN_PROGRESS` | Purple highlight, timer active | Receiver: "Mark Done" |
| `COMPLETED_BY_RECEIVER` | Grayed out, loader icon | Sender: "Confirm Completion" |
| `COMPLETED` | Green checkmark, success state | None (terminal) |
| `DEFLECTED` | Grayed out, broken shield icon | None (terminal) |

---

## 6. State Management Design

Using local state updates directly is discouraged. State managers should keep card engine states updated cleanly using optimistic updates.

### Zustand Slice (React Native)

```javascript
import { create } from 'zustand';

export const useCardEngineStore = create((set, get) => ({
  sends: [],
  limits: null,
  isLoading: false,

  fetchSends: async (api, roomId) => {
    set({ isLoading: true });
    const res = await api.get(`/user/deck/sends?room_id=${roomId}`);
    set({ sends: res.data.data.sends, isLoading: false });
  },

  fetchLimits: async (api) => {
    const res = await api.get('/user/deck/sends/limits');
    set({ limits: res.data.data });
  },

  sendCardOptimistic: async (api, deckCardId, payload) => {
    // 1. Cache previous sends
    const previousSends = get().sends;
    
    // 2. Perform optimistic update locally
    const tempSendRecord = {
      id: `temp-${Date.now()}`,
      status: 'SENT',
      message: payload.message,
      sent_at: new Date().toISOString(),
      cards: payload.cardInfo, // pre-loaded card catalog info
    };
    
    set({ sends: [tempSendRecord, ...previousSends] });

    try {
      const res = await api.post(`/user/deck/${deckCardId}/send`, {
        room_id: payload.roomId,
        receiver_id: payload.receiverId,
        message: payload.message
      });
      // Replace temp record with database record
      set({
        sends: get().sends.map(s => s.id === tempSendRecord.id ? res.data.data.send : s)
      });
      get().fetchLimits(api); // refresh remaining values
    } catch (err) {
      // rollback state
      set({ sends: previousSends });
      throw err;
    }
  }
}));
```

---

## 7. Calculated Deadlines & Countdowns

Deadlines return as ISO strings (`respond_deadline` and `penalty_deadline`). The frontend must parse these and display real-time counters.

```javascript
// React Native CountDown Timer Component
import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';

export const CountdownTimer = ({ deadline }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      const difference = new Date(deadline).getTime() - Date.now();
      if (difference <= 0) {
        setTimeLeft('Expired');
        return;
      }

      const hours = Math.floor(difference / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return <Text>{timeLeft}</Text>;
};
```

---

## 8. Edge Cases & Error Handling

| HTTP Error | Message Code | User/UX Resolution Action |
|:--|:--|:--|
| **429** | `Daily limit reached...` | Gray out Send action. Direct user to wait until UTC Midnight. |
| **429** | `You already have 2 active cards...` | Trigger active limit screen showing current active cards blocking the queue. |
| **429** | `You already sent a reminder recently...` | Show error toast: "You can send another nudge in X hours." Disable nudge button. |
| **409** | `This card has already been used...` | Pull card list from API to refresh availability indices. Remove local stale entry. |
| **410** | `This card has expired.` | Refresh room states; notify user that the room session has expired. |
| **400** | `Receiver is not in this room.` | Room state mismatch. Direct user back to room join options screen. |
