# 🛍️ Bundle Store — Frontend Developer Integration Guide

**Version:** 1.0.0  
**Base URL (Production):** `http://54.91.119.137:3000/api/v1`  
**Last Updated:** 2026-05-16  
**Scope:** All Bundle Store APIs (Admin Panel + User-Facing Store)

---

## 📖 Table of Contents

1. [Concept Overview — What Is a Bundle?](#1-concept-overview)
2. [Data Architecture — How Tables Relate](#2-data-architecture)
3. [Authentication](#3-authentication)
4. [User Store Flow](#4-user-store-flow)
5. [Admin Panel Flow](#5-admin-panel-flow)
6. [API Reference — User Store](#6-api-reference--user-store)
7. [API Reference — Admin Bundles](#7-api-reference--admin-bundles)
8. [API Reference — Admin Bundle Cards](#8-api-reference--admin-bundle-cards)
9. [API Reference — Admin Bundle Plans](#9-api-reference--admin-bundle-plans)
10. [TypeScript Interfaces](#10-typescript-interfaces)
11. [Axios Service Setup](#11-axios-service-setup)
12. [Screen-by-Screen Integration Map](#12-screen-by-screen-integration-map)
13. [Error Handling Patterns](#13-error-handling-patterns)

---

## 1. Concept Overview

The **Bundle Store** is a card purchasing system inside the EleVora app. Here is how it works end-to-end:

```
ADMIN CREATES              USER SEES               USER PICKS
─────────────              ─────────               ──────────
  Bundle                  Bundle List            One Bundle
  (container)       →     in the Store    →      + One Plan
                                                 (how many cards)
  + Adds Cards
  (from catalog)
                          Bundle Detail          User gets N cards
  + Adds Plans      →     (shows all      →      from the bundle's
  (pricing tiers)          cards + plans)         card pool
```

**Key Concepts:**
- A **Bundle** is a named container with a cover image.
- **Bundle Cards** = the pool of cards an admin put into that bundle. Can be 5 or 200 cards.
- **Bundle Plans** = pricing tiers. A user selects a plan to decide HOW MANY cards they get and at WHAT PRICE.
- A single bundle can have multiple plans (e.g., Starter ₹10 → 5 cards, Premium ₹50 → 35 cards).
- `total_cards` = how many cards are in the bundle pool.
- `card_count` in a plan = how many cards the user RECEIVES when they buy that plan.

---

## 2. Data Architecture

```
bundles
  ├── id, name, description, cover_image_url, is_active
  │
  ├── bundle_cards (junction table)
  │     ├── bundle_id  → bundles.id
  │     └── card_id    → cards.id (the full card catalog)
  │
  └── bundle_plans (pricing tiers)
        ├── bundle_id  → bundles.id
        ├── name       (e.g., "Starter", "Popular", "Premium")
        ├── price      (e.g., 10.00)
        └── card_count (how many cards user gets, e.g., 5)
```

> **Rule:** A card can belong to MANY bundles. A bundle can have MANY cards. This is a many-to-many relationship handled by `bundle_cards`.

---

## 3. Authentication

| Who | Token Type | How to Get It |
| :--- | :--- | :--- |
| Regular User | User JWT (`accessToken`) | `POST /auth/login` |
| Admin | Admin JWT (`token`) | `POST /admin/auth/login` |

**Attach token in every request header:**
```js
headers: {
  Authorization: `Bearer ${token}`
}
```

---

## 4. User Store Flow

This is the **exact screen-by-screen flow** for the mobile app store:

```
Screen 1: Store Home
  └── API: GET /store/bundles
  └── Shows: Bundle cards (name, image, price range, total cards)

         ↓ User taps a bundle

Screen 2: Bundle Detail
  └── API: GET /store/bundles/:id
  └── Shows: All cards in bundle + all pricing plans

         ↓ User selects a plan and taps "Buy"

Screen 3: Purchase (future)
  └── Payment API (not yet implemented)
```

### Flow Diagram

```
GET /store/bundles
       │
       ▼
[ Bundle List Screen ]
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │ Romantic    │  │ Adventure   │  │ Deep Talk   │
  │ Pack        │  │ Pack        │  │ Pack        │
  │ 25 cards    │  │ 40 cards    │  │ 15 cards    │
  │ From ₹10   │  │ From ₹15   │  │ From ₹8    │
  └─────────────┘  └─────────────┘  └─────────────┘
         │
         ▼ (user taps)
GET /store/bundles/:id
         │
         ▼
[ Bundle Detail Screen ]
  ┌────────────────────────────────────────────┐
  │  Romantic Pack                             │
  │  ─────────────────────────────────────── │
  │  Cards:  Slow-Mo Kiss │ Truth Bomb │ ...  │
  │                                            │
  │  Choose a Plan:                            │
  │  [ Starter ₹10 · 5 cards  ]               │
  │  [ Popular ₹25 · 15 cards ] ← recommended │
  │  [ Premium ₹50 · 35 cards ]               │
  └────────────────────────────────────────────┘
```

---

## 5. Admin Panel Flow

```
Admin Dashboard
  └── Bundles List → GET /admin/bundles

  Create New Bundle → POST /admin/bundles

  Open Bundle
    ├── View Details  → GET /admin/bundles/:id
    ├── Edit Info     → PUT /admin/bundles/:id
    │
    ├── Manage Cards Tab
    │     ├── View cards in bundle → GET /admin/bundles/:id/cards
    │     ├── Pick from catalog    → GET /admin/dashboard/cards
    │     ├── Add selected cards   → POST /admin/bundles/:id/cards
    │     └── Remove a card        → DELETE /admin/bundles/:id/cards/:cardId
    │
    └── Manage Plans Tab
          ├── View all plans   → GET /admin/bundles/:id/plans
          ├── Add a plan       → POST /admin/bundles/:id/plans
          ├── Edit a plan      → GET /admin/plans/:planId + PUT /admin/plans/:planId
          └── Delete a plan    → DELETE /admin/plans/:planId
```

---

## 6. API Reference — User Store

### 6.1 — Get All Active Bundles

**Used on:** Store Home / Bundle List Screen  
**Endpoint:** `GET /api/v1/store/bundles`  
**Auth:** User JWT Required

**Request:**
```js
axios.get('/store/bundles', {
  headers: { Authorization: `Bearer ${userToken}` }
});
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "bundles": [
      {
        "bundle_id": "uuid",
        "bundle_name": "Romantic Pack",
        "description": "Best for new couples",
        "cover_image_url": "https://example.com/romantic.jpg",
        "is_active": true,
        "total_cards": 25,
        "active_plans": [
          { "plan_id": "uuid", "plan_name": "Starter",  "price": 10.00, "card_count": 5  },
          { "plan_id": "uuid", "plan_name": "Popular",  "price": 25.00, "card_count": 15 },
          { "plan_id": "uuid", "plan_name": "Premium",  "price": 50.00, "card_count": 35 }
        ]
      }
    ]
  }
}
```

> **Frontend Tip:** To show "From ₹10" on the bundle card, pick `Math.min(...bundle.active_plans.map(p => p.price))`.

---

### 6.2 — Get One Bundle (Full Detail)

**Used on:** Bundle Detail Screen  
**Endpoint:** `GET /api/v1/store/bundles/:id`  
**Auth:** User JWT Required

**Request:**
```js
axios.get(`/store/bundles/${bundleId}`, {
  headers: { Authorization: `Bearer ${userToken}` }
});
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "bundle": {
      "id": "uuid",
      "name": "Romantic Pack",
      "description": "Best for new couples",
      "cover_image_url": "https://example.com/romantic.jpg",
      "total_cards": 25,
      "plans": [
        { "id": "uuid", "name": "Starter", "price": 10.00, "card_count": 5  },
        { "id": "uuid", "name": "Popular", "price": 25.00, "card_count": 15 }
      ],
      "cards": [
        {
          "id": "uuid",
          "name": "Slow-Mo Kiss",
          "card_type": "ACTION",
          "power_description": "Kiss for 30 seconds without stopping.",
          "image_url": null,
          "card_categories": {
            "name": "Romance & Intimacy",
            "theme_color": "#D0021B"
          }
        },
        {
          "id": "uuid",
          "name": "Truth Bomb",
          "card_type": "WILDCARD",
          "power_description": "Ask your partner anything.",
          "card_categories": {
            "name": "Deep Talk",
            "theme_color": "#4A90E2"
          }
        }
      ]
    }
  }
}
```

**Error Response (404):**
```json
{ "status": "error", "message": "Bundle not found or unavailable." }
```

> **Frontend Tip:** `total_cards` is the full pool size. When user picks a plan with `card_count: 5`, they get 5 randomly selected cards from this pool of 25.

---

## 7. API Reference — Admin Bundles

### 7.1 — List All Bundles (Admin)

**Endpoint:** `GET /api/v1/admin/bundles`  
**Auth:** Admin JWT Required

```js
axios.get('/admin/bundles', { headers: { Authorization: `Bearer ${adminToken}` } });
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "bundles": [
      {
        "id": "uuid",
        "name": "Romantic Pack",
        "is_active": true,
        "created_at": "2026-05-15T...",
        "bundle_cards": [{ "count": 25 }],
        "bundle_plans": [{ "count": 3  }]
      }
    ]
  }
}
```

> **Note:** This is a summary list. `bundle_cards` and `bundle_plans` only show the COUNT, not full data. Use `GET /admin/bundles/:id` for full detail.

---

### 7.2 — Create a Bundle

**Endpoint:** `POST /api/v1/admin/bundles`  
**Auth:** Admin JWT Required

```js
axios.post('/admin/bundles', {
  name: "Romantic Pack",                         // Required
  description: "Best for new couples",           // Optional
  cover_image_url: "https://cdn.example.com/img" // Optional
}, authHeader);
```

**Response (201):**
```json
{
  "status": "success",
  "message": "Bundle created successfully.",
  "data": {
    "bundle": { "id": "uuid", "name": "Romantic Pack", "is_active": true }
  }
}
```

---

### 7.3 — Get Full Bundle Detail (Admin)

**Endpoint:** `GET /api/v1/admin/bundles/:id`  
**Auth:** Admin JWT Required

> ⚠️ **Use carefully.** This is a heavy endpoint — it loads ALL cards and ALL plans in one response. Only use this on the bundle detail/edit page. For managing cards/plans separately, use the lightweight endpoints in sections 8 and 9.

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "bundle": {
      "id": "uuid",
      "name": "Romantic Pack",
      "is_active": true,
      "bundle_cards": [
        {
          "id": "junction-uuid",
          "card_id": "uuid",
          "added_at": "2026-05-15T...",
          "cards": {
            "id": "uuid",
            "name": "Slow-Mo Kiss",
            "card_type": "ACTION",
            "is_active": true
          }
        }
      ],
      "bundle_plans": [
        { "id": "uuid", "name": "Starter", "price": 10.00, "card_count": 5, "is_active": true }
      ]
    }
  }
}
```

---

### 7.4 — Update a Bundle

**Endpoint:** `PUT /api/v1/admin/bundles/:id`  
**Auth:** Admin JWT Required

```js
axios.put(`/admin/bundles/${bundleId}`, {
  name: "Updated Bundle Name",  // Optional
  description: "New desc",      // Optional
  is_active: false              // Optional — false hides from store
}, authHeader);
```

---

### 7.5 — Deactivate (Soft-Delete) a Bundle

**Endpoint:** `DELETE /api/v1/admin/bundles/:id`  
**Auth:** Admin JWT Required

```js
axios.delete(`/admin/bundles/${bundleId}`, authHeader);
```

> **Note:** This sets `is_active: false`. The bundle is **not permanently deleted**. It disappears from the user store immediately. Can be re-activated via `PUT` with `is_active: true`.

---

## 8. API Reference — Admin Bundle Cards

### 8.1 — Get Cards Inside a Bundle (Lightweight)

**Endpoint:** `GET /api/v1/admin/bundles/:id/cards`  
**Auth:** Admin JWT Required

> ✅ Use this for the "Cards in Bundle" management tab. No plan data is loaded.

```js
axios.get(`/admin/bundles/${bundleId}/cards`, authHeader);
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "cards": [
      {
        "id": "uuid",
        "name": "Slow-Mo Kiss",
        "card_type": "ACTION",
        "is_active": true,
        "bundle_card_id": "junction-uuid",
        "added_at": "2026-05-15T...",
        "card_categories": { "name": "Romance", "theme_color": "#D0021B" }
      }
    ]
  }
}
```

---

### 8.2 — Add Cards to a Bundle (Bulk)

**Endpoint:** `POST /api/v1/admin/bundles/:id/cards`  
**Auth:** Admin JWT Required

> ✅ Admin picks cards from the catalog (`GET /admin/dashboard/cards`), then sends all selected IDs in one call.

```js
// First: load all catalog cards for the picker
const { data } = await axios.get('/admin/dashboard/cards', authHeader);
// data.data.cards → show in a checklist UI

// Then: send selected card IDs
axios.post(`/admin/bundles/${bundleId}/cards`, {
  card_ids: ["uuid1", "uuid2", "uuid3"]  // send 1 to 200 IDs at once
}, authHeader);
```

**Response (200):**
```json
{
  "status": "success",
  "message": "3 card(s) added to bundle.",
  "data": { "added": [...] }
}
```

> **Duplicate-safe:** If a card is already in the bundle and you send it again, the server silently ignores it. No error thrown.

---

### 8.3 — Remove a Card from a Bundle

**Endpoint:** `DELETE /api/v1/admin/bundles/:id/cards/:cardId`  
**Auth:** Admin JWT Required

```js
axios.delete(`/admin/bundles/${bundleId}/cards/${cardId}`, authHeader);
```

> **Note:** This only removes the card from THIS bundle. The card still exists in the main catalog and all other bundles.

---

## 9. API Reference — Admin Bundle Plans

### 9.1 — Get Plans for a Bundle (Lightweight)

**Endpoint:** `GET /api/v1/admin/bundles/:id/plans`  
**Auth:** Admin JWT Required

> ✅ Use this for the "Plans" management tab. No card data is loaded.

```js
axios.get(`/admin/bundles/${bundleId}/plans`, authHeader);
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "plans": [
      { "id": "uuid", "name": "Starter",  "price": 10.00, "card_count": 5,  "is_active": true },
      { "id": "uuid", "name": "Popular",  "price": 25.00, "card_count": 15, "is_active": true },
      { "id": "uuid", "name": "Premium",  "price": 50.00, "card_count": 35, "is_active": false }
    ]
  }
}
```

---

### 9.2 — Add a Plan to a Bundle

**Endpoint:** `POST /api/v1/admin/bundles/:id/plans`  
**Auth:** Admin JWT Required

```js
axios.post(`/admin/bundles/${bundleId}/plans`, {
  name: "Starter",   // Required — display label
  price: 10.00,      // Required — price in INR (₹)
  card_count: 5      // Required — how many cards user gets when buying this plan
}, authHeader);
```

**Response (201):**
```json
{
  "status": "success",
  "message": "Pricing plan created successfully.",
  "data": {
    "plan": { "id": "uuid", "name": "Starter", "price": 10.00, "card_count": 5, "is_active": true }
  }
}
```

> ⚠️ `card_count` must be ≤ the total number of cards in the bundle. If the bundle has 25 cards, don't create a plan with `card_count: 50`.

---

### 9.3 — Get Single Plan (for Edit Form Pre-fill)

**Endpoint:** `GET /api/v1/admin/plans/:planId`  
**Auth:** Admin JWT Required

```js
axios.get(`/admin/plans/${planId}`, authHeader);
```

**Response (200):**
```json
{
  "status": "success",
  "data": {
    "plan": {
      "id": "uuid",
      "bundle_id": "uuid",
      "name": "Starter",
      "price": 10.00,
      "card_count": 5,
      "is_active": true
    }
  }
}
```

---

### 9.4 — Update a Plan

**Endpoint:** `PUT /api/v1/admin/plans/:planId`  
**Auth:** Admin JWT Required

```js
axios.put(`/admin/plans/${planId}`, {
  price: 15.00,      // Optional
  card_count: 8,     // Optional
  is_active: false   // Optional — false hides plan from store without deleting
}, authHeader);
```

---

### 9.5 — Delete a Plan

**Endpoint:** `DELETE /api/v1/admin/plans/:planId`  
**Auth:** Admin JWT Required

```js
axios.delete(`/admin/plans/${planId}`, authHeader);
```

> ⚠️ This is a **hard delete** (permanent). Use `PUT` with `is_active: false` if you just want to hide the plan temporarily.

---

## 10. TypeScript Interfaces

```typescript
// ── User Store Types ──────────────────────────────────────────

interface StorePlan {
  plan_id:    string;
  plan_name:  string;
  price:      number;
  card_count: number;
}

interface StoreBundle {
  bundle_id:       string;
  bundle_name:     string;
  description:     string | null;
  cover_image_url: string | null;
  is_active:       boolean;
  total_cards:     number;
  active_plans:    StorePlan[];
}

interface CardCategory {
  name:        string;
  theme_color: string;
}

interface BundleCard {
  id:               string;
  name:             string;
  card_type:        'ACTION' | 'WILDCARD' | 'DEFENSE' | 'REACTION';
  power_description:string;
  image_url:        string | null;
  card_categories:  CardCategory;
}

interface BundleDetail {
  id:              string;
  name:            string;
  description:     string | null;
  cover_image_url: string | null;
  total_cards:     number;
  plans:           StorePlan[];
  cards:           BundleCard[];
}

// ── Admin Types ───────────────────────────────────────────────

interface AdminBundle {
  id:              string;
  name:            string;
  description:     string | null;
  cover_image_url: string | null;
  is_active:       boolean;
  created_at:      string;
  bundle_cards:    [{ count: number }];
  bundle_plans:    [{ count: number }];
}

interface BundlePlan {
  id:         string;
  bundle_id:  string;
  name:       string;
  price:      number;
  card_count: number;
  is_active:  boolean;
  created_at: string;
}
```

---

## 11. Axios Service Setup

Create `services/bundleService.ts` in your frontend project:

```typescript
import axios from 'axios';

const API = axios.create({ baseURL: 'http://54.91.119.137:3000/api/v1' });

// Attach token automatically
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token'); // or sessionStorage for admin
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── User Store ──────────────────────────────────────────────
export const getStoreBundles  = ()           => API.get('/store/bundles');
export const getStoreBundleById = (id:string) => API.get(`/store/bundles/${id}`);

// ── Admin Bundles ───────────────────────────────────────────
export const getAdminBundles   = ()                  => API.get('/admin/bundles');
export const getAdminBundleById= (id:string)         => API.get(`/admin/bundles/${id}`);
export const createBundle      = (data:object)       => API.post('/admin/bundles', data);
export const updateBundle      = (id:string, d:object) => API.put(`/admin/bundles/${id}`, d);
export const deleteBundle      = (id:string)         => API.delete(`/admin/bundles/${id}`);

// ── Admin Bundle Cards ──────────────────────────────────────
export const getBundleCards    = (bundleId:string)              => API.get(`/admin/bundles/${bundleId}/cards`);
export const addCardsToBunde   = (bundleId:string, ids:string[])=> API.post(`/admin/bundles/${bundleId}/cards`, { card_ids: ids });
export const removeCardFromBundle = (bundleId:string, cardId:string) => API.delete(`/admin/bundles/${bundleId}/cards/${cardId}`);

// ── Admin Bundle Plans ──────────────────────────────────────
export const getBundlePlans    = (bundleId:string)         => API.get(`/admin/bundles/${bundleId}/plans`);
export const getPlanById       = (planId:string)           => API.get(`/admin/plans/${planId}`);
export const createPlan        = (bundleId:string, d:object) => API.post(`/admin/bundles/${bundleId}/plans`, d);
export const updatePlan        = (planId:string, d:object) => API.put(`/admin/plans/${planId}`, d);
export const deletePlan        = (planId:string)           => API.delete(`/admin/plans/${planId}`);
```

---

## 12. Screen-by-Screen Integration Map

| Screen | API Call | When to Call |
| :--- | :--- | :--- |
| Store Home | `GET /store/bundles` | On screen mount |
| Bundle Detail | `GET /store/bundles/:id` | When user taps a bundle |
| Admin Bundles List | `GET /admin/bundles` | On page load |
| Admin Create Bundle | `POST /admin/bundles` | On form submit |
| Admin Bundle Edit | `GET /admin/bundles/:id` | On page load |
| Admin Bundle Info Update | `PUT /admin/bundles/:id` | On form save |
| Admin Bundle Deactivate | `DELETE /admin/bundles/:id` | On toggle off |
| Admin Cards Tab | `GET /admin/bundles/:id/cards` | On tab open |
| Admin Card Picker | `GET /admin/dashboard/cards` | On "Add Cards" modal open |
| Admin Add Cards | `POST /admin/bundles/:id/cards` | On picker confirm |
| Admin Remove Card | `DELETE /admin/bundles/:id/cards/:cardId` | On card remove button |
| Admin Plans Tab | `GET /admin/bundles/:id/plans` | On tab open |
| Admin Add Plan | `POST /admin/bundles/:id/plans` | On form submit |
| Admin Edit Plan (load) | `GET /admin/plans/:planId` | On edit modal open |
| Admin Edit Plan (save) | `PUT /admin/plans/:planId` | On modal save |
| Admin Delete Plan | `DELETE /admin/plans/:planId` | On delete confirm |

---

## 13. Error Handling Patterns

All error responses from the server follow this shape:

```json
{ "status": "error", "message": "Human-readable error description" }
```

**Common status codes:**

| Code | Meaning | What to Show User |
| :--- | :--- | :--- |
| `400` | Bad request / validation error | Show the `message` field in a form error |
| `401` | Token missing or expired | Redirect to login |
| `403` | Not admin / wrong role | Show "Access Denied" |
| `404` | Resource not found | Show "Not found" or go back |
| `500` | Server error | Show "Something went wrong, try again" |

**Recommended global handler:**

```typescript
API.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);
```
