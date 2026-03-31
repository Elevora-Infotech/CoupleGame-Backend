const adminAuthService = require('../services/adminAuthService');

/**
 * Admin Login Controller
 * Handles the login for the separate admin dashboard website
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      const err = new Error('Email and password are required.');
      err.status = 400;
      throw err;
    }

    const { admin, token } = await adminAuthService.adminLogin({ email, password });

    res.status(200).json({
      status: 'success',
      message: 'Admin logged in successfully',
      data: {
        admin,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login
};
