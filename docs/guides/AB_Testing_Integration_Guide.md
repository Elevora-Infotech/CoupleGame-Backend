# A/B Testing Integration Guide for Frontend (Mobile App)

This guide explains how the mobile app developer can integrate and execute the A/B tests that are created in the Admin Panel.

## How it works (Architecture)

1. **Admin Panel**: The Admin creates a new A/B test (e.g. "Notification Wording") and defines JSON variants (Variant A: `{"title": "Hurry!"}`, Variant B: `{"title": "Reminder"}`).
2. **Assignment (Backend)**: When the mobile app starts, it calls the backend to get the user's active A/B tests. The backend automatically and randomly assigns the user to a variant based on the traffic allocation.
3. **Execution (Frontend)**: The mobile app reads the JSON configuration and modifies its behavior (e.g., changes the text of a notification).
4. **Telemetry (Backend)**: When the user successfully performs the action (e.g., clicks the notification), the frontend sends a telemetry event back to the server to track conversion.

---

## Step 1: Fetching Active A/B Tests

When the app initializes (after login), fetch the active A/B tests for the current user.

**Endpoint:** `GET /api/v1/telemetry/ab-tests`
**Headers:** `Authorization: Bearer <user_token>`

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "test_name": "Penalty Urgency Notification",
      "test_type": "NOTIFICATION",
      "variant": "A",
      "config": {
        "title": "Hurry! You have a penalty pending!"
      }
    }
  ]
}
```

The app should store this `data` array in a local state management tool (like Redux or Context API) so it can be accessed globally.

## Step 2: Applying the Configuration

Whenever you need to render a UI or send a push notification, check if an A/B test applies.

```javascript
// Example in React Native

const activeTests = useSelector(state => state.telemetry.activeTests);

// Find if there is an active NOTIFICATION test
const notificationTest = activeTests.find(test => test.test_type === 'NOTIFICATION');

// Default wording
let notificationTitle = "You have a new penalty.";

if (notificationTest && notificationTest.config) {
  // Override with the A/B test variant config
  notificationTitle = notificationTest.config.title || notificationTitle;
}

// Proceed to display or send the notification
sendPushNotification(notificationTitle);
```

## Step 3: Logging Conversions (Telemetry)

To determine which variant is winning, the app MUST send telemetry events when a user completes a desired action (e.g., opens a card, starts a game, clicks a notification).

**Endpoint:** `POST /api/v1/telemetry/events`
**Headers:** `Authorization: Bearer <user_token>`
**Body:**
```json
{
  "event_name": "NOTIFICATION_CLICKED",
  "metadata": {
    "source": "penalty_reminder",
    "test_name": "Penalty Urgency Notification"
  }
}
```

This data is stored in the `app_events` table and is used by the Admin Panel to calculate Funnel Tracking, Drop-off Analysis, and A/B Test conversions.
