const request = require('supertest');
const app = require('../src/app');
const userModel = require('../src/models/userModel');
const mailer = require('../src/utils/mailer');
const jwt = require('../src/utils/jwt');

// Mock dependencies
jest.mock('../src/models/userModel');
jest.mock('../src/utils/mailer');

describe('Auth API Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/auth/signup', () => {
    it('should successfully sign up a new user', async () => {
      userModel.findUserByEmail.mockResolvedValue(null);
      userModel.createUser.mockResolvedValue({
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        auth_provider: 'email'
      });
      userModel.updateUser.mockResolvedValue({});

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user.id).toBe('user-123');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
    });

    it('should return 409 if user already exists', async () => {
      userModel.findUserByEmail.mockResolvedValue({ id: '1' });

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          name: 'Test User',
          email: 'existing@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Email is already in use');
    });

    it('should return 400 for invalid input', async () => {
      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'invalid-email',
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should successfully log in', async () => {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('password123', 10);

      userModel.findUserByEmail.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        password_hash: hashedPassword,
        auth_provider: 'email'
      });
      userModel.updateUser.mockResolvedValue({});

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.user.id).toBe('user-123');
      expect(response.body.data).toHaveProperty('accessToken');
    });

    it('should return 401 for wrong password', async () => {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('password123', 10);

      userModel.findUserByEmail.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        password_hash: hashedPassword,
        auth_provider: 'email'
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid email or password');
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should generate OTP and mock email', async () => {
      userModel.findUserByEmail.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        auth_provider: 'email'
      });
      userModel.updateUser.mockResolvedValue({});

      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(userModel.updateUser).toHaveBeenCalledWith('user-123', expect.objectContaining({
        reset_token: expect.any(String),
        reset_token_expiry: expect.any(String)
      }));
      expect(mailer.sendResetOtpEmail).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/auth/verify-otp', () => {
    it('should verify correct OTP', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      userModel.findUserByEmail.mockResolvedValue({
        id: 'user-123',
        reset_token: '123456',
        reset_token_expiry: futureDate.toISOString()
      });

      const response = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'test@example.com', otp: '123456' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('OTP verified successfully. You can now reset your password.');
    });

    it('should return 429 after 5 failed attempts', async () => {
      userModel.findUserByEmail.mockResolvedValue({
        id: 'user-123',
        otp_attempts: 5,
        reset_token: '123456'
      });

      const response = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'test@example.com', otp: '123456' });

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too many failed attempts. Please request a new OTP.');
    });

    it('should return 400 for invalid OTP', async () => {
      userModel.findUserByEmail.mockResolvedValue({
        id: 'user-123',
        reset_token: '123456',
        reset_token_expiry: new Date().toISOString()
      });

      const response = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'test@example.com', otp: 'wrong-otp' });

      expect(response.status).toBe(400);
    });
  });
});
