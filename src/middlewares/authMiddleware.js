const { verifyAccessToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');

/**
 * Middleware to verify JWT Access Token
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 401, 'Authentication token missing or incorrectly formatted');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    // Attach decoded user data (e.g., id) to the request object
    req.user = decoded;
    next();
  } catch (error) {
    return sendError(res, 401, 'Token is invalid or expired');
  }
};

module.exports = { 
  authenticate 
};
