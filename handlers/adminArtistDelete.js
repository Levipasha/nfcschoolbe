const mongoose = require('mongoose');
const Artist = require('../models/Artist');
const Session = require('../models/Session');

/**
 * Admin-only: permanently delete an artist by MongoDB _id or by artistId string.
 * Mounted on the root app (server.js) so DELETE is always registered even if adminRoutes is cached/outdated.
 */
async function deleteAdminArtist(req, res) {
    try {
        const raw = String(req.params.id || '').trim();
        if (!raw) {
            return res.status(400).json({
                success: false,
                message: 'Artist id is required'
            });
        }

        let artist = null;
        const looksLikeObjectId = /^[a-fA-F0-9]{24}$/.test(raw);
        if (looksLikeObjectId && mongoose.Types.ObjectId.isValid(raw)) {
            const oid = new mongoose.Types.ObjectId(raw);
            artist = await Artist.findOneAndDelete({
                $or: [{ _id: oid }, { artistId: raw }]
            });
        }
        if (!artist) {
            artist = await Artist.findOneAndDelete({ artistId: raw });
        }

        if (!artist) {
            return res.status(404).json({
                success: false,
                message:
                    'Artist not found. Refresh the admin list. If the row still appears, confirm MONGODB_URI matches this API.'
            });
        }

        await Session.deleteMany({ artistId: artist.artistId }).catch((e) =>
            console.error('Session cleanup error:', e)
        );

        res.json({
            success: true,
            message: 'Artist deleted successfully',
            data: { _id: artist._id, artistId: artist.artistId }
        });
    } catch (error) {
        console.error('Error deleting artist (admin):', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting artist'
        });
    }
}

module.exports = { deleteAdminArtist };
