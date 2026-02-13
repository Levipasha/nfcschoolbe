require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const connectDB = require('./config/database');

// Initialize express
const app = express();

// Connect to database
connectDB();

// Security middleware
app.use(helmet()); // Set security HTTP headers
app.use(mongoSanitize()); // Prevent NoSQL injection

// CORS configuration
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://www.skywebdev.xyz',
    'https://skywebdev.xyz',
    process.env.FRONTEND_URL,
    // Add Vercel preview and production patterns
    /^https:\/\/.*\.vercel\.app$/
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const isAllowed = allowedOrigins.some(allowed => {
            if (allowed instanceof RegExp) return allowed.test(origin);
            return allowed === origin;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            console.log('Blocked by CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/student', require('./routes/studentRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/school', require('./routes/schoolRoutes'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'NFC Student System API is running',
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to NFC Student Profile System API',
        version: '1.0.0',
        endpoints: {
            public: [
                'GET /api/student/:id - Get student profile by ID'
            ],
            admin: [
                'POST /api/admin/login - Admin login',
                'GET /api/admin/students - List all students',
                'POST /api/admin/students - Add new student',
                'GET /api/admin/students/:id - Get student details',
                'PUT /api/admin/students/:id - Update student',
                'DELETE /api/admin/students/:id - Delete student',
                'POST /api/admin/students/:id/toggle-status - Enable/Disable student tag',
                'GET /api/admin/stats - Get dashboard statistics'
            ]
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
🚀 Server is running on port ${PORT}
📡 Environment: ${process.env.NODE_ENV || 'development'}
🌐 CORS enabled for: ${corsOptions.origin}
  `);
});

module.exports = app;
