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
const fs = require('fs');

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
    frameguard: false,
    crossOriginOpenerPolicy: { policy: "unsafe-none" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(mongoSanitize());

// CORS configuration
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://nanoprofiles.com',
    'https://www.nanoprofiles.com',
    'https://profiles.nanoprofiles.com',
    'https://www.skywebdev.xyz',
    'https://skywebdev.xyz',
    process.env.FRONTEND_URL,
    process.env.LANDING_PAGE_URL,
    /^https:\/\/.*\.vercel\.app$/
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
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
app.use('/api/p', require('./routes/secureProfileRoutes'));
app.use('/api/student', require('./routes/studentRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Admin artist delete
const authMiddleware = require('./middleware/auth');
const { adminLimiter } = require('./middleware/rateLimiter');
const { deleteAdminArtist } = require('./handlers/adminArtistDelete');
app.delete('/api/admin/artists/:id', authMiddleware, adminLimiter, deleteAdminArtist);
app.post('/api/admin/artists/:id/delete', authMiddleware, adminLimiter, deleteAdminArtist);

app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/school', require('./routes/schoolNestedRoutes'));
app.use('/api/school', require('./routes/schoolRoutes'));
app.use('/api/sessions', require('./routes/sessionRoutes'));
app.use('/api/artist', require('./routes/artistRoutes'));
app.use('/api/general-profile', require('./routes/generalProfileRoutes'));

// Contact route
app.post('/api/contact', (req, res) => {
    devLog('Contact form submission received');
    res.json({ success: true, message: 'Message received! We will get back to you soon.' });
});

// Serve Admin build
const adminPath = path.join(__dirname, '..', 'admin', 'dist');
app.use('/admin', express.static(adminPath));
app.use('/p', express.static(adminPath));

// Handle Admin/NFC subroutes
app.get(['/admin/*', '/p/*'], (req, res) => {
    res.sendFile(path.join(adminPath, 'index.html'));
});

// Serve landing page build
const landingPagePath = path.join(__dirname, '..', 'landingpage', 'build');
app.use(express.static(landingPagePath));

// ── Dynamic OG meta tag injection for profile share previews ──
// Intercepts profile URLs before the catch-all so crawlers (WhatsApp, Twitter, Slack etc.)
// receive HTML with the real profile photo, name, and bio injected into OG tags.
const Artist = require('./models/Artist');
const GeneralProfile = require('./models/GeneralProfile');

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function injectOgTags(html, { title, description, image, url }) {
    const siteBase = process.env.FRONTEND_URL || 'https://nanoprofiles.com';
    const fallbackImage = `${siteBase}/favicon.png`;
    const ogImage = image || fallbackImage;
    const ogTitle = escapeHtml(title) || 'Nano Profiles';
    const ogDesc = escapeHtml(description) || 'Smart digital identity. Tap to trust.';
    const ogUrl = escapeHtml(url) || siteBase;

    const ogBlock = `
  <!-- Dynamic OG tags injected by server -->
  <title>${ogTitle}</title>
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDesc}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:width" content="800" />
  <meta property="og:image:height" content="800" />
  <meta property="og:url" content="${ogUrl}" />
  <meta property="og:type" content="profile" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDesc}" />
  <meta name="twitter:image" content="${ogImage}" />`;

    return html
        .replace(/<title>[^<]*<\/title>/i, '')
        .replace(/<meta property="og:[^"]*"[^>]*>/gi, '')
        .replace(/<meta name="twitter:[^"]*"[^>]*>/gi, '')
        .replace('</head>', `${ogBlock}\n</head>`);
}

// Artist public profile: /artist/:artistId
app.get('/artist/:artistId', async (req, res, next) => {
    try {
        const artistId = req.params.artistId;
        const artist = await Artist.findOne({
            $or: [{ artistId }, { username: artistId }]
        }).lean();

        const indexPath = path.join(landingPagePath, 'index.html');
        if (!fs.existsSync(indexPath)) return next();
        let html = fs.readFileSync(indexPath, 'utf8');

        if (artist) {
            const name = artist.name || artist.username || 'Artist Profile';
            const bio = (artist.bio || artist.experience || '').slice(0, 160);
            const image = artist.photo || '';
            const siteBase = process.env.FRONTEND_URL || 'https://nanoprofiles.com';
            html = injectOgTags(html, {
                title: `${name} — Nano Profiles`,
                description: bio || `Check out ${name}'s artist profile on Nano Profiles.`,
                image,
                url: `${siteBase}/artist/${artistId}`
            });
        }

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        console.error('OG injection error (artist):', err.message);
        next();
    }
});

// General / Restaurant public profile: /link/:username
app.get('/link/:username', async (req, res, next) => {
    try {
        const username = req.params.username.toLowerCase().trim();
        const profile = await GeneralProfile.findOne({ username }).lean();

        const indexPath = path.join(landingPagePath, 'index.html');
        if (!fs.existsSync(indexPath)) return next();
        let html = fs.readFileSync(indexPath, 'utf8');

        if (profile) {
            const name = profile.name || profile.username || 'Profile';
            const rawBio = profile.bio || '';
            // Strip embedded phone/email lines
            const bio = rawBio.split('\n')
                .filter(l => !l.startsWith('📞') && !l.startsWith('✉'))
                .join(' ').trim().slice(0, 160);
            const image = profile.photo || profile.banner || '';
            const siteBase = process.env.FRONTEND_URL || 'https://nanoprofiles.com';
            const typeLabel = profile.profileType === 'restaurant' ? 'restaurant' : 'profile';
            html = injectOgTags(html, {
                title: `${name} — Nano Profiles`,
                description: bio || `Check out ${name}'s ${typeLabel} on Nano Profiles.`,
                image,
                url: `${siteBase}/link/${username}`
            });
        }

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        console.error('OG injection error (general):', err.message);
        next();
    }
});

// Handle React routing in landing page (catch-all for everything else)
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path === '/health') {
        return next();
    }
    res.sendFile(path.join(landingPagePath, 'index.html'));
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

// On Vercel: export only the Express app
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
