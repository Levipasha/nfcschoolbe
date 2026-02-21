const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
}

/**
 * Upload a buffer (from multer memory storage) to Cloudinary.
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - { folder: string, public_id?: string, resource_type?: 'image'|'video'|'auto' }
 * @returns {Promise<{ url: string, secure_url: string, public_id: string }>}
 */
function uploadBuffer(buffer, options = {}) {
    return new Promise((resolve, reject) => {
        if (!cloudName || !apiKey || !apiSecret) {
            return reject(new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, API_KEY, API_SECRET in .env'));
        }
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
