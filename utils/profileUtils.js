const Artist = require('../models/Artist');
const GeneralProfile = require('../models/GeneralProfile');

/**
 * Checks if a username or email is already taken in either the Artist or GeneralProfile collections.
 * Used to prevent duplicate profiles for the same user or identity.
 * 
 * @param {string} username - The username/ID to check (artistId or username)
 * @param {string} email - The email to check (email or ownerEmail)
 * @param {string|null} excludeId - MongoDB ID to exclude (useful for updates)
 * @returns {Promise<string|null>} Error message if conflict found, null otherwise.
 */
/**
 * Gets detailed conflicts for username and email.
 * Returns an object with 'username' and 'email' keys containing error strings or null.
 */
async function getProfileConflicts(username, email, excludeId = null) {
    const normalizedUsername = (username || '').toLowerCase().trim().replace(/\s+/g, '_');
    const normalizedEmail = (email || '').toLowerCase().trim();

    const result = {
        username: null,
        email: null
    };

    if (normalizedUsername && !/^[a-z0-9_-]+$/.test(normalizedUsername)) {
        result.username = 'Username must contain only letters, numbers, underscores, and hyphens.';
    }

    if (!normalizedUsername && !normalizedEmail) return result;

    // Check Username
    if (normalizedUsername && !result.username) {
        const artistWithUser = await Artist.findOne({ 
            artistId: normalizedUsername, 
            _id: { $ne: excludeId } 
        });
        if (artistWithUser) {
            result.username = 'Username is already taken by an artist.';
        } else {
            const generalWithUser = await GeneralProfile.findOne({ 
                username: normalizedUsername, 
                _id: { $ne: excludeId } 
            });
            if (generalWithUser) {
                result.username = 'Username is already taken.';
            }
        }
    }

    // Check Email
    if (normalizedEmail) {
        const artistWithEmail = await Artist.findOne({ 
            $or: [{ email: normalizedEmail }, { ownerEmail: normalizedEmail }],
            _id: { $ne: excludeId }
        });
        if (artistWithEmail) {
            result.email = 'An account already exists with this email.';
        } else {
            const generalWithEmail = await GeneralProfile.findOne({ 
                ownerEmail: normalizedEmail, 
                _id: { $ne: excludeId } 
            });
            if (generalWithEmail) {
                result.email = 'An account already exists with this email.';
            }
        }
    }

    return result;
}

/**
 * Checks if a username or email is already taken in either the Artist or GeneralProfile collections.
 * Returns the first conflict message found (for backward compatibility).
 */
async function checkProfileConflict(username, email, excludeId = null) {
    const conflicts = await getProfileConflicts(username, email, excludeId);
    return conflicts.username || conflicts.email;
}

/**
 * Generates available username suggestions based on a base username.
 */
async function generateUsernameSuggestions(baseUsername) {
    if (!baseUsername) return [];
    
    const normalizedBase = baseUsername.toLowerCase().trim().replace(/\s+/g, '_');
    const suggestions = [];
    
    const patterns = [
        (b) => `${b}${Math.floor(Math.random() * 99) + 1}`,
        (b) => `${b}_${Math.floor(Math.random() * 99)}`,
        (b) => `${b}${new Date().getFullYear()}`,
        (b) => `the_${b}`,
        (b) => `${b}_nfc`
    ];

    let attempts = 0;
    // We want to find 3 unique suggestions
    while (suggestions.length < 3 && attempts < 20) {
        const pattern = patterns[attempts % patterns.length];
        const candidate = pattern(normalizedBase);
        
        // Alphanumeric + underscores/hyphens only
        if (!/^[a-z0-9_-]+$/.test(candidate)) {
            attempts++;
            continue;
        }

        if (!suggestions.includes(candidate)) {
            const isTaken = await checkProfileConflict(candidate, null);
            if (!isTaken) {
                suggestions.push(candidate);
            }
        }
        attempts++;
    }
    
    return suggestions;
}

module.exports = {
    checkProfileConflict,
    getProfileConflicts,
    generateUsernameSuggestions
};


