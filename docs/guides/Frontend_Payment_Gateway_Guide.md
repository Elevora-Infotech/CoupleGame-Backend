# EleVora — Payment Gateway Integration Guide
**Advanced Level | Frontend Developer Reference**
**Version:** Phase 4 | RevenueCat + Apple Pay + Google Pay

---

## Table of Contents

1. [Architecture Overview — How Payments Work](#1-architecture-overview)
2. [RevenueCat — What It Is and Why We Use It](#2-revenuecat-explained)
3. [Step-by-Step SDK Setup](#3-sdk-setup)
4. [Configuring Products in RevenueCat Dashboard](#4-configuring-products)
5. [Triggering a Purchase (Code)](#5-triggering-a-purchase)
6. [What Happens After Payment — The Webhook Flow](#6-webhook-flow)
7. [How to Know When Cards Arrive](#7-how-to-know-when-cards-arrive)
8. [Handling All Purchase Outcomes](#8-handling-all-outcomes)
9. [Restoring Purchases](#9-restoring-purchases)
10. [Testing Payments Without Real Money](#10-testing-payments)
11. [Security Rules — What You Must Never Do](#11-security-rules)
12. [Troubleshooting Common Issues](#12-troubleshooting)

---

## 1. Architecture Overview

Here is the complete, exact flow of a payment from tap to cards appearing on screen:

```
┌─────────────────────────────────────────────────────────────┐
│                     PAYMENT FLOW                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. User taps "Buy" inside the room screen                  │
│                    ↓                                        │
│  2. Your app calls RevenueCat SDK .purchase(package)        │
│                    ↓                                        │
│  3. RevenueCat shows Apple Pay / Google Pay native sheet     │
│                    ↓                                        │
│  4. User confirms payment with Face ID / fingerprint        │
│                    ↓                                        │
│  5. Apple/Google confirms payment to RevenueCat             │
│                    ↓                                        │
│  6. RevenueCat sends a webhook to our backend               │
│     POST https://our-server/api/v1/store/purchase/verify    │
│                    ↓                                        │
│  7. Backend validates:                                      │
│     a) Webhook secret is correct                            │
│     b) User is inside an ACTIVE room                        │
│     c) Product ID exists in our system                      │
│     d) Transaction ID not already processed (idempotency)   │
│                    ↓                                        │
│  8. Backend runs 80/20 algorithm → creates cards            │
│     Cards are stamped with room_id immediately              │
│                    ↓                                        │
│  9. Your app polls GET /user/deck/available?room_id=...     │
│     OR listens on Socket.io for a "cards_granted" event     │
│                    ↓                                        │
│ 10. Cards appear on the user's screen                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** Your app does NOT directly give cards to the user. Your app only triggers the payment. The backend gives the cards. This is by design — it prevents fraud.

---

## 2. RevenueCat Explained

**What is RevenueCat?**
RevenueCat is a payment middleware that sits between your app and Apple/Google payment systems. Instead of implementing Apple StoreKit and Google Play Billing separately (two completely different SDKs with different APIs), you implement RevenueCat once and it handles both.

**Why EleVora uses it:**

| Without RevenueCat | With RevenueCat |
|:--|:--|
| Two separate iOS + Android implementations | One unified SDK |
| You handle receipt validation yourself | RevenueCat validates receipts |
| You build subscription management | RevenueCat handles it |
| Hard to test | Sandbox testing built in |
| Manual webhook handling | Automatic webhook to your backend |

**RevenueCat's role in EleVora specifically:**
- Shows the correct native payment sheet
- Validates that Apple/Google actually received money
- Fires a webhook to our backend with `app_user_id` (= EleVora `user.id`)
- Our backend uses this webhook to give cards

---

## 3. SDK Setup

### React Native

```bash
npm install react-native-purchases
# iOS
cd ios && pod install
```

**Initialize in your app entry point (App.js or equivalent):**
```javascript
import Purchases from 'react-native-purchases';

// Call this ONCE when the app starts, after the user logs in
async function configureRevenueCat(userId) {
  // Use the correct API key for each platform
  const apiKey = Platform.OS === 'ios'
    ? 'appl_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'   // Your iOS key from RevenueCat dashboard
    : 'goog_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';  // Your Android key

  await Purchases.configure({
    apiKey,
    appUserID: userId,   // ← This is the EleVora user.id from your login response
  });

  console.log('RevenueCat configured for user:', userId);
}
```

> ⚠️ **Critical:** `appUserID` MUST be the EleVora `user.id` (UUID) from our backend. This is how our backend knows which user paid. Do NOT use email, device ID, or any other value.

### Flutter

```yaml
# pubspec.yaml
dependencies:
  purchases_flutter: ^6.0.0
```

```dart
import 'package:purchases_flutter/purchases_flutter.dart';

Future<void> configureRevenueCat(String userId) async {
  final config = PurchasesConfiguration(
    Platform.isIOS
      ? 'appl_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      : 'goog_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  )..appUserID = userId;   // ← EleVora user.id

  await Purchases.configure(config);
}
```

### When to call configure:
- Call it **immediately after a successful login or signup**
- Call it again if the user logs out and a different user logs in (with the new user's ID)
- Do NOT call it before login (no user ID available yet)

---

## 4. Configuring Products

Products are already configured on our backend using the `store_product_id` format:
```
elevora.<bundlename>.<planname>
Example: elevora.romancepack.starter
```

This `store_product_id` must ALSO be registered in:
1. **Apple App Store Connect** → your app → In-App Purchases
2. **Google Play Console** → your app → In-App Products
3. **RevenueCat Dashboard** → your project → Products

**Getting the product IDs from the backend:**
```
GET /store/bundles
```
Each plan inside a bundle has a `store_product_id` field. Use this exact string when registering in App Store Connect / Play Console / RevenueCat.

**RevenueCat Entitlements (important concept):**

In RevenueCat, create one Entitlement called `cards` and attach all your products to it. EleVora uses non-renewing purchases (one-time), not subscriptions.

```
RevenueCat Dashboard
  └── Entitlements
        └── cards
              ├── elevora.romancepack.starter
              ├── elevora.adventurepack.starter
              └── ... (add all plan product IDs here)
```

---

## 5. Triggering a Purchase

This is the code you call when the user taps "Buy" on a bundle plan.

### React Native

```javascript
import Purchases from 'react-native-purchases';

async function purchaseBundle(storeProductId) {
  // Step 1: Check user is in an active room first
  if (!currentRoomId || roomStatus !== 'ACTIVE') {
    Alert.alert('Join a Room First', 'You need to be in an active game room to buy cards.');
    return;
  }

  try {
    // Step 2: Fetch available packages from RevenueCat
    const offerings = await Purchases.getOfferings();

    // Find the specific package by productIdentifier
    let targetPackage = null;
    const allPackages = Object.values(offerings.all)
      .flatMap(offering => offering.availablePackages);

    targetPackage = allPackages.find(
      pkg => pkg.product.identifier === storeProductId
    );

    if (!targetPackage) {
      Alert.alert('Product Not Available', 'This bundle is currently unavailable.');
      return;
    }

    // Step 3: Show loading indicator
    setIsPurchasing(true);

    // Step 4: Trigger the payment sheet (Apple Pay / Google Pay)
    const { customerInfo } = await Purchases.purchasePackage(targetPackage);

    // Step 5: Payment succeeded on Apple/Google side
    // RevenueCat will NOW fire the webhook to our backend
    // Your app should now poll for cards or listen to socket events
    console.log('Payment accepted. Waiting for cards from server...');
    await pollForNewCards();

  } catch (error) {
    if (!error.userCancelled) {
      // User cancelled — no error to show
      Alert.alert('Payment Failed', error.message || 'Please try again.');
    }
  } finally {
    setIsPurchasing(false);
  }
}
```

### Flutter

```dart
import 'package:purchases_flutter/purchases_flutter.dart';

Future<void> purchaseBundle(String storeProductId) async {
  // Check room is active
  if (currentRoomId == null || roomStatus != 'ACTIVE') {
    showDialog(context: context, builder: (_) =>
      AlertDialog(title: Text('Join a Room First'),
        content: Text('You need an active game room to buy cards.')));
    return;
  }

  try {
    setState(() => isPurchasing = true);

    // Get offerings
    Offerings offerings = await Purchases.getOfferings();

    // Find the package
    Package? targetPackage;
    for (var offering in offerings.all.values) {
      targetPackage = offering.availablePackages.firstWhere(
        (pkg) => pkg.storeProduct.identifier == storeProductId,
        orElse: () => null,
      );
      if (targetPackage != null) break;
    }

    if (targetPackage == null) {
      // Product not found in RevenueCat
      return;
    }

    // Trigger purchase
    CustomerInfo customerInfo = await Purchases.purchasePackage(targetPackage);

    // Payment done — backend webhook will fire now
    // Poll for new cards
    await pollForNewCards();

  } on PurchasesErrorCode catch (e) {
    if (e != PurchasesErrorCode.purchaseCancelledError) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Payment failed: ${e.message}')));
    }
  } finally {
    setState(() => isPurchasing = false);
  }
}
```

---

## 6. Webhook Flow

After the user pays, RevenueCat sends a POST request to our backend:

```
POST /api/v1/store/purchase/verify
Authorization: Bearer elevora_test_webhook_secret_2026
Content-Type: application/json

{
  "type": "NON_RENEWING_PURCHASE",
  "event": {
    "app_user_id": "user-uuid-from-your-system",
    "product_id": "elevora.romancepack.starter",
    "transaction_id": "unique-transaction-id",
    "store": "APPLE_STORE",
    "price": 10.00,
    "currency": "INR"
  }
}
```

**What our backend does with this:**
1. Validates the webhook secret
2. Checks `app_user_id` is in an ACTIVE room
3. Looks up the `product_id` in our `store_products` table
4. Checks `transaction_id` is not a duplicate (idempotency)
5. Runs the 80/20 card selection algorithm
6. Inserts cards into `user_card_deck` with `room_id` stamped
7. Marks purchase as `completed`

**This entire process is handled server-to-server. Your app does not need to call any extra endpoint.**

---

## 7. How to Know When Cards Arrive

Since cards are created server-side, your app needs a way to know when they are ready. Use one of these two methods:

### Method 1 — Polling (Simpler, recommended for MVP)

After `Purchases.purchasePackage` succeeds, start polling:

```javascript
async function pollForNewCards() {
  const MAX_ATTEMPTS = 10;
  const INTERVAL_MS  = 2000; // check every 2 seconds

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await sleep(INTERVAL_MS);

    const response = await fetch(
      `${BASE_URL}/user/deck/available?room_id=${currentRoomId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await response.json();

    if (data.data.total > 0) {
      // Cards have arrived!
      setAvailableCards(data.data.cards);
      showSuccessAnimation();
      return;
    }
  }

  // After 10 attempts (20 seconds), show error
  Alert.alert('Cards Delayed', 'Your cards are being processed. Check again in a moment.');
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
```

### Method 2 — Socket.io Event (Better UX, real-time)

If your backend emits a `cards_granted` socket event, listen for it:

```javascript
socket.on('cards_granted', (payload) => {
  // payload = { cards_count: 5, room_id: '...' }
  if (payload.room_id === currentRoomId) {
    // Fetch the new cards
    fetchAvailableCards(currentRoomId);
    showSuccessAnimation();
  }
});
```

> Note: Ask the backend developer if the `cards_granted` socket event is implemented.

---

## 8. Handling All Purchase Outcomes

Handle every possible state so users always know what happened:

```javascript
// States your UI must handle:

const PURCHASE_STATES = {
  IDLE:       'idle',        // Nothing happening
  LOADING:    'loading',     // Payment sheet is open
  SUCCESS:    'success',     // Payment done, cards arriving
  CANCELLED:  'cancelled',   // User cancelled (no error to show)
  FAILED:     'failed',      // Payment failed
  NO_ROOM:    'no_room',     // User not in a room
  PROCESSING: 'processing',  // Payment done, waiting for cards
};

// What to show for each state:
switch (purchaseState) {
  case 'idle':
    return <BuyButton onPress={startPurchase} />;

  case 'loading':
    return <ActivityIndicator text="Opening payment..." />;

  case 'processing':
    return <ActivityIndicator text="Setting up your cards..." />;

  case 'success':
    return <SuccessAnimation text="5 cards added to your deck!" />;

  case 'cancelled':
    return <BuyButton onPress={startPurchase} />;  // Just reset, no error

  case 'failed':
    return <ErrorMessage text="Payment failed. Please try again." retry={startPurchase} />;

  case 'no_room':
    return <DisabledButton text="Join a room to buy cards" />;
}
```

---

## 9. Restoring Purchases

If a user reinstalls the app, they may have made purchases before. RevenueCat can restore them.

> ⚠️ For EleVora's Room-Only Economy, restoring purchases does NOT give back expired room cards. Cards are permanently destroyed when rooms end. Restoration is only meaningful if the user reinstalls mid-session.

```javascript
async function restorePurchases() {
  try {
    const customerInfo = await Purchases.restorePurchases();
    // Check if they have active entitlements
    if (customerInfo.entitlements.active['cards']) {
      console.log('Restored active purchase');
    }
  } catch (error) {
    console.error('Restore failed:', error);
  }
}
```

---

## 10. Testing Payments Without Real Money

### Sandbox Testing (Recommended)

**iOS Sandbox:**
1. In App Store Connect → create a Sandbox Tester account
2. On device: Settings → App Store → Sandbox Account → sign in with sandbox email
3. All purchases in sandbox are free and immediate
4. RevenueCat will still fire webhooks to your backend

**Android Sandbox:**
1. In Google Play Console → add your test Gmail account as a License Tester
2. All purchases in testing are free
3. Use test card: `4242 4242 4242 4242`

**RevenueCat Sandbox vs Production:**
- RevenueCat automatically detects sandbox vs production
- Check RevenueCat Dashboard → Customer View to see all transactions

### Simulating the Webhook Directly (For Backend Testing Only)

```bash
# On the AWS server, simulate a RevenueCat webhook directly:
curl -X POST http://localhost:3000/api/v1/store/purchase/verify \
  -H "Authorization: Bearer elevora_test_webhook_secret_2026" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "NON_RENEWING_PURCHASE",
    "event": {
      "app_user_id": "<user-uuid>",
      "product_id": "elevora.romancepack.starter",
      "transaction_id": "TEST_TXN_001",
      "store": "PLAY_STORE",
      "price": 10.00,
      "currency": "INR"
    }
  }'
```

> This is for developer testing only. Never call this from the mobile app.

---

## 11. Security Rules

| ❌ NEVER do this | ✅ Always do this |
|:--|:--|
| Call `/store/purchase/verify` from the app | Let RevenueCat call it server-to-server |
| Store the webhook secret in the app | It lives only on the server `.env` |
| Trust `customerInfo` from RevenueCat as the source of truth for cards | Fetch cards from our own backend |
| Use device ID or email as `appUserID` | Use EleVora `user.id` (UUID) |
| Show cards before the server confirms | Wait for server confirmation |
| Call purchase outside a room | Always check `room.status === "ACTIVE"` first |

---

## 12. Troubleshooting Common Issues

### "Product not found" / Empty offerings

**Cause:** Product not registered in RevenueCat dashboard, OR not registered in App Store / Play Console yet.

**Fix:**
1. Go to RevenueCat Dashboard → Products → add the `store_product_id`
2. In App Store Connect → create the IAP product with the same ID
3. Wait 1-2 hours for App Store Connect to propagate
4. In Play Console → Monetize → In-app products → create with same ID

---

### Payment sheet doesn't open

**Cause:** No billing permissions, or RevenueCat not configured yet.

**Fix:**
```javascript
// Check RevenueCat is configured before calling purchase
const info = await Purchases.getCustomerInfo();
console.log('RevenueCat customer ID:', info.originalAppUserId);
// If this throws, RevenueCat is not configured — call configure() first
```

---

### Cards don't appear after successful payment

**Cause:** Webhook delay, or user left the room before webhook fired.

**Fix checklist:**
1. Check RevenueCat Dashboard → Webhooks → Delivery Logs — did it fire?
2. Check backend PM2 logs: `pm2 logs elevora-backend`
3. Was the user still in an ACTIVE room when the webhook fired?
4. Is the `store_product_id` registered in `store_products` table?

---

### "You must be in an active room" error (403)

**Cause:** The user's room expired, or they never joined a room.

**Fix on frontend:** Always check room status before allowing purchase. Show a clear message: *"Your game room has expired. Create a new room to buy cards."*

---

### RevenueCat `appUserID` mismatch

**Cause:** `appUserID` set to something other than the EleVora `user.id`.

**Fix:** After login, call:
```javascript
await Purchases.logIn(user.id);  // Force RevenueCat to use correct user ID
```

This also works if the user was previously anonymous.

---

## Quick Reference Card

```
SETUP FLOW:
  User logs in → Purchases.configure({ apiKey, appUserID: user.id })

PURCHASE FLOW:
  Check room.status === 'ACTIVE'
  → Purchases.getOfferings()
  → Find package by store_product_id
  → Purchases.purchasePackage(package)
  → Payment confirmed → RevenueCat fires webhook
  → Poll GET /user/deck/available?room_id=... until cards appear

PLAY FLOW:
  GET /user/deck/available?room_id=...
  → User picks card
  → POST /user/deck/:deck_card_id/use { room_id }
  → Card marked used, show to partner

ROOM ENDS:
  All cards auto-destroyed by database trigger
  → Fresh start for next room
```
