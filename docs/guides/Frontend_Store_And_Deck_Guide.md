# EleVora — Advanced Frontend Guide: Store & User Deck
**Version:** Phase 4 | Option B Room-Only Economy
**Level:** Advanced — React Native / Flutter
**Base URL:** `https://54.91.119.137/api/v1`

---

## Table of Contents

1. [Economy Architecture (Read First)](#1-economy-architecture)
2. [Authentication & Token Management](#2-authentication)
3. [Store Screen — Architecture & Implementation](#3-store-screen)
4. [Room State Management Before Purchase](#4-room-state)
5. [User Deck Screen — Full Implementation](#5-user-deck-screen)
6. [Available Cards — Room-Scoped Picker](#6-available-cards)
7. [Playing a Card — Full Flow](#7-playing-a-card)
8. [Purchase History Screen](#8-purchase-history)
9. [State Management Design](#9-state-management)
10. [Real-Time Updates via Socket.io](#10-realtime-updates)
11. [UI Component Patterns](#11-ui-patterns)
12. [Error Handling Strategy](#12-error-handling)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Economy Architecture

### The Room-Only Economy Model

Every card in EleVora is born and dies within a single room session. This is not a wallet system — it is a session economy.

```
┌──────────────────────────────────────────────────────────┐
│              CARD LIFECYCLE                              │
│                                                          │
│  Room Created                                            │
│       │                                                  │
│       ▼                                                  │
│  Room ACTIVE ──► User buys bundle                        │
│                       │                                  │
│                       ▼                                  │
│              Cards created in DB                         │
│              room_id stamped on each card                │
│                       │                                  │
│              ┌────────┴────────┐                         │
│              ▼                 ▼                         │
│         Card PLAYED       Card NOT played                │
│         (is_used=TRUE)    (is_used=FALSE)                │
│              │                 │                         │
│              └────────┬────────┘                         │
│                       │                                  │
│              Room ENDS (COMPLETED/EXPIRED)               │
│                       │                                  │
│                       ▼                                  │
│         DB Trigger fires automatically                   │
│         ALL cards → expired=TRUE, is_visible=FALSE       │
│         (played AND unplayed — both destroyed)           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Frontend implications of this model:**

| Scenario | What to do |
|:--|:--|
| User opens app fresh | Do NOT load old cards — they may be expired |
| User joins a new room | Always fetch cards fresh for that room |
| Room ends while user is on deck screen | Clear deck state, show "Room ended" |
| User buys more cards mid-game | Append new cards to existing deck state |
| App comes back from background | Refresh available cards — room may have ended |

---

## 2. Authentication

### Token Storage Strategy

```javascript
// React Native — use react-native-keychain or expo-secure-store
import * as SecureStore from 'expo-secure-store';

// After login/signup:
const saveTokens = async (accessToken, refreshToken, userId) => {
  await SecureStore.setItemAsync('accessToken', accessToken);
  await SecureStore.setItemAsync('refreshToken', refreshToken);
  await SecureStore.setItemAsync('userId', userId);
};

// Create an axios instance with auto-injection
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://54.91.119.137/api/v1',
  timeout: 10000,
});

// Interceptor — auto-attach token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Interceptor — handle 401 globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired — clear storage and redirect to login
      await SecureStore.deleteItemAsync('accessToken');
      navigationRef.navigate('Login');
    }
    return Promise.reject(error);
  }
);
```

---

## 3. Store Screen

### Data Fetching

```javascript
// GET /store/bundles
const fetchBundles = async () => {
  try {
    setLoading(true);
    const res = await api.get('/store/bundles');
    setBundles(res.data.data.bundles);
  } catch (err) {
    handleApiError(err);
  } finally {
    setLoading(false);
  }
};

// GET /store/bundles/:id  (detail screen)
const fetchBundleDetail = async (bundleId) => {
  const res = await api.get(`/store/bundles/${bundleId}`);
  return res.data.data.bundle;
};
```

### Response Shape

```json
{
  "data": {
    "bundles": [
      {
        "id": "bundle-uuid",
        "name": "Romance Pack",
        "description": "Romantic couple cards",
        "cover_image_url": "https://...",
        "is_active": true,
        "plans": [
          {
            "id": "plan-uuid",
            "name": "Starter",
            "price": 10.00,
            "card_count": 5,
            "store_product_id": "elevora.romancepack.starter"
          }
        ],
        "total_cards": 25,
        "sample_cards": [
          { "name": "Moonlight Walk", "card_type": "ACTION" }
        ]
      }
    ]
  }
}
```

### Field Usage Map

| API Field | UI Element | Notes |
|:--|:--|:--|
| `name` | Bundle title text | Show bold |
| `cover_image_url` | Thumbnail image | Use placeholder if null |
| `description` | Subtitle text | Truncate to 2 lines |
| `plans[0].price` | "₹10" price chip | Format with currency symbol |
| `plans[0].card_count` | "5 Cards" label | Show below price |
| `plans[0].store_product_id` | Passed to RevenueCat | Store in state for purchase |
| `total_cards` | "From 25 unique cards" | Shown on detail screen |
| `sample_cards` | Preview card names | Show 3 chips max |

### Bundle Card Component Pattern

```jsx
const BundleCard = ({ bundle, isInRoom, onBuyPress }) => {
  const plan = bundle.plans[0];

  return (
    <View style={styles.card}>
      <Image source={{ uri: bundle.cover_image_url }} style={styles.thumbnail} />
      <Text style={styles.title}>{bundle.name}</Text>
      <Text style={styles.desc}>{bundle.description}</Text>
      <View style={styles.row}>
        <Text style={styles.price}>₹{plan.price}</Text>
        <Text style={styles.count}>{plan.card_count} Cards</Text>
      </View>

      {/* Sample card previews */}
      <View style={styles.chips}>
        {bundle.sample_cards.slice(0, 3).map(c => (
          <Chip key={c.name} label={c.name} />
        ))}
      </View>

      {/* Buy button — disabled outside room */}
      <TouchableOpacity
        style={[styles.buyBtn, !isInRoom && styles.buyBtnDisabled]}
        onPress={() => isInRoom ? onBuyPress(plan.store_product_id) : showRoomRequiredToast()}
        disabled={!isInRoom}
      >
        <Text>{isInRoom ? `Buy for ₹${plan.price}` : 'Join a room to buy'}</Text>
      </TouchableOpacity>
    </View>
  );
};
```

### Caching Strategy

```javascript
// Cache store data for 5 minutes to avoid re-fetching
const CACHE_TTL = 5 * 60 * 1000;
let bundleCache = { data: null, fetchedAt: null };

const getBundles = async (forceRefresh = false) => {
  const now = Date.now();
  const cacheValid = bundleCache.data &&
    (now - bundleCache.fetchedAt) < CACHE_TTL;

  if (cacheValid && !forceRefresh) return bundleCache.data;

  const res = await api.get('/store/bundles');
  bundleCache = { data: res.data.data.bundles, fetchedAt: now };
  return bundleCache.data;
};
```

---

## 4. Room State Management

The most critical piece of state in the app is whether the user is currently inside an ACTIVE room.

### Room State Shape

```javascript
// Store this in your global state (Redux / Zustand / Context)
const initialRoomState = {
  roomId:   null,      // string UUID or null
  roomCode: null,      // "ELV-ABC123" or null
  status:   null,      // "WAITING" | "ACTIVE" | "COMPLETED" | "EXPIRED" | null
  partnerId: null,
};

// Computed helper
const isInActiveRoom = (roomState) =>
  roomState.status === 'ACTIVE' && roomState.roomId !== null;
```

### Set Room After Create/Join

```javascript
// After POST /rooms/create or POST /rooms/join:
const handleRoomJoined = (roomData) => {
  setRoomState({
    roomId:   roomData.room.id,
    roomCode: roomData.room.code,
    status:   roomData.room.status,
  });

  // If ACTIVE, clear any old deck state immediately
  if (roomData.room.status === 'ACTIVE') {
    clearDeckState();
  }
};

// After room ends (Socket event or polling):
const handleRoomEnded = () => {
  setRoomState(initialRoomState);
  clearDeckState();
  showToast('Game over! All cards have been cleared.');
};
```

### Checking Room Status Before Purchase

```javascript
const onBuyPress = (storeProductId) => {
  if (!isInActiveRoom(roomState)) {
    Alert.alert(
      'Room Required',
      'You must be inside an active game room to purchase cards. Create or join a room first.',
      [{ text: 'OK' }]
    );
    return;
  }
  // Proceed to RevenueCat purchase
  triggerPurchase(storeProductId);
};
```

---

## 5. User Deck Screen

### API Call

```
GET /user/deck
Authorization: Bearer <accessToken>
```

### Full Response

```json
{
  "data": {
    "total": 5,
    "cards": [
      {
        "deck_card_id": "beadb863-7a87-4cd4-9d94-ce82de4b66da",
        "card_id": "shared-card-template-uuid",
        "card_name": "Moonlight Walk",
        "card_type": "ACTION",
        "power_description": "Take a moonlit walk with your partner tonight",
        "category_name": "Romance",
        "category_color": "#FF6B6B",
        "room_id": "84c962cf-...",
        "is_used": false,
        "expired": false,
        "is_visible": true,
        "acquired_at": "2026-05-22T08:30:00Z",
        "used_at": null
      }
    ]
  }
}
```

### Critical Field Notes

| Field | Type | Usage |
|:--|:--|:--|
| `deck_card_id` | UUID | **Use this for play card API** — NOT `card_id` |
| `card_id` | UUID | Shared template ID — same card can exist in multiple decks |
| `is_used` | boolean | Show "✓ Played" overlay |
| `expired` | boolean | Show greyed/expired state |
| `room_id` | UUID | Which room this card belongs to |
| `acquired_at` | ISO datetime | Sort by this descending (newest first) |

### Implementation

```javascript
const fetchUserDeck = async () => {
  const res = await api.get('/user/deck');
  const cards = res.data.data.cards;

  // Separate into played and unplayed for UI
  const unplayed = cards.filter(c => !c.is_used && !c.expired);
  const played   = cards.filter(c => c.is_used);
  const expired  = cards.filter(c => c.expired && !c.is_used);

  setDeckState({ all: cards, unplayed, played, expired });
};
```

### Deck Card Component

```jsx
const DeckCardItem = ({ card }) => {
  const statusBadge = card.is_used
    ? { label: '✓ Played', color: '#22C55E' }
    : card.expired
    ? { label: 'Expired', color: '#6B7280' }
    : { label: 'Ready', color: '#7C3AED' };

  return (
    <View style={[styles.card, card.expired && styles.cardExpired]}>
      <View style={[styles.badge, { backgroundColor: statusBadge.color }]}>
        <Text style={styles.badgeText}>{statusBadge.label}</Text>
      </View>
      <Text style={styles.cardName}>{card.card_name}</Text>
      <Text style={styles.cardDesc}>{card.power_description}</Text>
      <Text style={styles.category}>{card.category_name}</Text>
      {card.used_at && (
        <Text style={styles.usedAt}>
          Played at {new Date(card.used_at).toLocaleTimeString()}
        </Text>
      )}
    </View>
  );
};
```

---

## 6. Available Cards — Room-Scoped Picker

This is the most important screen. It shows cards the user can still play in the current room.

### API Call

```
GET /user/deck/available?room_id=<roomId>
Authorization: Bearer <accessToken>
```

> ⚠️ Missing `room_id` → 400 error. Always include it.

### When to Call This

- After joining a room (to check if user already has cards)
- After a successful purchase (to show new cards)
- When the user opens the card picker during a game
- After app comes back from background (refresh to catch expiry)

### Implementation

```javascript
const fetchAvailableCards = async (roomId) => {
  if (!roomId) return;
  try {
    const res = await api.get(`/user/deck/available?room_id=${roomId}`);
    setAvailableCards(res.data.data.cards);
  } catch (err) {
    if (err.response?.status === 400) {
      // room_id missing — coding error
      console.error('room_id not passed to fetchAvailableCards');
    }
  }
};
```

### Response

```json
{
  "data": {
    "total": 4,
    "cards": [
      {
        "deck_card_id": "beadb863-...",
        "card_name": "Moonlight Walk",
        "power_description": "Take a moonlit walk together tonight",
        "category_name": "Romance",
        "category_color": "#FF6B6B",
        "is_used": false,
        "expired": false
      }
    ]
  }
}
```

### Zero Cards State

```jsx
const EmptyDeckView = ({ isInRoom, onBuyPress }) => (
  <View style={styles.empty}>
    {isInRoom ? (
      <>
        <Text style={styles.emptyTitle}>No cards yet</Text>
        <Text style={styles.emptyDesc}>
          Buy a bundle to get cards for this game session
        </Text>
        <Button title="Browse Store" onPress={onBuyPress} />
      </>
    ) : (
      <Text style={styles.emptyTitle}>Join a room to start playing</Text>
    )}
  </View>
);
```

---

## 7. Playing a Card

### API Call

```
POST /user/deck/<deck_card_id>/use
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "room_id": "84c962cf-05d8-4cc3-bcad-195eacd2eeb8"
}
```

> ⚠️ Use `deck_card_id` (from deck response). Never use `card_id`.

### Implementation

```javascript
const playCard = async (deckCardId, roomId) => {
  // Optimistic update — immediately hide the card from picker
  setAvailableCards(prev => prev.filter(c => c.deck_card_id !== deckCardId));

  try {
    const res = await api.post(`/user/deck/${deckCardId}/use`, { room_id: roomId });
    const playedCard = res.data.data.card;

    // Update full deck state
    setDeckState(prev => ({
      ...prev,
      all: prev.all.map(c =>
        c.deck_card_id === deckCardId
          ? { ...c, is_used: true, used_at: playedCard.used_at }
          : c
      ),
    }));

    // Emit to partner via socket
    socket.emit('card_played', {
      room_id: roomId,
      card_name: playedCard.card_name,
      power_description: playedCard.power_description,
    });

  } catch (err) {
    // Rollback optimistic update on error
    await fetchAvailableCards(roomId);

    const status = err.response?.status;
    if (status === 409) showToast('This card was already played');
    else if (status === 410) showToast('This card has expired');
    else if (status === 403) showToast('This card does not belong to you');
    else showToast('Failed to play card, please try again');
  }
};
```

### Error Codes

| HTTP | Message | Cause | UI Action |
|:--|:--|:--|:--|
| 403 | Card does not belong to you | Wrong user token | Show error toast |
| 404 | Card not found | Wrong `deck_card_id` | Log error, refresh deck |
| 409 | Already played | Card already used | Show "Already played" |
| 410 | Card expired | Room ended | Refresh room state |
| 500 | Server error | Backend issue | Retry button |

---

## 8. Purchase History Screen

```
GET /store/purchase/history
Authorization: Bearer <accessToken>
```

```json
{
  "data": {
    "purchases": [
      {
        "id": "purchase-uuid",
        "bundle_name": "Romance Pack",
        "plan_name": "Starter",
        "cards_received": 5,
        "amount_paid": 10.00,
        "currency": "INR",
        "platform": "android",
        "status": "completed",
        "created_at": "2026-05-22T08:30:00Z"
      }
    ]
  }
}
```

**Status values:**

| Status | Meaning | UI |
|:--|:--|:--|
| `completed` | Cards delivered | Green checkmark |
| `pending` | Processing | Spinner |
| `refunded` | Money returned | Grey "Refunded" badge |

---

## 9. State Management Design

### Recommended Global State Shape

```javascript
const appState = {
  // Auth
  auth: {
    accessToken: null,
    userId: null,
    isLoggedIn: false,
  },

  // Current room session
  room: {
    roomId: null,
    roomCode: null,
    status: null,       // WAITING | ACTIVE | COMPLETED | EXPIRED
    partnerId: null,
    expiresAt: null,
  },

  // Card deck — scoped to current room
  deck: {
    all: [],            // All cards (full deck view)
    available: [],      // Unplayed cards for current room
    isLoading: false,
    lastFetchedAt: null,
  },

  // Store
  store: {
    bundles: [],
    isLoading: false,
    lastFetchedAt: null,
  },

  // Purchase
  purchase: {
    isPurchasing: false,
    history: [],
  },
};
```

### When to Clear Deck State

```javascript
// Clear deck when:
// 1. User leaves a room
// 2. Room expires
// 3. User logs out

const clearDeckState = () => {
  setDeck({ all: [], available: [], isLoading: false, lastFetchedAt: null });
};

// Listen for room status changes
useEffect(() => {
  if (room.status === 'COMPLETED' || room.status === 'EXPIRED') {
    clearDeckState();
    setRoom(initialRoomState);
    showModal('Room Ended', 'All cards from this session have been cleared.');
  }
}, [room.status]);
```

---

## 10. Real-Time Updates via Socket.io

### Connect After Login

```javascript
import { io } from 'socket.io-client';

let socket = null;

const connectSocket = (accessToken) => {
  socket = io('https://54.91.119.137', {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.warn('Socket disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('Socket error:', err.message);
  });
};
```

### Events to Listen For

```javascript
// Partner joined room
socket.on('partner_joined', ({ partnerId }) => {
  setRoom(prev => ({ ...prev, partnerId, status: 'ACTIVE' }));
  showToast('Partner joined! Room is now active.');
});

// Room ended
socket.on('room_ended', ({ reason }) => {
  handleRoomEnded();
  showModal('Room Ended', reason || 'The game session has ended.');
});

// Cards granted (after purchase)
socket.on('cards_granted', ({ cards_count, room_id }) => {
  if (room_id === roomState.roomId) {
    fetchAvailableCards(room_id);  // Refresh card picker
    showToast(`${cards_count} new cards added to your deck!`);
  }
});

// Partner played a card
socket.on('card_played', ({ card_name, power_description }) => {
  showCardRevealModal({ card_name, power_description });
});
```

---

## 11. UI Component Patterns

### App Background Refresh

```javascript
// When app comes back to foreground, refresh critical state
import { AppState } from 'react-native';

useEffect(() => {
  const subscription = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active' && roomState.roomId) {
      // Refresh room status — it may have expired while app was backgrounded
      refreshRoomStatus(roomState.roomId);
      fetchAvailableCards(roomState.roomId);
    }
  });
  return () => subscription.remove();
}, [roomState.roomId]);
```

### Pull-to-Refresh Pattern

```jsx
<FlatList
  data={availableCards}
  refreshControl={
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={async () => {
        setIsRefreshing(true);
        await fetchAvailableCards(roomState.roomId);
        setIsRefreshing(false);
      }}
    />
  }
  renderItem={({ item }) => <CardItem card={item} onPlay={playCard} />}
  ListEmptyComponent={<EmptyDeckView isInRoom={isInActiveRoom(roomState)} />}
/>
```

---

## 12. Error Handling Strategy

### Central Error Handler

```javascript
const handleApiError = (error, context = '') => {
  const status = error.response?.status;
  const message = error.response?.data?.message || 'Something went wrong';

  switch (status) {
    case 400:
      showToast(`Invalid request: ${message}`);
      break;
    case 401:
      // Token expired — interceptor handles redirect
      break;
    case 403:
      if (message.includes('room')) {
        showModal('Room Required', 'You must be in an active game room.');
      } else {
        showToast('Permission denied');
      }
      break;
    case 404:
      showToast('Item not found');
      break;
    case 409:
      showToast('Already done');
      break;
    case 410:
      showToast('Card expired — room may have ended');
      refreshRoomStatus();
      break;
    case 429:
      showToast('Too many requests — please wait 15 minutes');
      break;
    case 500:
      showToast('Server error — please try again later');
      break;
    default:
      if (!error.response) {
        showToast('No internet connection');
      }
  }
};
```

---

## 13. Troubleshooting

### Cards not appearing after purchase
1. Was user in an ACTIVE room when payment completed? (403 = no room)
2. Check: `GET /user/deck/available?room_id=<id>` — are cards there?
3. Confirm webhook fired: check RevenueCat Dashboard → Webhook Logs
4. Check backend logs via SSH: `pm2 logs elevora-backend`

### "room_id is required" (400) on available cards
You called `GET /user/deck/available` without `?room_id=`. Always pass it.

### Card play fails with 404
You used `card_id` instead of `deck_card_id`. Use the `deck_card_id` field.

### Deck shows cards from old room
You did not clear deck state when room ended. Call `clearDeckState()` when `room.status` changes to `COMPLETED` or `EXPIRED`.

### Store shows no bundles
All bundles may be inactive. Admin must activate them in the dashboard. The `GET /store/bundles` only returns `is_active: true` bundles.

### Socket events not received
Confirm `auth: { token: accessToken }` is passed when creating the socket. The backend rejects unauthenticated socket connections.

---

## Quick Reference

```
INITIAL LOAD:
  Login → store accessToken + userId
  → configureRevenueCat(userId)
  → connectSocket(accessToken)
  → GET /store/bundles (cache 5min)

ROOM FLOW:
  POST /rooms/create or /rooms/join
  → store roomId + status
  → clearDeckState()
  → GET /user/deck/available?room_id=...

PURCHASE FLOW:
  Check isInActiveRoom()
  → triggerPurchase(storeProductId)  [see Payment Gateway Guide]
  → webhook fires server-side
  → socket 'cards_granted' OR poll /user/deck/available

PLAY FLOW:
  Optimistic UI update
  → POST /user/deck/:deck_card_id/use { room_id }
  → emit 'card_played' to partner via socket

ROOM END:
  socket 'room_ended' event
  → clearDeckState()
  → setRoom(null)
  → show "Room ended" modal
```
