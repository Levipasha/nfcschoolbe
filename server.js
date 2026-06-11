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

const isProduction = process.env.NODE_ENV === 'production';
const devLog = (...args) => {
    if (!isProduction) console.log(...args);
};

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
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            "default-src": ["'self'"],
            "base-uri": ["'self'"],
            "frame-ancestors": [
                "'self'",
                "https://nanoprofiles.com",
                "https://www.nanoprofiles.com",
                "https://profiles.nanoprofiles.com",
                "https://skywebdev.xyz",
                "https://www.skywebdev.xyz",
                "https://*.vercel.app"
            ],
            "img-src": ["'self'", "data:", "blob:", "https:"],
            "script-src": ["'self'", "https://*.firebaseapp.com", "https://*.googleapis.com"],
            "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
            "connect-src": ["'self'", "https://*.firebaseapp.com", "https://*.googleapis.com", "https://*.google.com", "https://res.cloudinary.com", "https://api.cloudinary.com", "https://*.vercel.app", "https://*.railway.app", "https://*.up.railway.app", "https://*.render.com"],
            "object-src": ["'none'"],
            "media-src": ["'self'", "blob:", "https:"],
            "frame-src": ["'self'", "https://*.firebaseapp.com", "https://*.google.com"],
        },
    },
    frameguard: false, // Disable X-Frame-Options: SAMEORIGIN
    crossOriginOpenerPolicy: { policy: "unsafe-none" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
})); // Set security HTTP headers
app.use(mongoSanitize()); // Prevent NoSQL injection

// CORS configuration (API is used by: nfcschoolfe, landing page, mobile, etc.)
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://nanoprofiles.com',
    'https://www.nanoprofiles.com',
    'https://profiles.nanoprofiles.com',
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

        // Always allow localhost/127.0.0.1 (any port) — local development
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }

        // Allow all origins only outside production when explicitly enabled.
        if (!isProduction && process.env.CORS_ALLOW_ALL === 'true') {
            return callback(null, true);
        }

        const isAllowed = allowedOrigins.some(allowed => {
            if (allowed instanceof RegExp) return allowed.test(origin);
            return allowed === origin;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            devLog('Blocked by CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Firebase-UID', 'X-Firebase-Email'],
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logger for local debugging
app.use((req, res, next) => {
    devLog(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin}`);
    next();
});

// Serve static files with permissive CORS for images
app.use('/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
}, express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/p', require('./routes/secureProfileRoutes')); // Secure tokenized profiles
app.use('/api/student', require('./routes/studentRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Admin artist delete: mounted here (not only inside adminRoutes) so DELETE/POST always register when server.js loads.
const authMiddleware = require('./middleware/auth');
const { adminLimiter } = require('./middleware/rateLimiter');
const { deleteAdminArtist } = require('./handlers/adminArtistDelete');
app.delete('/api/admin/artists/:id', authMiddleware, adminLimiter, deleteAdminArtist);
app.post('/api/admin/artists/:id/delete', authMiddleware, adminLimiter, deleteAdminArtist);

app.use('/api/upload', require('./routes/uploadRoutes'));
// Nested /api/school/:id/classes and /students must register before the generic school router
// so Express never treats "classes" as part of a catch-all param.
app.use('/api/school', require('./routes/schoolNestedRoutes'));
app.use('/api/school', require('./routes/schoolRoutes'));
app.use('/api/sessions', require('./routes/sessionRoutes'));
app.use('/api/artist', require('./routes/artistRoutes'));
app.use('/api/general-profile', require('./routes/generalProfileRoutes'));


// Contact route (placeholder for landing page)
app.post('/api/contact', (req, res) => {
    devLog('Contact form submission received');
    res.json({ success: true, message: 'Message received! We will get back to you soon.' });
});

// Serve Admin build
const adminPath = path.join(__dirname, '..', 'admin', 'dist');
app.use('/admin', express.static(adminPath));
app.use('/p', express.static(adminPath)); // Admin handles /p/:token routes

// Handle Admin/NFC subroutes
app.get(['/admin/*', '/p/*'], (req, res) => {
    res.sendFile(path.join(adminPath, 'index.html'));
});

// Serve landing page build
const landingPagePath = path.join(__dirname, '..', 'landingpage', 'build');
app.use(express.static(landingPagePath));

// Handle React routing in landing page (catch-all for everything else)
app.get('*', (req, res, next) => {
    // If it's an API route or upload, let it pass to other handlers (which might return 404)
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path === '/health') {
        return next();
    }
    
    // Serve landing page for all other frontend routes
    res.sendFile(path.join(landingPagePath, 'index.html'));
});

// Fallback for API documentation or status if everything else fails
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to NFC Student Profile System API',
        version: '1.0.0',
        endpoints: {
            public: [
                'GET /api/student/:id - Get student profile by ID'
            ],
            admin: [
                'POST /api/admin/send-otp - Send OTP to admin email',
                'POST /api/admin/verify-otp - Verify OTP and login',
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
🗑️  Admin artist delete: POST /api/admin/artists/:id/delete (and DELETE /api/admin/artists/:id)
  `);
    });
    module.exports = app;
}

