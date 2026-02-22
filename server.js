const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn('⚠️  Cloudinary env missing. Photo uploads will fail. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in nfcschoolbe/.env');
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
// Route imports
// (Using inline require in app.use for cleaner structure)


// Initialize express
const app = express();

// Trust proxy - Required for Railway/Vercel to handle rate limiting correctly
app.set('trust proxy', 1);

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ CRITICAL ERROR: MONGODB_URI is not defined in environment variables!');
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => {
        console.error('❌ Error connecting to MongoDB:', err.message);
        process.exit(1);
    });

// Security middleware
app.use(helmet()); // Set security HTTP headers
app.use(mongoSanitize()); // Prevent NoSQL injection

// CORS configuration (API is used by: nfcschoolfe, landing page, mobile, etc.)
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://www.skywebdev.xyz',
    'https://skywebdev.xyz',
    process.env.FRONTEND_URL,
    process.env.LANDING_PAGE_URL,  // Landing page (artist profile / OTP) – e.g. https://yoursite.com
    // Vercel: any *.vercel.app (covers nfcschoolfe, landing page, previews)
    /^https:\/\/.*\.vercel\.app$/
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // In development, allow all origins to facilitate local network testing
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }

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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files with permissive CORS for images
app.use('/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/p', require('./routes/secureProfileRoutes')); // Secure tokenized profiles
app.use('/api/student', require('./routes/studentRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/school', require('./routes/schoolRoutes'));
app.use('/api/sessions', require('./routes/sessionRoutes'));
app.use('/api/artist', require('./routes/artistRoutes'));



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

// On Vercel: export only the Express app (default export required for serverless).
// WebSocket and listen() are not supported in serverless; real-time features are no-op on Vercel.
const isVercel = !!process.env.VERCEL;

if (isVercel) {
    app.set('io', null);
    module.exports = app;
} else {
    const PORT = process.env.PORT || 5000;
    const http = require('http');
    const server = http.createServer(app);
    const initializeWebSocket = require('./config/websocket');
    const io = initializeWebSocket(server, corsOptions);
    app.set('io', io);

    server.listen(PORT, () => {
        console.log(`
🚀 Server is running on port ${PORT}
📡 Environment: ${process.env.NODE_ENV || 'development'}
🌐 CORS enabled for allowed origins
🔌 WebSocket enabled for real-time features
  `);
    });
    module.exports = app;
}

