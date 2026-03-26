const { z } = require('zod');
const authService = require('../services/authService');
const { sendSuccess, sendError } = require('../utils/response');

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const googleSchema = z.object({
  token: z.string().min(20, 'Requires a valid Google ID token')
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Requires a valid refresh token')
});

const forgotSchema = z.object({
  email: z.string().email('Invalid email address')
});

const resetSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters')
});

const verifyOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits')
});

/**
 * Signup Controller
 */
const signup = async (req, res, next) => {
  try {
    const validatedData = signupSchema.parse(req.body);
    const result = await authService.signup(validatedData);
    return sendSuccess(res, 201, 'User created successfully', result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation Error', error.errors);
    }
    // Will be caught by global error handler
    next(error);
  }
};

/**
 * Login Controller
 */
const login = async (req, res, next) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const result = await authService.login(validatedData);
    return sendSuccess(res, 200, 'Login successful', result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation Error', error.errors);
    }
    next(error);
  }
};

/**
 * Google Login Controller
 */
const googleLogin = async (req, res, next) => {
  try {
    const validatedData = googleSchema.parse(req.body);
    const result = await authService.googleLogin(validatedData);
    return sendSuccess(res, 200, 'Google Login successful', result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation Error', error.errors);
    }
    // E.g. Google verification failed 
    if (error.message.includes('Token used too late') || error.message.includes('Wrong number of segments')) {
       return sendError(res, 401, 'Invalid or expired Google Token');
    }
    next(error);
  }
};

/**
 * Refresh Token Controller
 */
const refreshToken = async (req, res, next) => {
  try {
    const validatedData = refreshSchema.parse(req.body);
    const result = await authService.refresh(validatedData);
    return sendSuccess(res, 200, 'Token refreshed successfully', result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation Error', error.errors);
    }
    next(error);
  }
};

/**
 * Forgot Password Controller
 */
const forgotPassword = async (req, res, next) => {
  try {
    const validatedData = forgotSchema.parse(req.body);
    const result = await authService.forgotPassword(validatedData);
    return sendSuccess(res, 200, result.message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation Error', error.errors);
    }
    next(error);
  }
};

/**
 * Reset Password Controller
 */
const resetPassword = async (req, res, next) => {
  try {
    const validatedData = resetSchema.parse(req.body);
    const result = await authService.resetPassword(validatedData);
    return sendSuccess(res, 200, result.message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation Error', error.errors);
    }
    next(error);
  }
};

/**
 * Verify OTP Controller
 */
const verifyOtp = async (req, res, next) => {
  try {
    const validatedData = verifyOtpSchema.parse(req.body);
    const result = await authService.verifyOtp(validatedData);
    return sendSuccess(res, 200, result.message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation Error', error.errors);
    }
    next(error);
  }
};

module.exports = { 
  signup, 
  login,
  googleLogin,
  refreshToken,
  forgotPassword,
  verifyOtp,
  resetPassword
};
