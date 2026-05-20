# ✅ EleVora — Client Confirmation Checklist (Phase 4)

> **Purpose:** Please review each item below and confirm ✅ or request a change ❌.  
> This list covers all open decisions for the Card Store + Purchase + Deck system.  
> Once confirmed, development begins immediately.

---

## Section A: Card Store (What User Sees)

| # | Topic | Current Plan | Status |
| :--- | :--- | :--- | :--- |
| A1 | **Bundle List** | User sees all active bundles with name, image, description, and pricing plans | ⬜ Confirm |
| A2 | **Bundle Detail** | User sees bundle info + pricing plans ONLY. Individual cards are **NOT shown** to user | ⬜ Confirm |
| A3 | **Show cards in future** | When client is ready, admin flips a switch per bundle to show cards. Zero code change needed | ⬜ Confirm |
| A4 | **Store access** | Only logged-in users can view the store (requires JWT) | ⬜ Confirm |

---

## Section B: Purchase & Card Selection

| # | Topic | Current Plan | Status |
| :--- | :--- | :--- | :--- |
| B1 | **Card ratio** | Always give exactly **80% new cards + 20% old cards** from the bundle pool | ⬜ Confirm |
| B2 | **"Old cards" definition** | Old = cards already present in user's deck (used OR unused) | ⬜ Confirm |
| B3 | **Bundle exhausted** | If user has used ALL cards from a bundle → give full repeats (no limit) | ⬜ Confirm |
| B4 | **Selection method** | Cards are selected **randomly** within each group (new/old). User cannot choose | ⬜ Confirm |
| B5 | **Plan card count** | Number of cards user receives = `card_count` set by admin on the pricing plan (e.g., ₹10 = 5 cards) | ⬜ Confirm |

---

## Section C: Card Lifecycle & Deck

| # | Topic | Current Plan | Status |
| :--- | :--- | :--- | :--- |
| C1 | **Card scope** | Cards are valid for **ONE room only**. After room ends, cards automatically expire | ⬜ Confirm |
| C2 | **Expiry trigger** | Cards expire when the room session ends (room status changes to `completed`/`expired`) | ⬜ Confirm |
| C3 | **Deck view** | User can see their active (unexpired) cards in "My Deck" screen before joining a room | ⬜ Confirm |
| C4 | **Used/expired visibility** | After a card is used in a room, it is **hidden** from the deck (not shown anymore) | ⬜ Confirm |
| C5 | **Multiple rooms** | If user has 10 cards, can they use different cards across multiple rooms simultaneously? | ⬜ Confirm |
| C6 | **Max deck size** | No limit — user can buy as many cards as they want | ⬜ Confirm |
| C7 | **Card sharing** | Cards are **personal** — only the purchasing user can use them, not their game partner | ⬜ Confirm |

---

## Section D: Room Integration

| # | Topic | Current Plan | Status |
| :--- | :--- | :--- | :--- |
| D1 | **Card selection in room** | Before game starts, user selects which cards from their deck to bring into the room | ⬜ Confirm |
| D2 | **Max cards per room** | Is there a limit to how many cards a user can bring into one room? (e.g., max 5 per room) | ⬜ Need Answer |
| D3 | **Partner sees card?** | When user plays a card, does the partner also see the card details? | ⬜ Need Answer |
| D4 | **Card play timing** | Can user play a card at any time during the game, or only at specific moments? | ⬜ Need Answer |

---

## Section E: Payment (In-App Purchase)

| # | Topic | Current Plan | Status |
| :--- | :--- | :--- | :--- |
| E1 | **Payment method** | Native In-App Purchase via Apple App Store (iOS) + Google Play (Android) | ⬜ Confirm |
| E2 | **Payment tool** | RevenueCat SDK (Free tier, takes 0% cut, handles both platforms) | ⬜ Confirm |
| E3 | **Store commission** | Apple/Google take 30% of each purchase (mandatory, no way around it) | ⬜ Confirm |
| E4 | **Currency** | INR (₹) | ⬜ Confirm |
| E5 | **Refund policy** | If user requests refund via App Store/Play Store, cards are revoked automatically | ⬜ Confirm |
| E6 | **Receipt** | No email receipt — App Store/Play Store sends receipt automatically | ⬜ Confirm |

---

## Section F: Future Features (Not Building Now — Just Confirm Direction)

| # | Topic | Future Plan | Status |
| :--- | :--- | :--- | :--- |
| F1 | **Show cards in bundle** | Admin can enable card display per bundle via a toggle | ⬜ Confirm Direction |
| F2 | **Card gifting** | User sends a card to their partner as a gift | ⬜ Confirm Direction |
| F3 | **Card expiry timer** | Instead of room-based expiry, cards expire after X days | ⬜ Confirm Direction |
| F4 | **Bundle subscription** | Monthly subscription = unlimited cards from a bundle | ⬜ Confirm Direction |
| F5 | **Web purchase** | Buy cards via website using Razorpay (for web version only) | ⬜ Confirm Direction |

---

## How to Respond

For each item, client can reply with:
- ✅ **Confirmed** — Build as planned
- ❌ **Change** — [describe what change needed]
- ⬜ **Need Discussion** — Schedule a call
