const express = require('express');
const jwt = require('jsonwebtoken');
const validator = require('validator');
console.log('Artist routes loading...');
const router = express.Router();
const Artist = require('../models/Artist');
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
        const hasProfile = await Artist.findOne({
            isActive: true,
            $or: [ { ownerEmail: re }, { email: re } ]
        });
        if (!hasProfile) {
            return res.status(404).json({ success: false, message: 'No artist profile found with this email. Use the email linked to your artist card.' });
        }
        const otp = generateOtp();
        setOtp(normalized, otp);
        await sendOtpEmail(email, otp);
        res.json({ success: true, message: 'Verification code sent to your email.' });
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
        if (!validator.isEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email.' });
        }
        if (!otp || otp.length !== 6) {
            return res.status(400).json({ success: false, message: 'Please enter the 6-digit code.' });
        }
        const normalized = email.toLowerCase();
        if (!consumeOtp(normalized, otp)) {
            return res.status(400).json({ success: false, message: 'Invalid or expired code. Request a new one.' });
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

        const artist = await Artist.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist not found'
            });
        }

        res.json({
            success: true,
            message: 'Artist deleted successfully',
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

// Quick create new artist (empty profile for NFC)
router.post('/quick-create', async (req, res) => {
    try {
        const artist = new Artist({
            name: 'New Artist',
            isSetup: false
        });
        await artist.save();

        res.status(201).json({
            success: true,
            message: 'Artist container created successfully',
            data: artist
        });
    } catch (error) {
        console.error('Error quick creating artist:', error);
        res.status(400).json({
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
        const artists = await Artist.find(query)
            .sort({ updatedAt: -1 })
            .lean();
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
            specialization: req.body.specialization,
            instagramName: req.body.instagramName,
            instagramCategory: req.body.instagramCategory,
            instagramPosts: req.body.instagramPosts,
            instagramFollowers: req.body.instagramFollowers,
            instagramFollowing: req.body.instagramFollowing,
            instagramAccountBio: req.body.instagramAccountBio,
            profileTheme: req.body.profileTheme,
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
