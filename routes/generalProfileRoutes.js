const express = require('express');
const router = express.Router();
const multer = require('multer');
const GeneralProfile = require('../models/GeneralProfile');
const { firebaseAuth } = require('../middleware/firebaseAuth');
const { uploadBuffer } = require('../utils/cloudinary');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function normalizeGalleryInput(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .slice(0, 3)
        .map((g) => ({
            url: typeof g?.url === 'string' ? g.url.trim() : '',
            name: typeof g?.name === 'string' ? g.name.trim().slice(0, 200) : ''
        }))
        .filter((g) => g.url);
}

function normalizeProfileType(raw) {
    const v = String(raw || '').toLowerCase().trim();
    if (v === 'restaurant' || v === 'resturent' || v === 'resturant') return 'restaurant';
    return 'general';
}

// Handles legacy documents that don't have `profileType` by inferring from `menuPdf`.
function buildTypeQueryCond(requestedType) {
    if (requestedType === 'restaurant') {
        return {
            $or: [
                { profileType: 'restaurant' },
                {
                    $and: [
                        { $or: [{ profileType: { $exists: false } }, { profileType: null }] },
                        { menuPdf: { $exists: true, $ne: '' } }
                    ]
                }
            ]
        };
    }

    // general
    return {
        $or: [
            { profileType: 'general' },
            {
                $and: [
                    { $or: [{ profileType: { $exists: false } }, { profileType: null }] },
                    { $or: [{ menuPdf: { $exists: false } }, { menuPdf: '' }] }
                ]
            }
        ]
    };
}

// @route   POST /api/general-profile/upload-pdf
// @desc    Upload menu PDF to Cloudinary (for restaurant profiles)
// @access  Private (Firebase)
router.post('/upload-pdf', firebaseAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const result = await uploadBuffer(req.file.buffer, {
            folder: 'nfc/restaurant-menus',
            resource_type: 'raw'
        });
        res.json({ success: true, url: result.secure_url });
    } catch (error) {
        console.error('PDF upload error:', error);
        res.status(500).json({ success: false, message: error.message || 'Upload failed' });
    }
});

// @route   GET /api/general-profile/u/:username
// @desc    Get public profile by username (for shareable link)
// @access  Public
router.get('/u/:username', async (req, res) => {
    try {
        const username = req.params.username.toLowerCase().trim();
        const profile = await GeneralProfile.findOne({ username }).lean();
        if (!profile) {
            return res.status(404).json({
                success: false,
                message: 'Profile not found'
            });
        }
        res.json({
            success: true,
            data: {
                username: profile.username,
                name: profile.name,
                title: profile.title,
                bio: profile.bio,
                photo: profile.photo,
                menuPdf: profile.menuPdf || '',
                theme: profile.theme,
                font: profile.font || 'outfit',
                bioFont: profile.bioFont || profile.font || 'outfit',
                links: profile.links || [],
                social: profile.social || {},
                profileType: profile.profileType || 'general',
                gallery: normalizeGalleryInput(profile.gallery)
            }
        });
    } catch (error) {
        console.error('Error fetching general profile:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/general-profile/me
// @desc    Get current user's general profile
// @access  Private (Firebase)
router.get('/me', firebaseAuth, async (req, res) => {
    try {
        const { uid, email } = req.firebaseUser;

        const requestedType = normalizeProfileType(req.query.type || req.query.profileType || 'general');
        const ownerCond = { $or: [{ ownerUid: uid }, { ownerEmail: email }] };
        const typeCond = buildTypeQueryCond(requestedType);

        const profile = await GeneralProfile.findOne({ $and: [ownerCond, typeCond] }).lean();
        if (!profile) {
            return res.json({ success: true, data: null });
        }
        res.json({
            success: true,
            data: {
                username: profile.username,
                name: profile.name,
                title: profile.title,
                bio: profile.bio,
                photo: profile.photo,
                menuPdf: profile.menuPdf || '',
                theme: profile.theme,
                font: profile.font || 'outfit',
                bioFont: profile.bioFont || profile.font || 'outfit',
                links: profile.links || [],
                social: profile.social || {},
                profileType: profile.profileType || requestedType,
                gallery: normalizeGalleryInput(profile.gallery)
            }
        });
    } catch (error) {
        console.error('Error fetching my general profile:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/general-profile
// @desc    Create new general profile
// @access  Private (Firebase)
router.post('/', firebaseAuth, async (req, res) => {
    try {
        const { uid, email } = req.firebaseUser;
        const { username, name, title, bio, photo, menuPdf, theme, font, bioFont, links, social } = req.body;
        const requestedType = normalizeProfileType(req.body.profileType || req.body.type || 'general');

        const ownerCond = { $or: [{ ownerUid: uid }, { ownerEmail: email }] };
        const typeCond = buildTypeQueryCond(requestedType);
        const existing = await GeneralProfile.findOne({ $and: [ownerCond, typeCond] });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `You already have a ${requestedType} profile. Use update instead.`
            });
        }

        const normalizedUsername = (username || '').toLowerCase().trim().replace(/\s+/g, '_');
        if (!normalizedUsername || !/^[a-z0-9_-]+$/.test(normalizedUsername)) {
            return res.status(400).json({
                success: false,
                message: 'Username must contain only letters, numbers, underscores, and hyphens.'
            });
        }

        const taken = await GeneralProfile.findOne({ username: normalizedUsername });
        if (taken) {
            return res.status(400).json({
                success: false,
                message: 'Username is already taken.'
            });
        }

        const profile = await GeneralProfile.create({
            username: normalizedUsername,
            name: name || '',
            title: title || '',
            bio: bio || '',
            photo: photo || '',
            menuPdf: menuPdf || '',
            theme: theme || 'mint',
            font: font || 'outfit',
            bioFont: bioFont || font || 'outfit',
            links: Array.isArray(links) ? links : [],
            social: social || {},
            gallery: normalizeGalleryInput(gallery),
            profileType: requestedType,
            ownerEmail: email,
            ownerUid: uid
        });

        res.json({
            success: true,
            data: {
                username: profile.username,
                name: profile.name,
                title: profile.title,
                bio: profile.bio,
                photo: profile.photo,
                menuPdf: profile.menuPdf || '',
                theme: profile.theme,
                font: profile.font || 'outfit',
                bioFont: profile.bioFont || profile.font || 'outfit',
                links: profile.links,
                social: profile.social,
                profileType: profile.profileType,
                gallery: normalizeGalleryInput(profile.gallery)
            }
        });
    } catch (error) {
        console.error('Error creating general profile:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error'
        });
    }
});

// @route   PUT /api/general-profile/me
// @desc    Update current user's general profile
// @access  Private (Firebase)
router.put('/me', firebaseAuth, async (req, res) => {
    try {
        const { uid, email } = req.firebaseUser;
        const { username, name, title, bio, photo, menuPdf, theme, font, bioFont, links, social, gallery } = req.body;
        const requestedType = normalizeProfileType(req.body.profileType || req.body.type || 'general');

        const ownerCond = { $or: [{ ownerUid: uid }, { ownerEmail: email }] };
        const typeCond = buildTypeQueryCond(requestedType);
        const profile = await GeneralProfile.findOne({ $and: [ownerCond, typeCond] });
        if (!profile) {
            return res.status(404).json({
                success: false,
                message: 'Profile not found. Create one first.'
            });
        }

        const updates = {};
        updates.profileType = requestedType;
        if (name !== undefined) updates.name = name;
        if (title !== undefined) updates.title = title;
        if (bio !== undefined) updates.bio = bio;
        if (photo !== undefined) updates.photo = photo;
        if (menuPdf !== undefined) updates.menuPdf = menuPdf;
        if (theme !== undefined) updates.theme = theme;
        if (font !== undefined) updates.font = font;
        if (bioFont !== undefined) updates.bioFont = bioFont;
        if (Array.isArray(links)) updates.links = links;
        if (social && typeof social === 'object') updates.social = { ...profile.social, ...social };
        if (gallery !== undefined) updates.gallery = normalizeGalleryInput(gallery);

        if (username !== undefined) {
            const normalizedUsername = (username || '').toLowerCase().trim().replace(/\s+/g, '_');
            if (!normalizedUsername || !/^[a-z0-9_-]+$/.test(normalizedUsername)) {
                return res.status(400).json({
                    success: false,
                    message: 'Username must contain only letters, numbers, underscores, and hyphens.'
                });
            }
            if (normalizedUsername !== profile.username) {
                const taken = await GeneralProfile.findOne({ username: normalizedUsername });
                if (taken) {
                    return res.status(400).json({
                        success: false,
                        message: 'Username is already taken.'
                    });
                }
                updates.username = normalizedUsername;
            }
        }

        Object.assign(profile, updates);
        await profile.save();

        res.json({
            success: true,
            data: {
                username: profile.username,
                name: profile.name,
                title: profile.title,
                bio: profile.bio,
                photo: profile.photo,
                menuPdf: profile.menuPdf || '',
                theme: profile.theme,
                font: profile.font || 'outfit',
                bioFont: profile.bioFont || profile.font || 'outfit',
                links: profile.links,
                social: profile.social,
                profileType: profile.profileType
            }
        });
    } catch (error) {
        console.error('Error updating general profile:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error'
        });
    }
});

// @route   DELETE /api/general-profile/me
// @desc    Delete current user's general profile
// @access  Private (Firebase)
router.delete('/me', firebaseAuth, async (req, res) => {
    try {
        const { uid, email } = req.firebaseUser;
        const requestedType = normalizeProfileType(req.query.type || req.query.profileType || 'general');
        const ownerCond = { $or: [{ ownerUid: uid }, { ownerEmail: email }] };
        const typeCond = buildTypeQueryCond(requestedType);
        const profile = await GeneralProfile.findOneAndDelete({ $and: [ownerCond, typeCond] });
        if (!profile) {
            return res.status(404).json({
                success: false,
                message: 'Profile not found.'
            });
        }
        res.json({
            success: true,
            message: 'General profile erased successfully.'
        });
    } catch (error) {
        console.error('Error deleting general profile:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during deletion.'
        });
    }
});

// @route   GET /api/general-profile/sample
// @desc    Get a single public general profile (used by public showcase pages)
// @access  Public
router.get('/sample', async (req, res) => {
    try {
        const profile = await GeneralProfile.findOne({}).lean();

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: 'No general profiles found'
            });
        }

        res.json({
            success: true,
            data: {
                username: profile.username,
                name: profile.name,
                title: profile.title,
                bio: profile.bio,
                photo: profile.photo,
                menuPdf: profile.menuPdf || '',
                theme: profile.theme,
                font: profile.font || 'outfit',
                bioFont: profile.bioFont || profile.font || 'outfit',
                links: profile.links || [],
                social: profile.social || {},
                profileType: profile.profileType || 'general',
                gallery: normalizeGalleryInput(profile.gallery)
            }
        });
    } catch (error) {
        console.error('Error fetching sample general profile:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching sample general profile'
        });
    }
});

module.exports = router;
