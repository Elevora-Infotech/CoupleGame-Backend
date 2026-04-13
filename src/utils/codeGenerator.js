const crypto = require('crypto');

const generateRoomCode = () => {
    // Generates a 6 character alphanumeric code, e.g. ELV-A9B
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `ELV-${randomPart}`;
};

module.exports = { generateRoomCode };
