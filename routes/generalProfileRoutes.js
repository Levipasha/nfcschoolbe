const express = require('express');
const router = express.Router();
const multer = require('multer');
const GeneralProfile = require('../models/GeneralProfile');
const { firebaseAuth } = require('../middleware/firebaseAuth');
const { uploadBuffer } = require('../utils/cloudinary');
const { checkProfileConflict, getProfileConflicts, generateUsernameSuggestions } = require('../utils/profileUtils');
const { sendPublicWelcomeEmail, isConfigured: isSmtpConfigured } = require('../utils/sendMail');
const axios = require('axios');


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// @route   GET /api/general-profile/check-availability
// @desc    Check if username or email is taken (cross-collection)
// @access  Public
router.get('/check-availability', async (req, res) => {
    try {
        const { username, email, excludeId } = req.query;
        const conflicts = await getProfileConflicts(username, email, excludeId);
        const hasConflict = !!(conflicts.username || conflicts.email);
        
        let suggestions = [];
        if (conflicts.username && username) {
            suggestions = await generateUsernameSuggestions(username);
        }

        res.json({ 
            success: true, 
            available: !hasConflict, 
            conflicts: conflicts,
            suggestions: suggestions
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});


// @route   GET /api/general-profile/fetch-metadata
// @desc    Fetch title from a URL
// @access  Public
router.get('/fetch-metadata', async (req, res) => {
    try {
        let { url } = req.query;
        if (!url) return res.status(400).json({ success: false, message: 'URL is required' });
        
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }

        const response = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 8000,
            maxRedirects: 5,
            validateStatus: (status) => status < 500
        });

        if (typeof response.data !== 'string') {
            return res.json({ success: true, title: '' });
        }

        const html = response.data;
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        let title = titleMatch ? titleMatch[1].trim() : '';

        // Decode basic HTML entities if needed (common in titles)
        title = title.replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#039;/g, "'");

        res.json({ success: true, title: title.slice(0, 200) });
    } catch (error) {
        // Silent fail for titles, just return success with empty title
        res.json({ success: true, title: '' });
    }
});


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

function normalizeSuggestionsInput(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .slice(0, 4)
        .map((s) => ({
            url: typeof s?.url === 'string' ? s.url.trim() : '',
            caption: typeof s?.caption === 'string' ? s.caption.trim().slice(0, 200) : '',
            link: typeof s?.link === 'string' ? s.link.trim() : ''
        }))
        .filter((s) => s.url);
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

function mapGeneralProfileResponse(profile, requestedType) {
    if (!profile) return null;
    return {
        username: profile.username,
        name: profile.name,
        title: profile.title,
        specialization: profile.specialization || '',
        city: profile.city || '',
        state: profile.state || '',
        bio: profile.bio,
        phone: profile.phone || '',
        email: profile.email || profile.ownerEmail || '',
        photo: profile.photo,
        banner: profile.banner || '',
        menuPdf: profile.menuPdf || '',
        theme: profile.theme,
        font: profile.font || 'outfit',
        bioFont: profile.bioFont || profile.font || 'outfit',
        links: profile.links || [],
        social: profile.social || {},
        profileType: profile.profileType || requestedType || 'general',
        gallery: normalizeGalleryInput(profile.gallery),
        suggestionsTitle: profile.suggestionsTitle || 'Suggestions',
        suggestions: normalizeSuggestionsInput(profile.suggestions),
        isSetup: profile.isSetup || false,
        showPhoto: profile.showPhoto !== false,
        showName: profile.showName !== false,
        showLocation: profile.showLocation !== false,
        showSpecialization: profile.showSpecialization !== false,
        showAbout: profile.showAbout !== false,
        showConnect: profile.showConnect !== false,
        showWhatIDo: profile.showWhatIDo !== false,
        showArtPortfolio: profile.showArtPortfolio !== false,
        showGallery: profile.showGallery !== false,
        artLinks: profile.artLinks || {}
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
            data: mapGeneralProfileResponse(profile, 'general')
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
            data: mapGeneralProfileResponse(profile, requestedType)
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
        const { username, name, title, bio, phone, email: contactEmail, photo, banner, menuPdf, theme, font, bioFont, links, social, gallery, suggestions, suggestionsTitle, city, state, specialization,
            showPhoto, showName, showLocation, showSpecialization, showAbout, showConnect, showWhatIDo, showArtPortfolio, showGallery, artLinks, isSetup } = req.body;
        const requestedType = normalizeProfileType(req.body.profileType || req.body.type || 'general');

        const normalizedUsername = (username || '').toLowerCase().trim().replace(/\s+/g, '_');
        const conflict = await checkProfileConflict(normalizedUsername, email);
        if (conflict) {
            return res.status(400).json({ success: false, message: conflict });
        }

        const profile = await GeneralProfile.create({
            username: normalizedUsername,

            name: name || '',
            title: title || '',
            specialization: specialization || '',
            city: city || '',
            state: state || '',
            bio: bio || '',
            phone: phone || '',
            email: contactEmail || '',
            photo: photo || '',
            banner: banner || '',
            menuPdf: menuPdf || '',
            theme: theme || 'mint',
            font: font || 'outfit',
            bioFont: bioFont || font || 'outfit',
            links: Array.isArray(links) ? links : [],
            social: social || {},
            gallery: normalizeGalleryInput(gallery),
            suggestionsTitle: suggestionsTitle || 'Suggestions',
            suggestions: normalizeSuggestionsInput(suggestions),
            profileType: requestedType,
            ownerEmail: email,
            ownerUid: uid,
            isSetup: isSetup || false,
            showPhoto: showPhoto !== false,
            showName: showName !== false,
            showLocation: showLocation !== false,
            showSpecialization: showSpecialization !== false,
            showAbout: showAbout !== false,
            showConnect: showConnect !== false,
            showWhatIDo: showWhatIDo !== false,
            showArtPortfolio: showArtPortfolio !== false,
            showGallery: showGallery !== false,
            artLinks: artLinks || {}
        });

        res.json({
            success: true,
            data: mapGeneralProfileResponse(profile, requestedType)
        });

        // Send public welcome email asynchronously
        if (isSmtpConfigured()) {
            sendPublicWelcomeEmail(email, profile.name, profile.username, profile.profileType).catch(err => {
                console.error(`Error sending public welcome email to ${profile.profileType}:`, err.message);
            });
        }
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
        const { username, name, title, bio, phone, email: contactEmail, photo, banner, menuPdf, theme, font, bioFont, links, social, gallery, suggestions, suggestionsTitle, city, state, specialization,
            showPhoto, showName, showLocation, showSpecialization, showAbout, showConnect, showWhatIDo, showArtPortfolio, showGallery, artLinks, isSetup } = req.body;
        const requestedType = normalizeProfileType(req.body.profileType || req.body.type || 'general');

        const ownerCond = { $or: [{ ownerUid: uid }, { ownerEmail: email }] };
        const typeCond = buildTypeQueryCond(requestedType);
        let profile = await GeneralProfile.findOne({ $and: [ownerCond, typeCond] });
        // One document per username: upgrading "general" → "restaurant" must update the same row.
        if (!profile && requestedType === 'restaurant') {
            profile = await GeneralProfile.findOne(ownerCond);
        }
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
        if (phone !== undefined) updates.phone = phone;
        if (contactEmail !== undefined) updates.email = contactEmail;
        if (photo !== undefined) updates.photo = photo;
        if (banner !== undefined) updates.banner = banner;
        if (menuPdf !== undefined) updates.menuPdf = menuPdf;
        if (theme !== undefined) updates.theme = theme;
        if (font !== undefined) updates.font = font;
        if (bioFont !== undefined) updates.bioFont = bioFont;
        if (Array.isArray(links)) updates.links = links;
        if (social && typeof social === 'object') updates.social = { ...profile.social, ...social };
        if (gallery !== undefined) updates.gallery = normalizeGalleryInput(gallery);
        if (suggestionsTitle !== undefined) updates.suggestionsTitle = suggestionsTitle;
        if (suggestions !== undefined) updates.suggestions = normalizeSuggestionsInput(suggestions);
        if (city !== undefined) updates.city = city;
        if (state !== undefined) updates.state = state;
        if (specialization !== undefined) updates.specialization = specialization;
        if (showPhoto !== undefined) updates.showPhoto = showPhoto;
        if (showName !== undefined) updates.showName = showName;
        if (showLocation !== undefined) updates.showLocation = showLocation;
        if (showSpecialization !== undefined) updates.showSpecialization = showSpecialization;
        if (showAbout !== undefined) updates.showAbout = showAbout;
        if (showConnect !== undefined) updates.showConnect = showConnect;
        if (showWhatIDo !== undefined) updates.showWhatIDo = showWhatIDo;
        if (showArtPortfolio !== undefined) updates.showArtPortfolio = showArtPortfolio;
        if (showGallery !== undefined) updates.showGallery = showGallery;
        if (artLinks !== undefined) updates.artLinks = artLinks;
        if (isSetup !== undefined) updates.isSetup = isSetup;

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
            data: mapGeneralProfileResponse(profile, requestedType)
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
            data: mapGeneralProfileResponse(profile, 'general')
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
