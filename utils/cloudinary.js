const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// Support both CLOUDINARY_* and alternate names; trim in case .env has spaces
function getConfig() {
    const trim = (v) => (typeof v === 'string' ? v.trim() : v) || undefined;
    return {
        cloudName: trim(process.env.CLOUDINARY_CLOUD_NAME),
        apiKey: trim(process.env.CLOUDINARY_API_KEY || process.env.API_KEY),
        apiSecret: trim(process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET)
    };
}

const cached = getConfig();
if (cached.cloudName && cached.apiKey && cached.apiSecret) {
    cloudinary.config({ cloud_name: cached.cloudName, api_key: cached.apiKey, api_secret: cached.apiSecret });
}

/**
 * Upload a buffer (from multer memory storage) to Cloudinary.
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - { folder: string, public_id?: string, resource_type?: 'image'|'video'|'auto' }
 * @returns {Promise<{ url: string, secure_url: string, public_id: string }>}
 */
function uploadBuffer(buffer, options = {}) {
    return new Promise((resolve, reject) => {
        const cfg = getConfig();
        if (!cfg.cloudName || !cfg.apiKey || !cfg.apiSecret) {
            const missing = [];
            if (!cfg.cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
            if (!cfg.apiKey) missing.push('CLOUDINARY_API_KEY');
            if (!cfg.apiSecret) missing.push('CLOUDINARY_API_SECRET');
            return reject(new Error('Cloudinary is not configured. Set in nfcschoolbe/.env: ' + missing.join(', ')));
        }
        cloudinary.config({ cloud_name: cfg.cloudName, api_key: cfg.apiKey, api_secret: cfg.apiSecret });
        const folder = options.folder || 'nfc';
        const resourceType = options.resource_type || 'image';
        const uploadOptions = { folder, resource_type: resourceType };
        if (options.public_id) uploadOptions.public_id = options.public_id;

        const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, result) => {
            if (err) return reject(err);
            resolve({
                url: result.secure_url,
                secure_url: result.secure_url,
                public_id: result.public_id
            });
        });
        const readable = Readable.from(buffer);
        readable.pipe(stream);
    });
}

module.exports = { cloudinary, uploadBuffer };
