# 💻 EleVora: Admin Dashboard (Frontend) API Guide

This document is the **Master Reference** for the Web Developers building the isolated Admin Dashboard for EleVora. The Admin APIs are completely separated from the main user app for top-tier security.

---

## 🌍 Base URL
`http://localhost:3000/api/v1` (Update this to your production URL later)

## 🔐 Admin Authentication Header
All routes (except login) require an Admin Bearer token.
```http
Authorization: Bearer <your_ADMIN_access_token>
```
> **Security Note:** Standard user tokens will be immediately rejected with a `403 Forbidden` error. Only tokens generated from `/admin/auth/login` will work here.

---

## 1️⃣ Admin Login (`/admin/auth`)

Since admins cannot "Sign Up" publicly (for security), you must use an existing admin account created directly inside the Supabase `admins` table.

### 1.1 Admin Login
- **Endpoint**: `POST /admin/auth/login`
- **Access**: Public
- **Request Body**:
```json
{
  "email": "admin@elevora.com",
  "password": "admin123"
}
```
- **Response**: Returns the admin object (`id`, `name`, `email`, `role`) and an admin-specific `token`. (Default expiration is 2 hours).

---

## 2️⃣ Dashboard Overview (`/admin/dashboard`)

### 2.1 Get High-Level Stats
- **Endpoint**: `GET /admin/dashboard/stats`
- **Access**: Private (Admin Only)
- **Response Example**:
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
*Use this endpoint to populate the numbers on the main dashboard landing page.*

---

## 3️⃣ Questionnaire Management System (`/admin/dashboard/questions`)
*These endpoints allow the admin to fully control the onboarding game flow without requiring backend code changes.*

### 3.1 Create a New Question
- **Endpoint**: `POST /admin/dashboard/questions`
- **Access**: Private (Admin Only)
- **Description**: Creates a new question and attaches its options simultaneously.
- **Request Body (Example: Choice Question)**:
```json
{
  "text": "What is your primary love language?",
  "input_type": "SINGLE_CHOICE",
  "options": [
    "Words of Affirmation",
    "Quality Time",
    "Physical Touch",
    "Acts of Service",
    "Receiving Gifts"
  ]
}
```
- **Request Body (Example: Text Question doesn't need options)**:
```json
{
  "text": "Describe your perfect date night.",
  "input_type": "TEXT"
}
```

---

### Upcoming Endpoints (Currently in Planning Phase)
*If you need these immediately, inform the backend team. They are designed but pending final implementation based on your UI needs.*

- **`GET /admin/dashboard/questions`**: Will return the full list of all questions (including inactive ones) for the admin table view.
- **`PATCH /admin/dashboard/questions/:id`**: Will allow toggling the `is_active` boolean to hide questions from the main app, or fixing typos in the text.
- **`PATCH /admin/dashboard/questions/reorder`**: Will accept an array of IDs to batch-update the sorting order for a drag-and-drop UI list.
- **`POST /admin/dashboard/questions/dependency`**: Will allow the admin to say "Show Question Y only if the user picked Option X in Question Z".
