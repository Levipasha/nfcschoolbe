const express = require('express');
const router = express.Router();
const GeneralProfile = require('../models/GeneralProfile');
const { firebaseAuth } = require('../middleware/firebaseAuth');

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
                theme: profile.theme,
                links: profile.links || [],
                social: profile.social || {}
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
        const profile = await GeneralProfile.findOne({
            $or: [{ ownerUid: uid }, { ownerEmail: email }]
        }).lean();
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
                theme: profile.theme,
                links: profile.links || [],
                social: profile.social || {}
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
        const { username, name, title, bio, photo, theme, links, social } = req.body;

        const existing = await GeneralProfile.findOne({
            $or: [{ ownerUid: uid }, { ownerEmail: email }]
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'You already have a general profile. Use update instead.'
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
            theme: theme || 'mint',
            links: Array.isArray(links) ? links : [],
            social: social || {},
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
                theme: profile.theme,
                links: profile.links,
                social: profile.social
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
        const { username, name, title, bio, photo, theme, links, social } = req.body;

        const profile = await GeneralProfile.findOne({
            $or: [{ ownerUid: uid }, { ownerEmail: email }]
        });
        if (!profile) {
            return res.status(404).json({
                success: false,
                message: 'Profile not found. Create one first.'
            });
        }

        const updates = {};
        if (name !== undefined) updates.name = name;
        if (title !== undefined) updates.title = title;
        if (bio !== undefined) updates.bio = bio;
        if (photo !== undefined) updates.photo = photo;
        if (theme !== undefined) updates.theme = theme;
        if (Array.isArray(links)) updates.links = links;
        if (social && typeof social === 'object') updates.social = { ...profile.social, ...social };

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
                theme: profile.theme,
                links: profile.links,
                social: profile.social
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

module.exports = router;
