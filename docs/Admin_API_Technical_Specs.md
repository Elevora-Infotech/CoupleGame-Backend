# 💻 EleVora: Admin API Technical Specifications

**Version**: 1.1.0  
**Architect**: Staff Software Engineer  
**Status**: Production-Ready (Isolated System)

---

## 🧩 Table of Contents
- [POST | /admin/auth/login | ADMIN_LOGIN](#post--adminauthlogin--admin_login)
- [GET | /admin/dashboard/stats | GET_DASHBOARD_STATS](#get--admindashboardstats--get_dashboard_stats)
- [POST | /admin/dashboard/questions | CREATE_QUESTION_WITH_OPTIONS](#post--admindashboardquestions--create_question_with_options)

---

## POST | /admin/auth/login | ADMIN_LOGIN

### 1. Context
Entry point for the isolated Admin Dashboard website. Authenticates against the `admins` table.

### 2. Security/Auth
*   **Auth Type**: Password-based.
*   **Output**: Admin JWT (Access Token).

### 3. RBAC
*   **Permitted**: Users existing in the `admins` table only.

### 5. The Request Contract
*   **Headers**: `Content-Type: application/json`
*   **Request Body**:
```json
{
  "email": "admin@elevora.com (Required)",
  "password": "string (Required)"
}
```

### 6. The Success Contract (200 OK)
```json
{
  "status": "success",
  "data": {
    "admin": {
      "id": "uuid",
      "name": "Admin Name",
      "email": "admin@elevora.com",
      "role": "super_admin"
    },
    "token": "ADMIN_JWT_TOKEN"
  }
}
```
*   **Data Types**: `id` is UUID. `role` is Enum (`super_admin`, `admin`).
*   **Nullability**: No fields are nullable.

### 7. The Error Contract
| HTTP Code | Internal_Error_Slug | Frontend_Display_Message | Suggested_Action |
| :--- | :--- | :--- | :--- |
| 401 | `ERR_ADMIN_AUTH_FAILED` | Invalid credentials. | Check email/password. |

### 8. State Management & Side Effects
*   **DB**: Updates `last_login` timestamp in `admins` table.

### 9. Frontend Implementation Logic
*   **Caching**: Never cache password.
*   **Storage**: Store Admin JWT in a secure `HttpOnly` cookie or `sessionStorage`. Redirect to `/dashboard` on 200.

### 10. cURL Snippet
```bash
curl --location --request POST 'http://localhost:3000/api/v1/admin/auth/login' \
--header 'Content-Type: application/json' \
--data-raw '{ "email": "admin@elevora.com", "password": "admin123" }'
```

---

## GET | /admin/dashboard/stats | GET_DASHBOARD_STATS

### 1. Context
Populates the dashboard's summary tiles (Total Users, Engagement).

### 2. Security/Auth
*   **Auth Type**: ADMIN_JWT.
*   **RBAC**: Admin only (`adminProtect` middleware).

### 6. The Success Contract (200 OK)
```json
{
  "status": "success",
  "data": {
    "stats": {
      "totalUsers": 1250,
      "activeSessions": 940,
      "lastUpdated": "2026-03-31T12:00:00Z"
    }
  }
}
```
*   **Nullability**: `totalUsers` and `activeSessions` default to `0`, never null.

### 9. Frontend Implementation Logic
*   **Caching**: Cache for **30 seconds**. Highly dynamic data.
*   **Optimistic UI**: N/A.

---

## POST | /admin/dashboard/questions | CREATE_QUESTION_WITH_OPTIONS

### 1. Context
Creates a new challenge question and its selectable options in a single atomic action.

### 5. The Request Contract
*   **Request Body**:
```json
{
  "text": "string (Required)",
  "input_type": "Enum (Required: SINGLE_CHOICE, TEXT, SLIDER)",
  "options": "Array of strings (Optional)"
}
```

### 8. State Management & Side Effects
*   **DB**: Inserts row into `questions`, then inserts N rows into `question_options`.

### 10. cURL Snippet
```bash
curl --location --request POST 'http://localhost:3000/api/v1/admin/dashboard/questions' \
--header 'Authorization: Bearer {{ADMIN_TOKEN}}' \
--header 'Content-Type: application/json' \
--data-raw '{ "text": "New Q?", "input_type": "SINGLE_CHOICE", "options": ["A", "B"] }'
```
