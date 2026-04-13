# 📖 EleVora: The Complete Frontend Room Engine Guide (Version 1.0)
*A comprehensive "10-Page" Manual for building the Real-Time Couple's Dashboard.*

---

## 📑 Table of Contents
1. [Chapter 1: The Architecture of EleVora Rooms](#chapter-1-the-architecture)
2. [Chapter 2: The Core API Contracts (REST)](#chapter-2-the-api-contracts)
3. [Chapter 3: The Smart App-Resume Pattern](#chapter-3-smart-app-resume)
4. [Chapter 4: Initializing Socket.io](#chapter-4-socketio-initialization)
5. [Chapter 5: Event Synchronization (Live Gameplay)](#chapter-5-event-sync)
6. [Chapter 6: Recommended Frontend State (Redux/Zustand)](#chapter-6-state-management)
7. [Chapter 7: Error Handling & Edge Cases](#chapter-7-errors-edge-cases)

---

## 🏛️ Chapter 1: The Architecture of EleVora Rooms <a name="chapter-1-the-architecture"></a>

The EleVora Room System combines persistent REST APIs (for state creation) with volatile WebSockets (for live gameplay). 
As a frontend developer, you must manage two distinct phases:

1. **The Handshake Phase (REST)**: Using standard HTTPS to establish a room code and save it to the DB.
2. **The Sync Phase (WebSockets)**: Using `socket.io-client` to tunnel continuous JSON events between Host and Partner.

### The Room State Machine
A room will only ever be in one of four states:
*   `WAITING`: The Host created the room, but no partner has joined yet.
*   `ACTIVE`: The Partner has successfully joined. The game is live.
*   `COMPLETED`: The couple has finished the game loop. (Or the partner left).
*   `EXPIRED`: The room exceeded its lifespan (7 Days, 30 Days, or 1 Year) and is now locked.

---

## 🔗 Chapter 2: The Core API Contracts (REST) <a name="chapter-2-the-api-contracts"></a>

These API calls are heavily authenticated. You MUST include your JWT token in the `Authorization: Bearer <TOKEN>` header.

### 2.1 Create a Room (Host Action)
**Endpoint**: `POST /api/v1/rooms/create`

Use this when the user clicks "Start a Game". It generates a unique 6-character code (e.g., `ELV-99279F`).

*   **Body Request**:
    ```json
    {
      "expiry_type": "7_DAYS" // Options: "7_DAYS", "30_DAYS", "1_YEAR"
    }
    ```
*   **Success Response (201)**:
    ```json
    {
      "status": "success",
      "data": {
         "room": {
            "id": "uuid...",
            "code": "ELV-99279F",
            "status": "WAITING",
            "expires_at": "2026-04-21T00:00:00Z"
         }
      }
    }
    ```
*   **Frontend Action**: Store the `code` in your Global State and route the user to `/waiting-room?code=ELV-99279F`.

### 2.2 Join a Room (Partner Action)
**Endpoint**: `POST /api/v1/rooms/join`

Use this when the Partner enters the code shared by the Host.

*   **Body Request**:
    ```json
    {
      "code": "ELV-99279F"
    }
    ```
*   **Success Response (200)**:
    ```json
    {
      "status": "success",
      "data": {
         "room": {
            "status": "ACTIVE"
         }
      }
    }
    ```
*   **Frontend Action**: Store the `code` and immediately redirect the Partner to the Game Dashboard (`/game?code=ELV-99279F`). Also, initialize your Socket connection (See Chapter 4).

---

## 🧠 Chapter 3: The Smart App-Resume Pattern <a name="chapter-3-smart-app-resume"></a>

We have built a single endpoint that eliminates the need for users to enter their code every time they open the app. 

### The Check Active Room Flow
**Endpoint**: `GET /api/v1/rooms/active`

Fire this endpoint on the `App.tsx` / `main.dart` initialization screen (immediately after JWT verification).

*   **If you get a 200 OK**: The user is already in an active game.
    ```json
    {
      "status": "success",
      "data": {
         "room": {
            "code": "ELV-99279F",
            "status": "ACTIVE" // or WAITING
         }
      }
    }
    ```
    **Immediate Redirect**: Push the router straight to `/game?code=ELV-99279F` or `/waiting-room`. Do not show the Homepage!

*   **If you get a 404 Not Found**: The user has no active rooms. Show the standard Homepage with the "Create" and "Join" buttons.

---

## ⚡ Chapter 4: Initializing Socket.io <a name="chapter-4-socketio-initialization"></a>

Once a room is instantiated (either they just created it, just joined it, or woke up the app and hit the active endpoint), you must connect the socket.

### Installation
You **must** use the official client:
```bash
npm install socket.io-client
```

### The Secured Handshake
Our WebSockets are secured by JWT. Do not pass the token over plain text. Use the `auth` object on initialization.

```javascript
import { io } from "socket.io-client";

class GameSocket {
  static socket;

  static initialize() {
    const token = localStorage.getItem('accessToken');
    
    this.socket = io('http://localhost:3000', {
      auth: { token: token },
      reconnection: true, // Auto-reconnect if they go into a tunnel!
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
       console.log('We are connected! Socket ID:', this.socket.id);
    });

    this.socket.on('connect_error', (err) => {
       console.error('Socket Auth Failed. Log them out!', err.message);
    });
  }
}
```

---

## 📡 Chapter 5: Event Synchronization (Live Gameplay) <a name="chapter-5-event-sync"></a>

The socket connection is basically your live "tunnel" to the partner.

### 5.1 Subscribing to the Room Channel
Once your socket is connected (e.g., inside the `useEffect` of the `/game` route), you must tell the backend which room you belong to so it can segment your traffic.

```javascript
// Send the code to the backend
socket.emit("join_room", "ELV-99279F");
```

### 5.2 Waiting for the Partner (Host Only)
If you are the Host, sit on the Waiting Room screen and listen for this exact event.

```javascript
socket.on("partner_joined", (payload) => {
  console.log("Yes! Partner ID", payload.userId, "is here!");
  
  // Frontend Action:
  // Navigate away from waiting room -> Navigate to Game Board
  router.push(`/game?code=${roomCode}`);
});
```

### 5.3 The Universal Game Sync
We created a flexible `game_event` tunnel. Instead of having dozens of listeners (`score_update`, `emoji_sent`, `turn_finished`), you wrap them all in one payload.

**Transmitting a Move (Sending):**
```javascript
const sendAnswerToPartner = (answerData) => {
  socket.emit("game_event", {
    roomCode: "ELV-99279F",
    eventType: "ANSWER_SUBMITTED",
    data: {
       questionId: "uuid-123",
       selectedOption: "Yes",
       scoreModifiers: +50
    }
  });
};
```

**Receiving a Move (Listening):**
```javascript
socket.on("game_event", (payload) => {
  if (payload.eventType === "ANSWER_SUBMITTED") {
    // 1. Play a cool notification sound 🎵
    // 2. Dispatch the data to Redux to update the UI
    store.dispatch(partnerAnswered(payload.data));
  }
  
  if (payload.eventType === "SEND_KISS_EMOJI") {
    // Trigger confetti animation ✨
  }
});
```

---

## 💾 Chapter 6: Recommended Frontend State (Redux/Zustand) <a name="chapter-6-state-management"></a>

To prevent chaos, do not keep Socket listeners inside component states. Keep them in a global slice.

### The Game Slice Model
Your frontend `RoomState` should look roughly like this:

```typescript
interface RoomState {
   isActive: boolean;
   roomCode: string | null;
   amIHost: boolean;
   status: "WAITING" | "ACTIVE" | "EXPIRED";
   hostScore: number;
   partnerScore: number;
   currentQuestionIndex: number;
}
```

**Rule of Thumb**: When an API succeeds OR a Socket event fires, you only dispatch standard Redux actions to mutate this single source of truth. The React components simply map to this state and animate automatically.

---

## 🚨 Chapter 7: Error Handling & Edge Cases <a name="chapter-7-errors-edge-cases"></a>

You must handle these exact backend error codes. Do not rely on generic alerts.

### REST API Errors
*   **404 Not Found (on `/join`)**: The user entered a bad code.
    *   **UI Response**: "Invalid Room code. Did you mistype it?"
*   **400 Bad Request (on `/join` with message `Room is already full`)**: Someone else took the partner slot!
    *   **UI Response**: "This room already has two players."
*   **400 Bad Request (on `/join` with message `Room has expired`)**: 
    *   **UI Response**: "This room expired. Ask the host to create a new one!"

### Socket Errors
*   **Disconnects**: If `socket.on('disconnect')` fires, show a "Reconnecting..." banner at the top of the screen. `socket.io-client` will try to fix itself automatically.
*   **Token Expiry**: If `connect_error` fires with `Authentication error`, the user's JWT has expired. Stop the game, silently try to hit the Rest API `/auth/refresh`, and if it succeeds, reconnect the socket with the new token.

---
### 🎬 Conclusion
You are now fully equipped to interface with the EleVora real-time game engine. Rely heavily on the `/rooms/active` endpoint for smart session persistence, and treat the `game_event` socket emitter as your universal real-time data pipe!
