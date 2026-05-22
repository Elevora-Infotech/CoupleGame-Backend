# EleVora — Frontend Guide: Store & User Deck
**Version:** Phase 4 (Option B — Room-Only Economy)
**Base URL:** `https://54.91.119.137/api/v1`

---

## 1. How the Economy Works (Read First)

EleVora uses a **"Room-Only Economy"**. The rules are:

| Rule | Frontend impact |
|:--|:--|
| Cards can only be bought **inside an active room** | Show Buy button ONLY when `room.status === "ACTIVE"` |
| Cards are **locked to that specific room** | Cards from Room A cannot be used in Room B |
| When room ends, **ALL cards are destroyed** | Warn user before purchase |
| No cards carry over to next room | Always fetch fresh cards per room |

---

## 2. Authentication

Every API call requires the user JWT in the header:
```
Authorization: Bearer <accessToken>
```
Get `accessToken` and `user.id` from the login/signup response. Store them securely (iOS Keychain / Android EncryptedSharedPreferences). `user.id` is also the RevenueCat `appUserId`.

---

## 3. Store Screen — Browse Bundles

### GET /store/bundles
```
GET /store/bundles
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "bundles": [
      {
        "id": "bundle-uuid",
        "name": "Romance Pack",
        "description": "Romantic couple cards",
        "cover_image_url": "https://example.com/romance.jpg",
        "plans": [
          {
            "id": "plan-uuid",
            "name": "Starter",
            "price": 10.00,
            "card_count": 5,
            "store_product_id": "elevora.romancepack.starter"
          }
        ],
        "total_cards": 25
      }
    ]
  }
}
```

**Key UI mappings:**

| Field | UI element |
|:--|:--|
| `name` | Bundle title |
| `cover_image_url` | Bundle thumbnail |
| `plans[0].price` | "₹10" price label |
| `plans[0].card_count` | "5 Cards" label |
| `plans[0].store_product_id` | **Pass to RevenueCat purchase call** |

### GET /store/bundles/:id — Bundle Detail Screen
```
GET /store/bundles/:bundleId
Authorization: Bearer <accessToken>
```
Shows the full card list inside a bundle.

---

## 4. Room Requirement Before Purchase

> ⚠️ The backend **rejects purchases** if the user is NOT in an active room.

**Recommended UI approach:**
- Add a **"🛒 Buy Cards"** button directly on the Room/Game screen
- When user is NOT in a room, show it disabled: *"Join a room to buy cards"*
- When `room.status === "ACTIVE"` → enable the button

**How to know if user is in a room:**
When user creates/joins a room, store these values:
```json
{
  "room": {
    "id": "room-uuid",      ← store this
    "code": "ELV-ABC123",
    "status": "ACTIVE"      ← check this
  }
}
```

---

## 5. User Deck Screen — All Cards

### GET /user/deck
```
GET /user/deck
Authorization: Bearer <accessToken>
```

**Response:**
```json
{
  "data": {
    "total": 5,
    "cards": [
      {
        "deck_card_id": "beadb863-...",
        "card_name": "Moonlight Walk",
        "power_description": "Take a moonlit walk together",
        "category_name": "Romance",
        "category_color": "#FF6B6B",
        "room_id": "room-uuid",
        "is_used": false,
        "expired": false,
        "acquired_at": "2026-05-22T08:30:00Z"
      }
    ]
  }
}
```

| Field | UI use |
|:--|:--|
| `deck_card_id` | Use this when calling Play Card API |
| `is_used` | Show "✓ Played" badge |
| `expired` | Grey out the card |
| `power_description` | Card action text |

---

## 6. Available Cards — Inside a Room (Card Picker)

> ⚠️ **Always pass `?room_id=` — API returns error without it.**

### GET /user/deck/available?room_id=...
```
GET /user/deck/available?room_id=<roomId>
Authorization: Bearer <accessToken>
```

Returns only unplayed, unexpired cards that belong to the current room.

```json
{
  "data": {
    "total": 4,
    "cards": [
      {
        "deck_card_id": "beadb863-...",
        "card_name": "Moonlight Walk",
        "power_description": "Take a moonlit walk together",
        "is_used": false,
        "expired": false
      }
    ]
  }
}
```

Show these as swipeable/selectable cards. User picks one to play.

---

## 7. Playing a Card

### POST /user/deck/:deckCardId/use
```
POST /user/deck/<deck_card_id>/use
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "room_id": "room-uuid"
}
```

> ⚠️ Always use `deck_card_id`, never `card_id`.

**Success:**
```json
{
  "status": "success",
  "data": {
    "card": {
      "id": "...",
      "is_used": true,
      "room_id": "room-uuid",
      "used_at": "2026-05-22T08:45:00Z"
    }
  }
}
```

**After success:** Remove card from available list, emit event to partner via Socket.io.

**Error codes:**

| HTTP | Message | Cause |
|:--|:--|:--|
| 403 | Card does not belong to you | Wrong user |
| 404 | Card not found | Wrong `deck_card_id` |
| 409 | Already played | Card already used |
| 410 | Card expired | Room has ended |

---

## 8. Purchase History

### GET /store/purchase/history
```
GET /store/purchase/history
Authorization: Bearer <accessToken>
```

```json
{
  "data": {
    "purchases": [
      {
        "bundle_name": "Romance Pack",
        "cards_received": 5,
        "amount_paid": 10.00,
        "currency": "INR",
        "status": "completed",
        "created_at": "2026-05-22T08:30:00Z"
      }
    ]
  }
}
```

---

## 9. Full UI Flow

```
LOGIN → store accessToken + user.id
  ↓
HOME → GET /store/bundles (show bundles, Buy disabled)
  ↓
CREATE / JOIN ROOM → store room.id, status=ACTIVE
  ↓
BUY BUTTON ENABLED (inside room screen)
  ↓
[See Payment Gateway Guide for purchase steps]
  ↓
CARDS APPEAR → GET /user/deck/available?room_id=...
  ↓
USER PICKS CARD → POST /user/deck/:id/use
  ↓
ROOM ENDS → ALL CARDS AUTO-DESTROYED by DB trigger
  ↓
BACK TO HOME (clean state)
```

---

## 10. Common Mistakes

| ❌ Wrong | ✅ Correct |
|:--|:--|
| Using `card_id` in play card API | Use `deck_card_id` |
| Not passing `?room_id=` to available cards | Always include it |
| Showing Buy outside a room | Only enable when `room.status === "ACTIVE"` |
| Trusting RevenueCat callback directly | Wait for cards to appear via API |
| Keeping card state across rooms | Always fetch fresh per room |

---

## 11. HTTP Error Reference

| HTTP | Meaning | Show user |
|:--|:--|:--|
| 401 | Token expired | Redirect to login |
| 403 | Not in active room | "Join a room to buy cards" |
| 409 | Card already played | "Already played" badge |
| 410 | Card expired | Grey out card |
| 429 | Rate limited | "Please wait 15 minutes" |
| 500 | Server error | "Try again later" |
