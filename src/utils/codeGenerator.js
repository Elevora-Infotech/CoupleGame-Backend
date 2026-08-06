const crypto = require('crypto');

const generateRoomCode = () => {
    // Generates a 6 character alphanumeric code with SSF prefix, e.g. SSF-A9B3C1
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `SSF-${randomPart}`;
};

module.exports = { generateRoomCode };

