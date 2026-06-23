# Frontend Developer Guide: SoulShuffle Penalty System ⚖️

This document explains how to integrate the **SoulShuffle Penalty System** into the frontend. The backend handles 100% of the logic and enforcement. The frontend simply needs to display the consequences (Audit Log) and handle UI restrictions (Send Bans).

## The 3 Penalties

### 1. Penalty 1: Non-Acceptance (Card Ignored)
* **Trigger:** User A sends a card. User B ignores it for 48 hours.
* **Backend Action:** Card automatically goes to `PENALTY` status. 1 random unused card is permanently deleted from User B's deck.
* **Frontend Requirement:** None. Just reflect the updated deck count when `GET /api/v1/user/deck` is called. The penalty will appear in the Penalty Log.

### 2. Penalty 2: Accepted But Not Completed (Abandonment)
* **Trigger:** User B accepts a card (`IN_PROGRESS`) but doesn't complete it within 48 hours.
* **Backend Action:** User B is banned from sending ANY new cards for 24 hours.
* **Frontend Requirement:** Disable the "Send" button if the user is banned. 

### 3. Penalty 3: Explicit Rejection
* **Trigger:** User B explicitly taps the "Reject" button on a sent card.
* **Backend Action:** Card goes to `REJECTED` status. User B loses 1 unused card (or deflect card), and it is transferred to User A's deck.
* **Frontend Requirement:** Add a "Reject" button to the UI when a card is received.

---

## 🔌 API Integration

### 1. Checking if a User is Banned from Sending (Penalty 2)
Before showing the "Send" button, call the Limits API.

**Endpoint:** `GET /api/v1/user/deck/sends/limits`
```json
{
  "status": "success",
  "data": {
    "daily_count": 1,
    "active_count": 0,
    "can_send": false,
    "reason": "Something was started but left unfinished. Sending is paused for 24 hours.",
    "banned_until": "2026-06-18T10:16:52.136Z"
  }
}
```
**Frontend Action:** If `can_send` is `false` and `banned_until` is present, grey out the Send button and display the `reason` and expiration time.

### 2. Rejecting a Card (Penalty 3)
When User B receives a card, give them an option to "Reject" it.

**Endpoint:** `PATCH /api/v1/user/deck/sends/:sendId/reject`
**Response:**
```json
{
  "status": "success",
  "message": "A moment was declined. A new opportunity has moved elsewhere.",
  "data": {
    "card_transferred": {
      "id": "abc-123",
      "name": "Romantic Dinner",
      "source": "deck" // or "deflect", "master_pool"
    }
  }
}
```
**Frontend Action:** Close the card modal and show the `message` as a toast notification. The backend automatically handles transferring the asset.

### 3. Displaying the Penalty Log ("Consequences" UI)
You should create a "Consequences" or "Audit Log" screen in the room where both users can see exactly why cards went missing or why someone is banned.

**Endpoint:** `GET /api/v1/user/deck/penalties?room_id=<room_id>`
**Response:**
```json
{
  "status": "success",
  "data": {
    "logs": [
      {
        "id": "log-1",
        "penalty_type": "INCOMPLETE_CARD",
        "message": "Something was started but left unfinished. Sending is paused for 24 hours.",
        "ban_expires_at": "2026-06-18T10:16:52.136Z",
        "created_at": "2026-06-17T10:16:52.136Z",
        "penalized_user": { "id": "user-b", "name": "Sarah" }
      },
      {
        "id": "log-2",
        "penalty_type": "NON_ACCEPTANCE",
        "message": "A moment slipped away. One card was removed.",
        "created_at": "2026-06-16T09:00:00.000Z",
        "penalized_user": { "id": "user-b", "name": "Sarah" },
        "removed_card": { "id": "card-1", "name": "Movie Night" }
      }
    ]
  }
}
```

---

## 📡 WebSockets (Real-Time Updates)

The backend emits socket events when penalties occur. Listen for these to update the UI without refreshing:

1. **`card_rejected`**
   * Triggered when someone uses the Reject API.
   * *Payload:* `{ sendId, rejectedBy, message }`
   * *Action:* Remove the card from the active screen and show the toast message.

2. **Penalty 1 & 2 Background Resolution**
   * Penalties 1 and 2 are evaluated *lazily* when the user makes any deck-related API call. If a penalty is triggered in the background, the next time the user fetches their deck, it will simply reflect the new reality (missing cards or blocked sends).

## Summary Checklist for Frontend
- [ ] Implement `GET /sends/limits` check before enabling the Send Card button.
- [ ] Add a "Reject" button that calls `PATCH /sends/:sendId/reject`.
- [ ] Build a "Consequences / Penalty Log" screen using `GET /penalties?room_id=...`.
- [ ] Listen for the `card_rejected` socket event.
