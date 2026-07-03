# Feedback System — Frontend Integration Guide

This guide is for the **React Native / Mobile App** developer.
It explains how to implement the complete user feedback flow so feedback appears in the Admin Panel.

---

## Overview

The feedback system has two sides:
- **Mobile App** → User submits feedback (bugs, feature requests, rating, card issues)
- **Admin Panel** → Admin views, triages, and resolves all feedback

---

## Backend API Reference

### Submit Feedback

**Endpoint:** `POST /api/v1/telemetry/feedback`  
**Auth:** `Authorization: Bearer <user_access_token>` *(required)*  
**Content-Type:** `application/json`

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `feedback_type` | `string` | ✅ Yes | One of: `BUG`, `FEATURE_REQUEST`, `GENERAL`, `CARD_FEEDBACK` |
| `message` | `string` | ✅ Yes | The feedback text from the user |
| `rating` | `integer` | ❌ Optional | Star rating from `1` to `5` |
| `metadata` | `object` | ❌ Optional | Extra context, e.g. `{ "card_id": "abc-123", "room_id": "xyz-456" }` |

#### Example Request Body

```json
{
  "feedback_type": "BUG",
  "rating": 2,
  "message": "The card timer keeps resetting randomly after I come back from the background.",
  "metadata": {
    "card_id": "c9d72ab8-2fe5-4106-ba81-f7e5286267b1",
    "room_id": "05fed809-e0e7-4b86-b392-d32132645a59",
    "app_version": "1.2.3"
  }
}
```

#### Success Response (201)

```json
{
  "status": "success",
  "message": "Feedback submitted successfully. Thank you!",
  "data": {
    "id": "7b3c1a2d-...",
    "created_at": "2026-07-03T08:00:00Z"
  }
}
```

#### Error Responses

| Status | Cause |
|--------|-------|
| `400` | Invalid `feedback_type` or missing `message` |
| `401` | Missing or invalid auth token |
| `500` | Database error |

---

## Implementation Examples

### Basic Feedback Submission (React Native)

```javascript
// services/feedbackService.js
import axiosInstance from './axiosInstance'; // your axios setup with base URL + auth

/**
 * Submit user feedback to the backend
 * @param {'BUG'|'FEATURE_REQUEST'|'GENERAL'|'CARD_FEEDBACK'} feedbackType
 * @param {string} message
 * @param {number|null} rating - 1 to 5
 * @param {object} metadata - optional extra context
 */
export const submitFeedback = async (feedbackType, message, rating = null, metadata = {}) => {
  const response = await axiosInstance.post('/telemetry/feedback', {
    feedback_type: feedbackType,
    message,
    rating,
    metadata,
  });
  return response.data;
};
```

---

### General Feedback Screen (React Native)

```jsx
// screens/FeedbackScreen.jsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { submitFeedback } from '../services/feedbackService';

const TYPES = ['GENERAL', 'BUG', 'FEATURE_REQUEST'];

export default function FeedbackScreen() {
  const [type, setType] = useState('GENERAL');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return Alert.alert('Error', 'Please enter your feedback.');

    setSubmitting(true);
    try {
      await submitFeedback(type, message, rating);
      Alert.alert('Thank you!', 'Your feedback has been received.');
      setMessage('');
      setRating(null);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 22, fontWeight: 'bold' }}>Send Feedback</Text>

      {/* Type Selector */}
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
        {TYPES.map(t => (
          <TouchableOpacity key={t} onPress={() => setType(t)}
            style={{ padding: 8, borderRadius: 8, backgroundColor: type === t ? '#6366f1' : '#1e293b' }}>
            <Text style={{ color: '#fff', fontSize: 12 }}>{t.replace('_', ' ')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Star Rating */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {[1, 2, 3, 4, 5].map(star => (
          <TouchableOpacity key={star} onPress={() => setRating(star)}>
            <Text style={{ fontSize: 28, color: star <= (rating || 0) ? '#f59e0b' : '#475569' }}>★</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Message */}
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder="Describe your feedback..."
        placeholderTextColor="#64748b"
        multiline
        numberOfLines={5}
        style={{ backgroundColor: '#1e293b', color: '#fff', padding: 12, borderRadius: 12, minHeight: 100 }}
      />

      <TouchableOpacity onPress={handleSubmit} disabled={submitting}
        style={{ marginTop: 16, padding: 14, backgroundColor: '#6366f1', borderRadius: 12, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{submitting ? 'Sending...' : 'Submit Feedback'}</Text>
      </TouchableOpacity>
    </View>
  );
}
```

---

### Card-Specific Feedback (submitting from inside a card)

When a user wants to report an issue with a specific card, pass the card and room IDs in `metadata`:

```javascript
// Inside your card component
import { submitFeedback } from '../services/feedbackService';

const reportCard = async (cardId, roomId, message) => {
  await submitFeedback(
    'CARD_FEEDBACK',
    message,
    null, // no rating needed
    { card_id: cardId, room_id: roomId }
  );
};
```

---

## Admin Panel — What Happens After Submission

Once a user submits feedback, it instantly appears in the **Admin Panel** under:

> **Advanced Intelligence → Feedback System**

The Admin can:
- Filter by `BUG`, `FEATURE_REQUEST`, `GENERAL`, or `CARD_FEEDBACK`
- Filter by status: `OPEN`, `IN_REVIEW`, `RESOLVED`, `CLOSED`
- Add private admin notes
- Update the status (Resolve / Close the ticket)

---

## Feedback Types Quick Reference

| Type | When to Use |
|------|-------------|
| `BUG` | App crashes, broken features, unexpected behavior |
| `FEATURE_REQUEST` | User wants something new |
| `GENERAL` | Open-ended comments |
| `CARD_FEEDBACK` | Issue with a specific card content (pass `card_id` in metadata) |
