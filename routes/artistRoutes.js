const express = require('express');
console.log('Artist routes loading...');
const router = express.Router();
const Artist = require('../models/Artist');
const Session = require('../models/Session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for photo uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '..', 'uploads', 'artists');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

// Test route
router.get('/test-route', (req, res) => res.json({ success: true, message: 'Artist route cluster reached' }));

// @route   POST /api/artist/upload-photo
// @desc    Upload artist profile photo
// @access  Public (for setup)
router.post('/upload-photo', (req, res, next) => {
    console.log('Upload photo request received');
    next();
}, upload.single('photo'), (req, res) => {
    try {
        console.log('Multer finished processing');
        if (!req.file) {
            console.log('No file in request');
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const photoUrl = `/uploads/artists/${req.file.filename}`;
        console.log('Upload successful:', photoUrl);
        res.json({ success: true, url: photoUrl });
    } catch (error) {
        console.error('Upload route error:', error);
        res.status(500).json({ success: false, message: error.message });
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
            gallery: req.body.gallery || []
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
