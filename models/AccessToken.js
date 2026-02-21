const mongoose = require('mongoose');
const crypto = require('crypto');

const AccessTokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    studentId: {
        type: String,
        ref: 'Student',
        index: true
    },
    artistId: {
        type: String,
        ref: 'Artist',
        index: true
    },
    entityType: {
        type: String,
        enum: ['student', 'artist'],
        default: 'student',
        required: true
    },
    // Token type
    type: {
        type: String,
        enum: ['permanent', 'temporary', 'one-time'],
        default: 'permanent'
    },
    // For one-time tokens
    isUsed: {
        type: Boolean,
        default: false
    },
    usedAt: {
        type: Date
    },
    // For temporary tokens
    expiresAt: {
        type: Date
    },
    // Security
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    // Usage tracking
    accessCount: {
        type: Number,
        default: 0
    },
    lastAccessedAt: {
        type: Date
    },
    // Metadata
    createdBy: {
        type: String,
        default: 'system'
    },
    notes: {
        type: String
    }
}, {
    timestamps: true
});

// Index for cleanup of expired tokens
AccessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Generate a secure random token
AccessTokenSchema.statics.generateToken = function () {
    return crypto.randomBytes(32).toString('base64url');
};

// Create a permanent token for a student (for NFC tag)
AccessTokenSchema.statics.createPermanentToken = async function (studentId, notes = null) {
    const token = this.generateToken();

    return await this.create({
        token,
        studentId,
        type: 'permanent',
        notes: notes || 'NFC Tag Token',
        createdBy: 'admin'
    });
};

// Create a permanent token for an artist (for NFC tag)
AccessTokenSchema.statics.createArtistPermanentToken = async function (artistId, notes = null) {
    const token = this.generateToken();

    return await this.create({
        token,
        artistId,
        entityType: 'artist',
        type: 'permanent',
        notes: notes || 'Artist NFC Tag Token',
        createdBy: 'admin'
    });
};

// Create a temporary token (expires in X hours)
AccessTokenSchema.statics.createTemporaryToken = async function (id, entityType = 'student', hoursValid = 24) {
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + hoursValid);

    const data = {
        token,
        entityType,
        type: 'temporary',
        expiresAt,
        notes: `Temporary access (${hoursValid}h)`,
        createdBy: 'system'
    };

    if (entityType === 'student') data.studentId = id;
    else data.artistId = id;

    return await this.create(data);
};

// Create a one-time use token
AccessTokenSchema.statics.createOneTimeToken = async function (studentId) {
    const token = this.generateToken();

    return await this.create({
        token,
        studentId,
        type: 'one-time',
        notes: 'One-time access token',
        createdBy: 'system'
    });
};

// Verify and use a token
AccessTokenSchema.statics.verifyAndUse = async function (token, ipAddress = null, userAgent = null) {
    const accessToken = await this.findOne({ token });

    if (!accessToken) {
        throw new Error('Invalid token');
    }

    // Check if token is already used (one-time tokens)
    if (accessToken.type === 'one-time' && accessToken.isUsed) {
        throw new Error('Token has already been used');
    }

    // Check if token is expired (temporary tokens)
    if (accessToken.type === 'temporary' && accessToken.expiresAt < new Date()) {
        throw new Error('Token has expired');
    }

    // Update token usage
    accessToken.accessCount += 1;
    accessToken.lastAccessedAt = new Date();

    if (ipAddress) accessToken.ipAddress = ipAddress;
    if (userAgent) accessToken.userAgent = userAgent;

    // Mark one-time tokens as used
    if (accessToken.type === 'one-time') {
        accessToken.isUsed = true;
        accessToken.usedAt = new Date();
    }

    await accessToken.save();

    return accessToken;
};

// Get all tokens for an entity
AccessTokenSchema.statics.getTokens = async function (id, entityType = 'student') {
    const query = entityType === 'student' ? { studentId: id } : { artistId: id };
    return await this.find(query).sort({ createdAt: -1 });
};

// Get all tokens for a student (keeping for backward compatibility)
AccessTokenSchema.statics.getStudentTokens = async function (studentId) {
    return await this.getTokens(studentId, 'student');
};

// Revoke a token
AccessTokenSchema.methods.revoke = async function () {
    await this.deleteOne();
};

// Check if token is valid
AccessTokenSchema.methods.isValid = function () {
    // One-time token already used
    if (this.type === 'one-time' && this.isUsed) {
        return false;
    }

    // Temporary token expired
    if (this.type === 'temporary' && this.expiresAt < new Date()) {
        return false;
    }

    return true;
};

// Get token info for display
AccessTokenSchema.methods.getInfo = function () {
    return {
        token: this.token.substring(0, 10) + '...',
        type: this.type,
        isValid: this.isValid(),
        accessCount: this.accessCount,
        createdAt: this.createdAt,
        expiresAt: this.expiresAt,
        lastAccessedAt: this.lastAccessedAt
    };
};

module.exports = mongoose.model('AccessToken', AccessTokenSchema);
