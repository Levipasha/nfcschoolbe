const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Session = require('../models/Session');
const { studentProfileLimiter } = require('../middleware/rateLimiter');
const { validateStudentId } = require('../middleware/validator');

// @route   GET /api/student/:id
// @desc    Get student profile by ID (public endpoint for NFC scans)
// @access  Public (with rate limiting)
router.get('/:id', studentProfileLimiter, validateStudentId, async (req, res) => {
    try {
        const { id } = req.params;

        // Find student by studentId and populate school info
        const student = await Student.findOne({
            studentId: id,
            isActive: true
        }).populate('school', 'name code address phone');

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        // Record the scan
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '0.0.0.0';
        const userAgent = req.get('user-agent') || 'Unknown';
        const referrer = req.get('referer') || req.get('referrer') || 'Direct';

        await student.recordScan(ipAddress, userAgent);

        // Create a new session for this view
        const session = new Session({
            studentId: student.studentId,
            ipAddress,
            userAgent,
            referrer,
            metadata: {
                studentName: student.name,
                rollNumber: student.rollNumber
            }
        });

        await session.save();

        // Broadcast scan event to admin dashboard via WebSocket
        const io = req.app.get('io');
        if (io) {
            io.broadcastStudentScan({
                studentId: student.studentId,
                name: student.name,
                rollNumber: student.rollNumber,
                scanCount: student.scanCount,
                sessionId: session.sessionId,
                deviceType: session.deviceType,
                browser: session.browser
            });
        }

        // Return student data with session ID
        res.json({
            success: true,
            sessionId: session.sessionId, // Return session ID to client
            data: {
                studentId: student.studentId,
                name: student.name,
                rollNumber: student.rollNumber,
                class: student.class,
                age: student.age,
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
            }
        });
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching student data'
        });
    }
});

// @route   POST /api/student/session/:sessionId/action
// @desc    Record an action in a session
// @access  Public
router.post('/session/:sessionId/action', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { action, details } = req.body;

        const session = await Session.findOne({ sessionId });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        await session.recordAction(action, details);

        res.json({
            success: true,
            message: 'Action recorded',
            session: {
                sessionId: session.sessionId,
                pageViews: session.pageViews,
                actions: session.actions
            }
        });
    } catch (error) {
        console.error('Error recording action:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while recording action'
        });
    }
});

// @route   POST /api/student/session/:sessionId/end
// @desc    End a session
// @access  Public
router.post('/session/:sessionId/end', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = await Session.findOne({ sessionId });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        await session.endSession();

        res.json({
            success: true,
            message: 'Session ended',
            session: {
                sessionId: session.sessionId,
                duration: session.duration,
                durationFormatted: session.durationFormatted
            }
        });
    } catch (error) {
        console.error('Error ending session:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while ending session'
        });
    }
});

module.exports = router;

