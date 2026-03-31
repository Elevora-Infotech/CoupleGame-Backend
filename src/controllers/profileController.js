const profileService = require('../services/profileService');

/**
 * Get current user's profile
 */
const getMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const profile = await profileService.getProfile(userId);
    
    res.status(200).json({
      status: 'success',
      data: { profile }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update current user's profile
 */
const updateMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const updateData = req.body;
    
    const profile = await profileService.updateProfile(userId, updateData);
    
    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: { profile }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMe,
  updateMe
};
