const socketIo = require('socket.io');
const { verifyAccessToken } = require('../utils/jwt');
const { env } = require('../config/env');
const { supabase } = require('../db/supabase');

let io;
const roomCache = new Map();

const initSocket = (server) => {
    io = socketIo(server, {
        cors: {
            origin: env.CLIENT_URL === '*' ? '*' : env.CLIENT_URL,
            credentials: true
        }
    });

    // Authentication Middleware
    io.use((socket, next) => {
        try {
            // Expect token in handshake auth or header
            const token = socket.handshake.auth.token || socket.handshake.headers['authorization']?.split(' ')[1];
            if (!token) throw new Error('Authentication error');

            const decoded = verifyAccessToken(token);
            socket.user = decoded; // Attach user payload to socket
            next();
        } catch (err) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`🔌 User connected: ${socket.user.id} (Socket ID: ${socket.id})`);

        let currentRoomCode = null;

        // Join a specific room channel
        socket.on('join_room', async (roomCode) => {
            console.log(`User ${socket.user.id} joining room ${roomCode}`);
            socket.join(roomCode);
            currentRoomCode = roomCode;

            // 1. Check in-memory cache first to avoid overloading database
            if (roomCache.has(roomCode)) {
                const cachedRoomId = roomCache.get(roomCode);
                if (cachedRoomId) {
                    socket.join(cachedRoomId);
                }
                socket.to(roomCode).emit('partner_joined', {
                    userId: socket.user.id,
                    status: 'online'
                });
                return;
            }

            // 2. Cache miss -> query DB once and save result
            try {
                const { data: room } = await supabase
                    .from('rooms')
                    .select('id')
                    .eq('code', roomCode)
                    .single();

                if (room) {
                    roomCache.set(roomCode, room.id);
                    socket.join(room.id);
                } else {
                    roomCache.set(roomCode, null); // Cache negative lookup
                }
            } catch (err) {
                // Cache as null on error to prevent hammer effect on DB
                roomCache.set(roomCode, null);
                console.error('Failed to auto-join UUID channel:', err.message);
            }

            // Notify others in room that partner is ONLINE
            socket.to(roomCode).emit('partner_joined', {
                userId: socket.user.id,
                status: 'online'
            });
        });

        // Generic game event transmitter
        socket.on('game_event', (payload) => {
            // payload expects { roomCode: 'ELV...', eventType: 'SCORE_UPDATE', data: {} }
            const { roomCode, eventType, data } = payload;
            if (!roomCode) return;

            console.log(`Game Event [${eventType}] in room ${roomCode}`);
            socket.to(roomCode).emit('game_event', { eventType, data, senderId: socket.user.id });
        });

        // ── Card Send Events ──────────────────────────────────────
        // Client emits 'send_card' when they want to push a card to partner
        // This is a real-time notification path (HTTP API is the authoritative path)
        socket.on('send_card', (payload) => {
            // payload: { roomCode, send_id, card, message, receiver_id }
            const { roomCode, send_id, card, message, receiver_id } = payload;
            if (!roomCode || !send_id) return;

            console.log(`Card Send in room ${roomCode} by ${socket.user.id}`);
            socket.to(roomCode).emit('card_received', {
                send_id,
                sender_id:   socket.user.id,
                receiver_id,
                room_code:   roomCode,
                card,
                message:     message || null,
            });
        });

        // Client emits 'seen_card' when they open/view a received card
        socket.on('seen_card', (payload) => {
            const { roomCode, send_id } = payload;
            if (!roomCode || !send_id) return;

            socket.to(roomCode).emit('card_seen', {
                send_id,
                receiver_id: socket.user.id,
            });
        });

        socket.on('disconnect', () => {
            console.log(`🔌 User disconnected: ${socket.user.id}`);
            if (currentRoomCode) {
                // Notify others in room that partner is OFFLINE
                io.to(currentRoomCode).emit('partner_offline', {
                    userId: socket.user.id,
                    status: 'offline'
                });
            }
        });
    });
};

const getIo = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

module.exports = { initSocket, getIo };
