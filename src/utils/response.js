/**
 * Send a standardized success response
 */
const sendSuccess = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({
    status: 'success',
    message,
    data,
  });
};

/**
 * Send a standardized error response
 */
const sendError = (res, statusCode, message, details = null) => {
  return res.status(statusCode).json({
    status: 'error',
    message,
    ...(details && { details }),
  });
};

module.exports = {
  sendSuccess,
  sendError,
};
