const express = require('express');
const jwt = require('jsonwebtoken');
const validator = require('validator');
console.log('Artist routes loading...');
const router = express.Router();
const Artist = require('../models/Artist');
const GeneralProfile = require('../models/GeneralProfile');
const Session = require('../models/Session');
const multer = require('multer');
const { uploadBuffer } = require('../utils/cloudinary');
const { firebaseAuth } = require('../middleware/firebaseAuth');
const { generateOtp, setOtp, consumeOtp } = require('../utils/otpStore');
const { sendOtpEmail, isConfigured: isSmtpConfigured } = require('../utils/sendMail');

// Multer memory storage for Cloudinary upload (4MB to stay under Vercel 4.5MB body limit)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 }, // 4MB for Vercel compatibility
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed'));
        }
    }
});

// Test route
router.get('/test-route', (req, res) => res.json({ success: true, message: 'Artist route cluster reached' }));

// @route   POST /api/artist/check-account
// @desc    Check if a fully setup profile exists for an email (Artist or General)
// @access  Public
router.post('/check-account', async (req, res) => {
    try {
        const email = (req.body.email || '').toLowerCase().trim();
        if (!validator.isEmail(email)) {
            return res.status(400).json({ success: false, exists: false, message: 'Invalid email.' });
        }
        const re = new RegExp('^' + email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
        const [artistCount, generalCount] = await Promise.all([
            Artist.countDocuments({ isActive: true, isSetup: true, $or: [{ ownerEmail: re }, { email: re }] }),
            GeneralProfile.countDocuments({ ownerEmail: re })
        ]);
        res.json({ success: true, exists: (artistCount + generalCount) > 0 });
    } catch (err) {
        res.status(500).json({ success: false, exists: false });
    }
});

// @route   POST /api/artist/upload-photo
// @desc    Upload artist profile/gallery photo to Cloudinary
// @access  Public (for setup)
router.post('/upload-photo', (req, res, next) => {
    upload.single('photo')(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large. Use an image under 4MB.' : (err.message || 'Upload failed');
            return res.status(400).json({ success: false, message: msg });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded or file too large. Use an image under 4MB on Vercel.'
            });
        }
        const isVideo = (req.file.mimetype || '').startsWith('video/');
        const result = await uploadBuffer(req.file.buffer, {
            folder: 'nfc/artists',
            resource_type: isVideo ? 'video' : 'image'
        });
        res.json({ success: true, url: result.secure_url });
    } catch (error) {
        console.error('Upload route error:', error);
        const msg = error.message || 'Upload failed';
        const isConfigError = msg.includes('Cloudinary is not configured');
        const status = isConfigError ? 503 : 500;
        res.status(status).json({ success: false, message: msg });
    }
});

// @route   POST /api/artist/send-otp
// @desc    Send OTP to profile email (must match an artist's ownerEmail or email)
// @access  Public
router.post('/send-otp', async (req, res) => {
    try {
        const email = (req.body.email || '').trim();
        if (!validator.isEmail(email)) {
            return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
        }
        if (!isSmtpConfigured()) {
            return res.status(503).json({ success: false, message: 'Email verification is not configured. Use Google Sign-In or contact support.' });
        }
        const normalized = email.toLowerCase().trim();
        const re = new RegExp('^' + normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');

        // Ensure mode is captured correctly, default to 'login' if missing to be safe
        const mode = (req.body.mode || 'login').toLowerCase().trim();

        // Count documents instead of finding a full object to be sure
        const [artistCount, generalCount] = await Promise.all([
            Artist.countDocuments({
                isActive: true,
                isSetup: true, // Only fully setup artists count as "existing" for login/signup choice
                $or: [{ ownerEmail: re }, { email: re }]
            }),
            GeneralProfile.countDocuments({ ownerEmail: re })
        ]);

        const accountExists = (artistCount + generalCount) > 0;

        console.log(`[send-otp] Email: ${normalized}, Mode: ${mode}, Exists: ${accountExists}`);

        // Validation based on mode
        if (mode === 'login' && !accountExists) {
            return res.status(403).json({
                success: false,
                exists: false,
                error_type: 'NO_ACCOUNT',
                message: 'No profile has been created on this mail. Please sign up.'
            });
        }

        if (mode === 'signup' && accountExists) {
            return res.status(403).json({
                success: false,
                exists: true,
                error_type: 'ACCOUNT_EXISTS',
                message: 'An account already exists with this mail. Please log in instead.'
            });
        }

        const otp = generateOtp();
        setOtp(normalized, otp);
        await sendOtpEmail(email, otp);
        res.json({
            success: true,
            message: 'Verification code sent to your email.',
            exists: accountExists
        });
    } catch (err) {
        console.error('Send OTP error:', err);
        res.status(500).json({ success: false, message: err.message || 'Failed to send code.' });
    }
});

// @route   POST /api/artist/verify-otp
// @desc    Verify OTP and return JWT for editing artist profiles (same email as owner)
// @access  Public
router.post('/verify-otp', async (req, res) => {
    try {
        const email = (req.body.email || '').trim();
        const otp = (req.body.otp || '').trim();
        const mode = (req.body.mode || 'login').toLowerCase().trim();

        if (!validator.isEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email.' });
        }
        if (!otp || otp.length !== 6) {
            return res.status(400).json({ success: false, message: 'Please enter the 6-digit code.' });
        }
        const normalized = email.toLowerCase().trim();

        // 1. Verify OTP first
        if (!consumeOtp(normalized, otp)) {
            return res.status(400).json({ success: false, message: 'Invalid or expired code. Request a new one.' });
        }

        // 2. Strict existence check if mode is login
        const re = new RegExp('^' + normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
        const [artistCount, generalCount] = await Promise.all([
            Artist.countDocuments({
                isActive: true,
                isSetup: true,
                $or: [{ ownerEmail: re }, { email: re }]
            }),
            GeneralProfile.countDocuments({ ownerEmail: re })
        ]);
        const accountExists = (artistCount + generalCount) > 0;

        if (mode === 'login' && !accountExists) {
            return res.status(403).json({
                success: false,
                error_type: 'NO_ACCOUNT',
                message: 'No profile found for this email. Verification aborted.'
            });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({ success: false, message: 'Server auth not configured.' });
        }
        const token = jwt.sign(
            { email: normalized, type: 'otp' },
            secret,
            { expiresIn: '1h' }
        );
        res.json({ success: true, token, email: normalized });
    } catch (err) {
        console.error('Verify OTP error:', err);
        res.status(500).json({ success: false, message: err.message || 'Verification failed.' });
    }
});

// Get all artists
router.get('/', async (req, res) => {
    try {
        const artists = await Artist.find({ isActive: true })
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: artists.length,
            data: artists
        });
    } catch (error) {
        console.error('Error fetching artists:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching artists',
            error: error.message
        });
    }
});

// @route   GET /api/artist/profile
// @desc    Get artist profile by public ID (e.g. ?id=AT-01)
// @access  Public
router.get('/profile', async (req, res) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'No artist ID provided'
            });
        }

        // Flexible lookup: try exact match, then try with prefix if it looks like just a number
        let artist = await Artist.findOne({ artistId: id, isActive: true });

        if (!artist && /^\d+$/.test(id)) {
            const prefixedId = `AT-${id.padStart(2, '0')}`;
            artist = await Artist.findOne({ artistId: prefixedId, isActive: true });
        }

        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist profile not found'
            });
        }

        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '0.0.0.0';
        const userAgent = req.get('user-agent') || 'Unknown';
        const referrer = req.get('referer') || req.get('referrer') || 'Direct';

        await artist.recordScan();

        // Create a new session for this artist view
        const session = new Session({
            artistId: artist.artistId,
            ipAddress,
            userAgent,
            referrer,
            metadata: {
                artistName: artist.name,
                artistCode: artist.code,
                lookupType: 'id_query'
            }
        });

        await session.save();

        // Broadcast scan event via WebSocket
        const io = req.app.get('io');
        if (io) {
            io.broadcastArtistScan({
                artistId: artist.artistId,
                name: artist.name,
                scanCount: artist.scanCount,
                deviceType: session.deviceType,
                sessionId: session.sessionId
            });
        }

        res.json({
            success: true,
            sessionId: session.sessionId,
            data: artist
        });
    } catch (error) {
        console.error('Error fetching artist profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching artist profile',
            error: error.message
        });
    }
});

// @route   GET /api/artist/public/:artistId
// @desc    Public, read-only artist profile used by /artist?id=<id> on landing page
// @access  Public
router.get('/public/:artistId', async (req, res) => {
    try {
        const { artistId } = req.params;

        if (!artistId) {
            return res.status(400).json({
                success: false,
                message: 'No artist ID provided'
            });
        }

        // Flexible lookup: first by artistId, then support numeric IDs similar to /profile
        let artist = await Artist.findOne({ artistId, isActive: true });

        if (!artist && /^\d+$/.test(artistId)) {
            const prefixedId = `AT-${artistId.padStart(2, '0')}`;
            artist = await Artist.findOne({ artistId: prefixedId, isActive: true });
        }

        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist not found',
                error: 'Artist not found'
            });
        }

        res.json({
            success: true,
            data: {
                artistId: artist.artistId,
                name: artist.name,
                photo: artist.photo,
                backgroundPhoto: artist.backgroundPhoto,
                bio: artist.bio,
                specialization: artist.specialization,
                website: artist.website,
                instagram: artist.instagram,
                facebook: artist.facebook,
                twitter: artist.twitter,
                linkedin: artist.linkedin,
                whatsapp: artist.whatsapp,
                youtube: artist.youtube,
                tiktok: artist.tiktok,
                spotify: artist.spotify,
                snapchat: artist.snapchat,
                telegram: artist.telegram,
                reddit: artist.reddit,
                threads: artist.threads,
                discord: artist.discord,
                portfolio: artist.portfolio,
                pinterest: artist.pinterest,
                medium: artist.medium,
                twitch: artist.twitch,
                quora: artist.quora,
                github: artist.github,
                email: artist.email,
                phone: artist.phone,
                gallery: artist.gallery || [],
                artLinks: artist.artLinks || [],
                profileTheme: artist.profileTheme,
                profileFont: artist.profileFont
            }
        });
    } catch (error) {
        console.error('Error fetching public artist profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching public artist profile',
            error: error.message
        });
    }
});

// Get single artist by MongoDB ID
router.get('/:id', async (req, res, next) => {
    try {
        // Only run if the ID matches a MongoDB ObjectId format to avoid conflicts
        if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            return next(); // Let other specific routes handle it or fall through
        }

        const artist = await Artist.findById(req.params.id);

        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist not found'
            });
        }

        res.json({
            success: true,
            data: artist
        });
    } catch (error) {
        console.error('Error fetching artist by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching artist',
            error: error.message
        });
    }
});

// @route   GET /api/artist/token/:token
// @desc    Get artist by access token (NFC Direct)
// @access  Public
router.get('/token/:token', async (req, res) => {
    try {
        const artist = await Artist.findOne({ accessToken: req.params.token });

        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist not found'
            });
        }

        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('user-agent') || 'Unknown';
        const referrer = req.get('referer') || req.get('referrer') || 'Direct';

        await artist.recordScan();

        // Create a new session for this artist view
        const session = new Session({
            artistId: artist.artistId,
            ipAddress,
            userAgent,
            referrer,
            metadata: {
                artistName: artist.name,
                artistCode: artist.code,
                lookupType: 'token'
            }
        });

        await session.save();

        // Broadcast scan event via WebSocket
        const io = req.app.get('io');
        if (io) {
            io.broadcastArtistScan({
                artistId: artist.artistId,
                name: artist.name,
                scanCount: artist.scanCount,
                deviceType: session.deviceType,
                sessionId: session.sessionId
            });
        }

        res.json({
            success: true,
            sessionId: session.sessionId,
            data: artist
        });
    } catch (error) {
        console.error('Error fetching artist by token:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching artist',
            error: error.message
        });
    }
});

// Get artist by public code
router.get('/code/:code', async (req, res) => {
    try {
        const artist = await Artist.findOne({ code: req.params.code });

        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist not found'
            });
        }

        res.json({
            success: true,
            data: artist
        });
    } catch (error) {
        console.error('Error fetching artist by code:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching artist',
            error: error.message
        });
    }
});

// Create new artist
router.post('/', async (req, res) => {
    try {
        const artistData = {
            name: req.body.name,
            bio: req.body.bio || '',
            photo: req.body.photo || undefined,
            phone: req.body.phone || '',
            email: req.body.email || '',
            website: req.body.website || '',
            instagram: req.body.instagram || '',
            facebook: req.body.facebook || '',
            twitter: req.body.twitter || '',
            specialization: req.body.specialization || '',
            backgroundPhoto: req.body.backgroundPhoto || undefined,
            gallery: req.body.gallery || [],
            profileTheme: req.body.profileTheme || 'mono'
        };

        const artist = new Artist(artistData);
        await artist.save();

        res.status(201).json({
            success: true,
            message: 'Artist created successfully',
            data: artist
        });
    } catch (error) {
        console.error('Error creating artist:', error);
        res.status(400).json({
            success: false,
            message: 'Error creating artist',
            error: error.message
        });
    }
});

// Update artist
router.put('/:id', async (req, res) => {
    try {
        const updateData = {
            name: req.body.name,
            bio: req.body.bio,
            photo: req.body.photo,
            phone: req.body.phone,
            email: req.body.email,
            website: req.body.website,
            instagram: req.body.instagram,
            facebook: req.body.facebook,
            twitter: req.body.twitter,
            whatsapp: req.body.whatsapp,
            linkedin: req.body.linkedin,
            specialization: req.body.specialization,
            artworkCount: req.body.artworkCount,
            backgroundPhoto: req.body.backgroundPhoto,
            gallery: req.body.gallery,
            profileTheme: req.body.profileTheme,
            updatedAt: Date.now()
        };

        // Remove undefined values
        Object.keys(updateData).forEach(key =>
            updateData[key] === undefined && delete updateData[key]
        );

        // Only run if the ID matches a MongoDB ObjectId format to avoid conflicts
        if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            return next();
        }

        const artist = await Artist.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist not found'
            });
        }

        res.json({
            success: true,
            message: 'Artist updated successfully',
            data: artist
        });
    } catch (error) {
        console.error('Error updating artist:', error);
        res.status(400).json({
            success: false,
            message: 'Error updating artist',
            error: error.message
        });
    }
});

// Delete artist (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        // Only run if the ID matches a MongoDB ObjectId format to avoid conflicts
        if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            return next();
        }

        const artist = await Artist.findByIdAndDelete(req.params.id);

        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist not found'
            });
        }

        // Optional: Clean up related sessions if you want true "erased all details"
        await Session.deleteMany({ artistId: artist.artistId }).catch(e => console.error('Session cleanup error:', e));

        res.json({
            success: true,
            message: 'Artist profile and all details erased successfully.',
            data: artist
        });
    } catch (error) {
        console.error('Error deleting artist:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting artist',
            error: error.message
        });
    }
});

// Get artist statistics
router.get('/stats/overview', async (req, res) => {
    try {
        const totalArtists = await Artist.countDocuments({ isActive: true });
        const totalScans = await Artist.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: null, total: { $sum: '$scanCount' } } }
        ]);

        res.json({
            success: true,
            data: {
                totalArtists,
                totalScans: totalScans.length > 0 ? totalScans[0].total : 0
            }
        });
    } catch (error) {
        console.error('Error fetching artist stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching artist statistics',
            error: error.message
        });
    }
});

// Quick create new artist (empty profile for NFC – admin panel)
// Mirrors the barebones creation logic used by POST /api/artist/my-profiles,
// but without Firebase auth. Admin can optionally pass `artistId`, `name`, `email`.
router.post('/quick-create', async (req, res) => {
    try {
        const { artistId, name, email } = req.body || {};

        if (artistId) {
            const existing = await Artist.findOne({ artistId });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: 'Artist ID already taken'
                });
            }
        }

        const adminEmail = (email || '').toLowerCase().trim();

        const artist = new Artist({
            artistId: artistId || `admin-${Date.now()}`,
            name: name || 'New Artist',
            ownerEmail: adminEmail || undefined,
            email: adminEmail || undefined,
            isSetup: false,
            isActive: true
        });

        await artist.save();

        res.status(201).json({
            success: true,
            message: 'Artist container created successfully',
            data: artist
        });
    } catch (error) {
        console.error('Error quick creating artist:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating artist container',
            error: error.message
        });
    }
});

// --- Landing page: artist owner only (Firebase ID token required) ---
// GET /api/artist/my-profiles - list artist profiles owned by or linked to the logged-in user (same Gmail)
// Matches: ownerUid, ownerEmail, OR profile contact email (so existing profiles with your Gmail show up)
router.get('/my-profiles', firebaseAuth, async (req, res) => {
    try {
        const uid = req.firebaseUser.uid;
        const email = (req.firebaseUser.email || '').toLowerCase().trim();
        const query = { isActive: true };
        if (uid || email) {
            query.$or = [];
            if (uid) query.$or.push({ ownerUid: uid });
            if (email) {
                query.$or.push({ ownerEmail: email });
                query.$or.push({ email }); // profile contact email same as login email
            }
        } else {
            query.ownerUid = uid;
        }
        let artists = await Artist.find(query)
            .sort({ updatedAt: -1 })
            .lean();

        // If profiles exist but some don't have the UID linked yet (only email match), link it
        if (artists.length > 0 && uid) {
            // Maintenance: If profiles exist but some don't have the UID linked yet (only email match), link it
            const unlinked = artists.filter(a => !a.ownerUid && a.ownerEmail === email);
            if (unlinked.length > 0) {
                console.log(`Linking UID to ${unlinked.length} existing profiles for ${email}...`);
                await Artist.updateMany(
                    { _id: { $in: unlinked.map(a => a._id) } },
                    { $set: { ownerUid: uid } }
                );
                // Refresh list
                artists = await Artist.find(query).sort({ updatedAt: -1 }).lean();
            }
        }

        res.json({
            success: true,
            count: artists.length,
            data: artists
        });
    } catch (error) {
        console.error('Error fetching my artist profiles:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching your artist profiles',
            error: error.message
        });
    }
});

// POST /api/artist/my-profiles - Create a new barebones artist profile
router.post('/my-profiles', firebaseAuth, async (req, res) => {
    try {
        const email = (req.firebaseUser.email || '').toLowerCase().trim();
        const uid = req.firebaseUser.uid || null;

        const { artistId, name } = req.body;
        
        if (artistId) {
            const existing = await Artist.findOne({ artistId });
            if (existing) {
                return res.status(400).json({ success: false, message: 'Username already taken' });
            }
        }
        
        const artist = new Artist({
            artistId: artistId || `user-${Date.now()}`,
            name: name || 'New Artist',
            ownerEmail: email,
            ownerUid: uid,
            email: email, // Set contact email to same as login email initially
            isSetup: false,
            isActive: true
        });
        
        await artist.save();
        res.json({ success: true, data: artist });
    } catch (error) {
        console.error('Error creating profile:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// PUT /api/artist/me/:artistId - update only if the logged-in user owns this artist (artists only, not students)
router.put('/me/:artistId', firebaseAuth, async (req, res) => {
    try {
        const uid = req.firebaseUser.uid;
        const { artistId } = req.params;

        let artist = await Artist.findOne({ artistId, isActive: true });
        if (!artist && artistId.match(/^[0-9a-fA-F]{24}$/)) {
            artist = await Artist.findById(artistId);
        }
        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist profile not found'
            });
        }

        const email = (req.firebaseUser.email || '').toLowerCase().trim();
        const isOwner =
            (artist.ownerUid && artist.ownerUid === uid) ||
            (artist.ownerEmail && artist.ownerEmail.toLowerCase() === email) ||
            (artist.email && artist.email.toLowerCase() === email);
        if (!isOwner) {
            return res.status(403).json({
                success: false,
                message: 'You can only edit your own artist profiles.'
            });
        }

        const updateData = {
            artistId: req.body.artistId,
            name: req.body.name,
            bio: req.body.bio,
            photo: req.body.photo,
            backgroundPhoto: req.body.backgroundPhoto,
            gallery: req.body.gallery,
            phone: req.body.phone,
            email: req.body.email,
            website: req.body.website,
            instagram: req.body.instagram,
            facebook: req.body.facebook,
            twitter: req.body.twitter,
            whatsapp: req.body.whatsapp,
            linkedin: req.body.linkedin,
            youtube: req.body.youtube,
            tiktok: req.body.tiktok,
            spotify: req.body.spotify,
            snapchat: req.body.snapchat,
            telegram: req.body.telegram,
            reddit: req.body.reddit,
            threads: req.body.threads,
            discord: req.body.discord,
            portfolio: req.body.portfolio,
            pinterest: req.body.pinterest,
            medium: req.body.medium,
            twitch: req.body.twitch,
            quora: req.body.quora,
            github: req.body.github,
            specialization: req.body.specialization,
            artworkCount: req.body.artworkCount,
            instagramName: req.body.instagramName,
            instagramCategory: req.body.instagramCategory,
            instagramPosts: req.body.instagramPosts,
            instagramFollowers: req.body.instagramFollowers,
            instagramFollowing: req.body.instagramFollowing,
            instagramAccountBio: req.body.instagramAccountBio,
            badgeOverrides: req.body.badgeOverrides,
            profileTheme: req.body.profileTheme,
            profileFont: req.body.profileFont,
            bioFont: req.body.bioFont,
            isSetup: req.body.isSetup !== undefined ? req.body.isSetup : artist.isSetup,
            artLinks: req.body.artLinks,
            ownerEmail: email || artist.ownerEmail,
            ownerUid: uid || artist.ownerUid,
            updatedAt: Date.now()
        };

        Object.keys(updateData).forEach(key =>
            updateData[key] === undefined && delete updateData[key]
        );

        const updatedArtist = await Artist.findByIdAndUpdate(
            artist._id,
            updateData,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Artist profile updated successfully',
            data: updatedArtist
        });
    } catch (error) {
        console.error('Error updating my artist profile:', error);
        res.status(400).json({
            success: false,
            message: 'Error updating profile',
            error: error.message
        });
    }
});

// Setup artist profile (used by artist after tapping NFC)
router.put('/setup/:token', async (req, res) => {
    try {
        const artist = await Artist.findOne({ accessToken: req.params.token });

        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist container not found'
            });
        }

        if (artist.isSetup && !req.body.forceUpdate) {
            return res.status(400).json({
                success: false,
                message: 'Profile already setup'
            });
        }

        const updateData = {
            name: req.body.name,
            bio: req.body.bio,
            photo: req.body.photo,
            backgroundPhoto: req.body.backgroundPhoto,
            gallery: req.body.gallery,
            phone: req.body.phone,
            email: req.body.email,
            website: req.body.website,
            instagram: req.body.instagram,
            facebook: req.body.facebook,
            twitter: req.body.twitter,
            whatsapp: req.body.whatsapp,
            linkedin: req.body.linkedin,
            youtube: req.body.youtube,
            tiktok: req.body.tiktok,
            spotify: req.body.spotify,
            snapchat: req.body.snapchat,
            telegram: req.body.telegram,
            reddit: req.body.reddit,
            threads: req.body.threads,
            discord: req.body.discord,
            portfolio: req.body.portfolio,
            pinterest: req.body.pinterest,
            medium: req.body.medium,
            twitch: req.body.twitch,
            quora: req.body.quora,
            github: req.body.github,
            specialization: req.body.specialization,
            instagramName: req.body.instagramName,
            instagramCategory: req.body.instagramCategory,
            instagramPosts: req.body.instagramPosts,
            instagramFollowers: req.body.instagramFollowers,
            instagramFollowing: req.body.instagramFollowing,
            instagramAccountBio: req.body.instagramAccountBio,
            profileTheme: req.body.profileTheme,
            profileFont: req.body.profileFont,
            bioFont: req.body.bioFont,
            ownerEmail: req.body.ownerEmail,
            ownerUid: req.body.ownerUid,
            isSetup: true,
            updatedAt: Date.now()
        };

        // Remove undefined values
        Object.keys(updateData).forEach(key =>
            updateData[key] === undefined && delete updateData[key]
        );

        const updatedArtist = await Artist.findByIdAndUpdate(
            artist._id,
            updateData,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Profile setup successfully',
            data: updatedArtist
        });
    } catch (error) {
        console.error('Error setting up artist profile:', error);
        res.status(400).json({
            success: false,
            message: 'Error setting up profile',
            error: error.message
        });
    }
});

module.exports = router;
