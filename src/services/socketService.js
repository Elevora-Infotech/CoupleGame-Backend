const socketIo = require('socket.io');
const { verifyAccessToken } = require('../utils/jwt');
const { env } = require('../config/env');

let io;

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
        socket.on('join_room', (roomCode) => {
            console.log(`User ${socket.user.id} joining room ${roomCode}`);
            socket.join(roomCode);
            currentRoomCode = roomCode;

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
