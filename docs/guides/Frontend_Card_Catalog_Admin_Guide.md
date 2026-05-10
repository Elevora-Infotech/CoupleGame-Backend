# 🃏 EleVora: Frontend Integration Guide (Card Catalog & Admin Panel)

This brief guide provides the Frontend Team with the exact API contracts and rendering strategies for the new EleVora Card Engine. 

It is divided into two sections: The **Mobile App** (for players) and the **Admin Web Panel**.

---

## 📱 Part 1: The Mobile App (User Facing)

Players do not create cards; they simply fetch the beautiful catalog to browse and play.

### 1. Fetching the Catalog
**Endpoint**: `GET /api/v1/cards/catalog`
**Auth Required**: Yes (Bearer Token)

When the app loads the "Card Deck" screen, make **one** API call to this endpoint. The backend will return a highly optimized payload containing all 7 categories and their nested cards. Disabled cards automatically disappear.

**Sample Response:**
```json
{
  "status": "success",
  "data": {
    "catalog": [
      {
        "id": "uuid...",
        "name": "Romance, Intimacy & Desire",
        "theme_color": "#D0021B",
        "cards": [
          {
            "id": "uuid...",
            "name": "Slow-Mo Kiss",
            "power_description": "Kiss for 30 seconds, no distractions.",
            "card_type": "ACTION",
            "image_url": null
          }
        ]
      }
    ]
  }
}
```

### 2. Rendering CSS Gradient Cards (Recommended Method)
If `image_url` is null, do not show a broken image icon! Instead, generate a stunning CSS card:
*   **The Container**: Create a square `div` with rounded corners.
*   **The Background**: Apply the `theme_color` from the parent category (e.g., `#D0021B`). You can add a subtle CSS gradient overlay for a modern glassmorphism effect.
*   **The Text**: Overlay the `name` (bold) and `power_description` (light text) inside the colored box.

---

## 💻 Part 2: The Admin Panel (Web Dashboard)

The Admin panel requires full CRUD (Create, Read, Update, Delete) capability.

> [!WARNING]
> **Authentication**: Every single one of these endpoints requires an **Admin JWT Token** passed in the `Authorization: Bearer <TOKEN>` header. Standard user tokens will be rejected with a 403 Forbidden error.

### 1. Managing Categories (`/api/v1/admin/dashboard/categories`)

*   **Create**: `POST /`
    *   **Body Payload**: `{ "name": "...", "description": "...", "theme_color": "#FF0000", "order_index": 1 }`
*   **Update**: `PUT /:id`
    *   **Body Payload**: *(Same as Create, plus an optional `is_active` boolean)*
*   **Delete**: `DELETE /:id`
    *   **Important**: This performs a "Soft Delete". It will not erase the category from the database (to protect user history). It simply flips `is_active` to `false` so it instantly disappears from the mobile app.

### 2. Managing Cards (`/api/v1/admin/dashboard/cards`)

*   **Create**: `POST /`
    *   **Body Payload**: 
        ```json
        {
          "category_id": "uuid-of-category",
          "name": "The Honest Hour",
          "power_description": "Say 3 truths...",
          "card_type": "ACTION" 
        }
        ```
    *   *Note: `card_type` MUST be exactly one of: `ACTION`, `WILDCARD`, `DEFENSE`, or `REACTION`.*
*   **Update**: `PUT /:id`
    *   **Body Payload**: *(Same as Create)*
*   **Delete**: `DELETE /:id`
    *   *(Also performs a Soft Delete).*

### 3. Rendering the Admin Dashboard
For the Admin UI, we recommend a simple two-pane layout:
1. **Left Pane (Categories)**: A vertical list of the 7 categories. Clicking a category updates the right pane.
2. **Right Pane (Cards Table)**: A datatable showing all cards in the selected category, with "Edit" and "Delete" action buttons on each row.
