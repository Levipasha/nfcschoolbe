const mongoose = require('mongoose');

const artistSchema = new mongoose.Schema({
    artistId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    name: {
        type: String,
        trim: true,
        default: 'New Artist',
        maxlength: [200, 'Artist name cannot exceed 200 characters']
    },
    isSetup: {
        type: Boolean,
        default: false,
        index: true
    },
    code: {
        type: String,
        unique: true,
        index: true
        // Format: AR + number (e.g., AR1, AR2)
    },
    codeNumber: {
        type: Number,
        index: true
    },
    bio: {
        type: String,
        trim: true,
        default: '',
        maxlength: [1000, 'Bio cannot exceed 1000 characters']
    },
    photo: {
        type: String,
        trim: true,
        default: 'https://placehold.co/400x400/6366F1/FFFFFF?text=Artist'
    },
    backgroundPhoto: {
        type: String,
        trim: true,
        default: 'https://placehold.co/1200x400/1e293b/FFFFFF?text=Creative+Background'
    },
    gallery: [{
        url: { type: String, trim: true },
        name: { type: String, trim: true, default: '' }
    }],
    phone: {
        type: String,
        trim: true,
        default: ''
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: ''
    },
    website: {
        type: String,
        trim: true,
        default: ''
    },
    instagram: {
        type: String,
        trim: true,
        default: ''
    },
    facebook: {
        type: String,
        trim: true,
        default: ''
    },
    twitter: {
        type: String,
        trim: true,
        default: ''
    },
    whatsapp: {
        type: String,
        trim: true,
        default: ''
    },
    linkedin: {
        type: String,
        trim: true,
        default: ''
    },
    specialization: {
        type: String,
        trim: true,
        default: ''
        // e.g., Painter, Sculptor, Digital Artist, etc.
    },
    artworkCount: {
        type: Number,
        default: 0
    },
    // Payment / Account Details
    upiId: {
        type: String,
        trim: true,
        default: ''
    },
    bankName: {
        type: String,
        trim: true,
        default: ''
    },
    accountNumber: {
        type: String,
        trim: true,
        default: ''
    },
    ifscCode: {
        type: String,
        trim: true,
        default: ''
    },
    // Instagram Detailed Stats (Self-reported)
    instagramName: {
        type: String,
        trim: true,
        default: ''
    },
    instagramCategory: {
        type: String,
        trim: true,
        default: ''
    },
    instagramPosts: {
        type: String,
        trim: true,
        default: ''
    },
    instagramFollowers: {
        type: String,
        trim: true,
        default: ''
    },
    instagramFollowing: {
        type: String,
        trim: true,
        default: ''
    },
    instagramAccountBio: {
        type: String,
        trim: true,
        default: ''
    },
    // Secure access token for NFC tag
    accessToken: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    scanCount: {
        type: Number,
        default: 0
    },
    lastScanned: {
        type: Date,
        default: null
    },
    // Admin-editable badge overrides (optional). When set, profile uses these for badge display.
    // e.g. { rising: 1, curator: 3, popular: 5, portfolio: 2, connector: 4, legend: 10 }
    badgeOverrides: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({})
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    ownerEmail: {
        type: String,
        trim: true,
        lowercase: true,
        index: true
    },
    ownerUid: {
        type: String,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Auto-generate artist code and ID before validation
artistSchema.pre('validate', async function (next) {
    // Only for new documents
    if (!this.isNew) {
        return next();
    }

    try {
        // 1. Generate Artist ID (AT-01, AT-02, etc.)
        if (!this.artistId) {
            const basePrefix = 'AT-';

            // Find the highest artistId
            const lastArtist = await this.constructor.findOne({
                artistId: new RegExp(`^${basePrefix}\\d+$`)
            }).sort({ artistId: -1 }).lean();

            let nextNumber = 1;
            if (lastArtist && lastArtist.artistId) {
                const match = lastArtist.artistId.match(/\d+$/);
                if (match) {
                    nextNumber = parseInt(match[0]) + 1;
                }
            }

            this.artistId = `${basePrefix}${String(nextNumber).padStart(2, '0')}`;
        }

        // 2. Consistent Artist Code
        if (!this.code) {
            this.code = this.artistId;
            this.codeNumber = parseInt(this.artistId.split('-')[1]);
        }

        next();
    } catch (error) {
        console.error('Error in artist pre-validate hook:', error);
        next(error);
    }
});

// Auto-generate secure access token after save (for NFC tags)
artistSchema.post('save', async function (doc) {
    try {
        // Generate access token if not exists
        if (!doc.accessToken) {
            const AccessToken = mongoose.model('AccessToken');
            const tokenDoc = await AccessToken.createArtistPermanentToken(
                doc.artistId,
                `NFC Tag for Artist ${doc.name}`
            );

            // Save token to artist record
            doc.accessToken = tokenDoc.token;
            await doc.constructor.findByIdAndUpdate(doc._id, {
                accessToken: tokenDoc.token
            });
        }
    } catch (error) {
        console.error('Error in artist post-save hook:', error);
    }
});

// Method to record scan
artistSchema.methods.recordScan = function () {
    this.scanCount += 1;
    this.lastScanned = new Date();
    return this.save();
};

// Method to generate secure NFC URL with token
artistSchema.methods.generateNFCUrl = function (baseUrl = 'http://localhost:5173') {
    if (!this.accessToken) {
        throw new Error('Access token not generated for this artist');
    }
    return `${baseUrl}/artist/${this.accessToken}`;
};

module.exports = mongoose.model('Artist', artistSchema);
