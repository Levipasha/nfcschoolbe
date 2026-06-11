const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
    title: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
    platform: { type: String, trim: true, default: '' }, // website, portfolio, pinterest, instagram, youtube, etc.
    image: { type: String, trim: true, default: '' },
    layoutType: { type: String, trim: true, default: 'classic' },
    prioritizeType: { type: String, trim: true, default: 'none' }, // 'none', 'animate', 'redirect'
    animationType: { type: String, trim: true, default: 'buzz' }, // 'buzz', 'wobble', 'pop', 'swipe'
    clicks: { type: Number, default: 0 },
    order: { type: Number, default: 0 }
});

const generalProfileSchema = new mongoose.Schema({
    profileType: {
        type: String,
        trim: true,
        default: 'general',
        enum: ['general', 'restaurant'],
        index: true
    },
    username: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
        trim: true,
        lowercase: true,
        required: true,
        match: /^[a-z0-9_-]+$/
    },
    name: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, default: '' }, // e.g. "Company owner"
    specialization: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    photo: { type: String, trim: true, default: '' },
    banner: { type: String, trim: true, default: '' },
    menuPdf: { type: String, trim: true, default: '' },
    theme: {
        type: String,
        trim: true,
        default: 'mint'
    },
    font: {
        type: String,
        trim: true,
        default: 'outfit'
    },
    bioFont: {
        type: String,
        trim: true,
        default: 'outfit'
    },
    links: [linkSchema],
    showPhoto: { type: Boolean, default: true },
    showName: { type: Boolean, default: true },
    showLocation: { type: Boolean, default: true },
    showSpecialization: { type: Boolean, default: true },
    showAbout: { type: Boolean, default: true },
    showConnect: { type: Boolean, default: true },
    showWhatIDo: { type: Boolean, default: true },
    showArtPortfolio: { type: Boolean, default: true },
    showGallery: { type: Boolean, default: true },
    artLinks: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    /** Suggestions section — max 4 items with image, caption, and link */
    suggestionsTitle: { type: String, trim: true, default: 'Suggestions' },
    suggestions: [{
        url: { type: String, trim: true, default: '' },
        caption: { type: String, trim: true, default: '' },
        link: { type: String, trim: true, default: '' }
    }],
    /** Restaurant (and optional general) image gallery — max 3 on client */
    gallery: [{
        url: { type: String, trim: true, default: '' },
        name: { type: String, trim: true, default: '' }
    }],
    social: {
        instagram: { type: String, trim: true, default: '' },
        twitter: { type: String, trim: true, default: '' },
        youtube: { type: String, trim: true, default: '' },
        spotify: { type: String, trim: true, default: '' },
        tiktok: { type: String, trim: true, default: '' },
        linkedin: { type: String, trim: true, default: '' },
        pinterest: { type: String, trim: true, default: '' }
    },
    ownerEmail: { type: String, trim: true, lowercase: true, index: true },
    ownerUid: { type: String, index: true },
    isSetup: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

generalProfileSchema.index({ username: 1 }, { unique: true });
generalProfileSchema.index({ ownerUid: 1, profileType: 1 });
generalProfileSchema.index({ ownerEmail: 1, profileType: 1 });

module.exports = mongoose.model('GeneralProfile', generalProfileSchema);
