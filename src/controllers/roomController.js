const roomService = require('../services/roomService');

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

module.exports = { createRoom, joinRoom, getActiveRoom };
