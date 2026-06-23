# Frontend Developer Guide: Master Deck Automated Grants 🎴

This document explains the "Free Cards" system. In EleVora, users no longer need to manually click a "Claim Free Cards" button or call a specific API to get their initial decks. **The backend handles it 100% automatically.**

## How It Works

The moment a room becomes `ACTIVE` (which happens exactly when the partner successfully joins the room via `POST /api/v1/rooms/join`), the backend intercepts the request and instantly injects the correct number of free cards into BOTH users' decks based on the room's plan type.

### The Two Plans
1. **7-Day Room (Free Plan)**
   * Both users automatically receive **7 regular cards** from the 7-Day Master Deck.
   * *No deflect cards are given.*
   
2. **30-Day Room (Paid Plan)**
   * Both users automatically receive **30 regular cards** from the 30-Day Master Deck.
   * Both users automatically receive **5 Deflect Cards**.

## What The Frontend Needs To Do

**Absolutely nothing extra.** 

You do not need to call a new API endpoint. You just follow the standard room join and deck fetching flow:

1. User A creates room (`POST /rooms/create`).
2. User B joins room (`POST /rooms/join`).
3. App navigates to the Game Screen.
4. App calls `GET /api/v1/user/deck/available?room_id=<id>`.
   * *Magic! The 7 or 30 free cards are already there.*
5. App calls `GET /api/v1/user/deck/deflect-cards?room_id=<id>` (if it's a 30-day room).
   * *Magic! The 5 deflect cards are already there.*

## Card Distribution Algorithm (For Your Information)
If the user asks how the cards are selected, the backend uses an **80/20 Fisher-Yates distribution algorithm**:
* **80%** of the free cards given to the user will be cards they have *never seen before* in any previous room.
* **20%** of the cards will be repeats of cards they have seen before (to keep favorite cards in rotation).
* If the user plays the game so much that they exhaust the entire admin master deck pool, it degrades gracefully to 100% repeats.

## Summary Checklist for Frontend
- [ ] Ensure that immediately after a successful `POST /rooms/join`, the app navigates to the game board and calls the `GET /user/deck/available` endpoint to render the cards.
- [ ] Remember to pass `room_id` in the query parameters for all deck-related calls!
