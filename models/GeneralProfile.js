const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
    title: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, required: true },
    platform: { type: String, trim: true, default: '' }, // website, portfolio, pinterest, instagram, youtube, etc.
    order: { type: Number, default: 0 }
});

const generalProfileSchema = new mongoose.Schema({
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
    bio: { type: String, trim: true, default: '' },
    photo: { type: String, trim: true, default: '' },
    theme: {
        type: String,
        trim: true,
        default: 'mint',
        enum: ['mono', 'gradient', 'brown', 'beige', 'green', 'grey', 'wood', 'purple', 'mint']
    },
    links: [linkSchema],
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
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

generalProfileSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('GeneralProfile', generalProfileSchema);
