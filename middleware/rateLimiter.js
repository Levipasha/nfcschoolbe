const rateLimit = require('express-rate-limit');

// Rate limiter for student profile endpoint
const studentProfileLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter for admin endpoints (dashboard loads multiple requests in parallel)
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX) || 300, // Allow enough for dashboard + normal use
    message: {
        success: false,
        message: 'Too many admin requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Very strict rate limiter for login endpoint
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Only 5 login attempts per 15 minutes
    message: {
        success: false,
        message: 'Too many login attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins
});

module.exports = {
    studentProfileLimiter,
    adminLimiter,
    loginLimiter
};
