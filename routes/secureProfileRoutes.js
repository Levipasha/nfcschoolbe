const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Artist = require('../models/Artist');
const Session = require('../models/Session');
const AccessToken = require('../models/AccessToken');
const { studentProfileLimiter } = require('../middleware/rateLimiter');

// @route   GET /api/p/:token
// @desc    Get profile by secure token (SECURE - NO ID EXPOSURE)
// @access  Public (with rate limiting)
router.get('/:token', studentProfileLimiter, async (req, res) => {
    try {
        const { token } = req.params;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('user-agent') || 'Unknown';

        // Verify token
        let accessToken;
        try {
            accessToken = await AccessToken.verifyAndUse(token, ipAddress, userAgent);
        } catch (error) {
            return res.status(403).json({
                success: false,
                message: error.message || 'Invalid or expired access token'
            });
        }

        let profileData = null;
        let entityId = null;
        let displayName = '';
        let displaySubtitle = '';

        if (accessToken.entityType === 'artist') {
            // Find artist
            const artist = await Artist.findOne({
                artistId: accessToken.artistId,
                isActive: true
            });

            if (!artist) {
                return res.status(404).json({
                    success: false,
                    message: 'Artist profile not found or inactive'
                });
            }

            await artist.recordScan();
            entityId = artist.artistId;
            displayName = artist.name;
            displaySubtitle = artist.specialization;

            profileData = {
                type: 'artist',
                name: artist.name,
                code: artist.code,
                bio: artist.bio,
                photo: artist.photo,
                phone: artist.phone,
                email: artist.email,
                website: artist.website,
                instagram: artist.instagram,
                facebook: artist.facebook,
                twitter: artist.twitter,
                specialization: artist.specialization,
                scanCount: artist.scanCount,
                lastScanned: artist.lastScanned
            };
        } else {
            // Default to student
            const student = await Student.findOne({
                studentId: accessToken.studentId,
                isActive: true
            }).populate('school', 'name code address phone');

            if (!student) {
                return res.status(404).json({
                    success: false,
                    message: 'Student profile not found or inactive'
                });
            }

            await student.recordScan(ipAddress, userAgent);
            entityId = student.studentId;
            displayName = student.name;
            displaySubtitle = student.rollNumber;

            profileData = {
                type: 'student',
                name: student.name,
                rollNumber: student.rollNumber,
                class: student.class,
                photo: student.photo,
                bloodGroup: student.bloodGroup,
                motherName: student.motherName,
                fatherName: student.fatherName,
                motherPhone: student.motherPhone,
                fatherPhone: student.fatherPhone,
                address: student.address,
                scanCount: student.scanCount,
                lastScanned: student.lastScanned,
                school: student.school
            };
        }

        // Record session
        const referrer = req.get('referer') || req.get('referrer') || 'Direct';
        const sessionData = {
            ipAddress,
            userAgent,
            referrer,
            metadata: {
                name: displayName,
                subtitle: displaySubtitle,
                entityType: accessToken.entityType,
                accessToken: token.substring(0, 10) + '...'
            }
        };

        if (accessToken.entityType === 'artist') {
            sessionData.artistId = entityId;
        } else {
            sessionData.studentId = entityId;
        }

        const session = new Session(sessionData);
        await session.save();

        // Broadcast scan event to admin dashboard
        const io = req.app.get('io');
        if (io) {
            if (accessToken.entityType === 'artist') {
                io.broadcastArtistScan({
                    artistId: entityId,
                    name: displayName,
                    scanCount: profileData.scanCount,
                    deviceType: session.deviceType,
                    sessionId: session.sessionId
                });
            } else {
                io.broadcastStudentScan({
                    studentId: entityId,
                    name: displayName,
                    rollNumber: displaySubtitle,
                    scanCount: profileData.scanCount,
                    sessionId: session.sessionId
                });
            }
        }

        res.json({
            success: true,
            sessionId: session.sessionId,
            data: profileData
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching profile'
        });
    }
});

module.exports = router;
