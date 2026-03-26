const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { apiLimiter, authLimiter } = require('./middlewares/rateLimitMiddleware');

const { env } = require('./config/env');

const app = express();

// Middleware
app.use(helmet());
app.use(apiLimiter); // Apply global rate limit
app.use(cors({
  origin: env.CLIENT_URL === '*' ? '*' : env.CLIENT_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Protected Auth Routes (Stricter limits)
app.use('/api/v1/auth', authLimiter);

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'API is running' });
});

const authRoutes = require('./routes/authRoutes');

// Setup Routes
app.use('/api/v1/auth', authRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;
