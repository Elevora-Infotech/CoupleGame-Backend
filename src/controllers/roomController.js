const roomService = require('../services/roomService');
const { getIo } = require('../services/socketService');

const createRoom = async (req, res, next) => {
    try {
        const { expiry_type } = req.body;
        const room = await roomService.createRoom(req.user.id, expiry_type);
        res.status(201).json({ status: 'success', data: { room } });
    } catch (error) {
        next(error);
    }
};

const joinRoom = async (req, res, next) => {
    try {
        const { code } = req.body;
        if (!code) {
            const err = new Error('Room code is required.');
            err.status = 400;
            throw err;
        }
        const room = await roomService.joinRoom(req.user.id, code);

        // Note: Emitting to Socket.io here is optional, 
        // usually handled purely clientside via socket join

        res.status(200).json({ status: 'success', data: { room } });
    } catch (error) {
        next(error);
    }
};

const getActiveRoom = async (req, res, next) => {
    try {
        const room = await roomService.getActiveRoom(req.user.id);
        if (!room) {
            return res.status(404).json({ status: 'success', data: { room: null }, message: 'No active room found.' });
        }
        res.status(200).json({ status: 'success', data: { room } });
    } catch (error) {
        next(error);
    }
};

const coinFlip = async (req, res, next) => {
    try {
        const { reason, chosen_side } = req.body;
        
        if (!reason || typeof reason !== 'string' || reason.trim() === '') {
            return res.status(400).json({ status: 'error', message: 'Reason is required for the coin flip.' });
        }
        
        if (!chosen_side || !['HEADS', 'TAILS'].includes(chosen_side.toUpperCase())) {
            return res.status(400).json({ status: 'error', message: 'Chosen side must be HEADS or TAILS.' });
        }
        
        // Ensure user is in an active room
        const room = await roomService.getActiveRoom(req.user.id);
        if (!room) {
            return res.status(403).json({ status: 'error', message: 'You must be in an active room to flip a coin.' });
        }
        
        // Generate random result
        const isHeads = Math.random() < 0.5;
        const result = isHeads ? 'HEADS' : 'TAILS';
        
        // Determine winner
        const isWinner = (chosen_side.toUpperCase() === result);
        const partnerId = room.host_id === req.user.id ? room.partner_id : room.host_id;
        const winnerId = isWinner ? req.user.id : partnerId;
        
        const payload = {
            flipper_id: req.user.id,
            partner_id: partnerId,
            reason: reason.trim(),
            chosen_side: chosen_side.toUpperCase(),
            result,
            winner_id: winnerId,
            timestamp: new Date().toISOString()
        };
        
        // Emit to the room channel (using the room UUID channel)
        try {
            getIo().to(room.id).emit('coin_flip_result', payload);
        } catch (e) {
            console.error('[Socket] emit coin_flip_result failed:', e.message);
        }
        
        // No database storage required per user request
        res.status(200).json({ status: 'success', data: payload });
    } catch (error) {
        next(error);
    }
};

module.exports = { createRoom, joinRoom, getActiveRoom, coinFlip };
