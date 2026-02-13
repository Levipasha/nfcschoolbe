const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const { studentProfileLimiter } = require('../middleware/rateLimiter');
const { validateStudentId } = require('../middleware/validator');

// @route   GET /api/student/:id
// @desc    Get student profile by ID (public endpoint for NFC scans)
// @access  Public (with rate limiting)
router.get('/:id', studentProfileLimiter, validateStudentId, async (req, res) => {
    try {
        const { id } = req.params;

        // Find student by studentId
        const student = await Student.findOne({
            studentId: id,
            isActive: true
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        // Record the scan
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('user-agent') || 'Unknown';

        await student.recordScan(ipAddress, userAgent);

        // Return student data (excluding sensitive scan history details)
        res.json({
            success: true,
            data: {
                studentId: student.studentId,
                name: student.name,
                rollNumber: student.rollNumber,
                class: student.class,
                photo: student.photo,
                parentName: student.parentName,
                parentPhone: student.parentPhone,
                emergencyContact: student.emergencyContact,
                scanCount: student.scanCount,
                lastScanned: student.lastScanned
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

module.exports = router;
