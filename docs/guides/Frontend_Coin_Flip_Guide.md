# Frontend Developer Guide: Real-Time Coin Flip 🪙

This document explains how to implement the newly added **Real-Time Coin Flip** feature. 

## The Rules
1. **Room Status:** The coin flip can only be used if the user is in an `ACTIVE` room (meaning both Host and Partner have successfully joined). 
2. **Offline Support:** It is **okay** if the other user is currently offline/app closed. The room itself just needs to be an active couple.
3. **No Database Storage:** As requested, coin flip results are completely ephemeral. They are NOT stored in the database.

## 🔌 API Endpoint: Triggering a Flip

When User 1 taps the "Flip Coin" button, they must select a side and provide a reason.

**Endpoint:** `POST /api/v1/rooms/coin-flip`
**Auth Required:** Bearer Token

**Request Body:**
```json
{
  "reason": "Who has to do the dishes tonight?",
  "chosen_side": "HEADS" // Must be exactly "HEADS" or "TAILS"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "flipper_id": "8415a091-df5e-490b-85fb-db295af2af4b",
    "partner_id": "d4a3ea13-e30c-4bbe-acbd-68cbd9c74252",
    "reason": "Who has to do the dishes tonight?",
    "chosen_side": "HEADS",
    "result": "TAILS",
    "winner_id": "d4a3ea13-e30c-4bbe-acbd-68cbd9c74252",
    "timestamp": "2026-06-23T17:58:14.000Z"
  }
}
```

---

## 📡 Synchronizing the UI (WebSockets)

When User 1 calls the API above, the backend instantly calculates the winner and broadcasts a Socket.io event to the room channel.

**Event Name:** `coin_flip_result`

**Action for Frontend:**
Both User 1 and User 2 should listen for the `coin_flip_result` socket event. When it arrives:
1. Play the 3D coin flip animation on the screen.
2. Wait for the animation to finish.
3. Display the `result` (Heads/Tails) and declare the winner using `winner_id` and the `reason`.

Since both phones receive the socket event at the exact same millisecond, the animation and the result reveal will happen simultaneously on both screens!

---

## 📱 Handling Offline Users (Push Notifications)

Because there is **no database storage** for coin flips, an offline user cannot fetch past coin flips when they reopen the app. 

To solve the requirement: *"when user online he receive notification and when open the app get pop window that show result"*, you must use **Silent Push Notifications (FCM/APNs)**.

**How to implement the offline popup without a database:**
1. In the future, when we integrate Firebase Cloud Messaging (FCM), the backend will send a push notification containing the exact JSON payload shown above directly to User 2's phone.
2. If User 2's phone is locked, they see: *"Coin Flip Result: Who has to do the dishes tonight?"*
3. When User 2 taps the notification, the mobile OS passes the JSON payload to the Flutter/React Native app.
4. Your frontend code reads the payload from the notification data and triggers the popup window showing the result!

This completely satisfies the requirement of showing offline users a popup when they open the app *without* ever saving the result to a database.
