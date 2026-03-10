const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const validator = require('validator');
const Student = require('../models/Student');
const School = require('../models/School');
const Artist = require('../models/Artist');
const authMiddleware = require('../middleware/auth');
const { adminLimiter, loginLimiter } = require('../middleware/rateLimiter');
const { validateStudentData } = require('../middleware/validator');
const { generateOtp, setAdminOtp, consumeAdminOtp } = require('../utils/otpStore');
const { sendOtpEmail, isConfigured: isSmtpConfigured } = require('../utils/sendMail');

// Only this email is allowed for admin login (no passwords, no usernames)
const ALLOWED_ADMIN_EMAIL = 'skywebdevelopers123@gmail.com';

// @route   POST /api/admin/send-otp
// @desc    Send OTP to allowed admin email
// @access  Public
router.post('/send-otp', loginLimiter, async (req, res) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        if (!validator.isEmail(email)) {
            return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
        }
        if (email !== ALLOWED_ADMIN_EMAIL) {
            return res.status(403).json({ success: false, message: 'This email is not authorized for admin access.' });
        }
        if (!isSmtpConfigured()) {
            return res.status(503).json({ success: false, message: 'Email service is not configured. Contact support.' });
        }
        const otp = generateOtp();
        setAdminOtp(email, otp);
        await sendOtpEmail(email, otp, {
            subject: 'Your admin login code – NFC School',
            textPrefix: 'Your admin verification code',
            subtitle: 'Admin login verification'
        });
        res.json({ success: true, message: 'Verification code sent to your email.' });
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to send code.' });
    }
});

// @route   POST /api/admin/verify-otp
// @desc    Verify OTP and return admin JWT
// @access  Public
router.post('/verify-otp', loginLimiter, async (req, res) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        const otp = (req.body.otp || '').trim();
        if (!validator.isEmail(email) || email !== ALLOWED_ADMIN_EMAIL) {
            return res.status(400).json({ success: false, message: 'Invalid email.' });
        }
        if (!otp || otp.length !== 6) {
            return res.status(400).json({ success: false, message: 'Please enter the 6-digit code.' });
        }
        if (!consumeAdminOtp(email, otp)) {
            return res.status(400).json({ success: false, message: 'Invalid or expired code. Request a new one.' });
        }
        const token = jwt.sign(
            { email, type: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({
            success: true,
            message: 'Login successful',
            token,
            admin: { email }
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ success: false, message: error.message || 'Verification failed.' });
    }
});

// @route   GET /api/admin/students
// @desc    Get all students
// @access  Protected
router.get('/students', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', status = 'all' } = req.query;

        const query = {};

        // Filter by active status
        if (status === 'active') {
            query.isActive = true;
        } else if (status === 'inactive') {
            query.isActive = false;
        }

        // Search functionality
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { rollNumber: { $regex: search, $options: 'i' } },
                { studentId: { $regex: search, $options: 'i' } }
            ];
        }

        const students = await Student.find(query)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 })
            .select('-scanHistory'); // Exclude detailed scan history

        const count = await Student.countDocuments(query);

        res.json({
            success: true,
            data: students,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            total: count
        });
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching students'
        });
    }
});

// @route   POST /api/admin/students
// @desc    Add new student
// @access  Protected
router.post('/students', authMiddleware, adminLimiter, validateStudentData, async (req, res) => {
    try {
        const studentData = req.body;

        // Check if roll number already exists
        const existingStudent = await Student.findOne({ rollNumber: studentData.rollNumber });
        if (existingStudent) {
            return res.status(400).json({
                success: false,
                message: 'A student with this roll number already exists'
            });
        }

        const student = new Student(studentData);
        await student.save();

        res.status(201).json({
            success: true,
            message: 'Student added successfully',
            data: student,
            nfcUrl: student.generateNFCUrl(process.env.FRONTEND_URL || 'http://localhost:5173')
        });
    } catch (error) {
        console.error('Error adding student:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Student with this roll number or ID already exists'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while adding student'
        });
    }
});

// @route   GET /api/admin/students/:id
// @desc    Get single student with full details
// @access  Protected
router.get('/students/:id', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const student = await Student.findOne({ studentId: req.params.id });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        res.json({
            success: true,
            data: student,
            nfcUrl: student.generateNFCUrl(process.env.FRONTEND_URL || 'http://localhost:5173')
        });
    } catch (error) {
        console.error('Error fetching student:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching student'
        });
    }
});

// @route   PUT /api/admin/students/:id
// @desc    Update student
// @access  Protected
router.put('/students/:id', authMiddleware, adminLimiter, validateStudentData, async (req, res) => {
    try {
        const student = await Student.findOne({ studentId: req.params.id });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        // Check if roll number is being changed and if it already exists
        if (req.body.rollNumber && req.body.rollNumber !== student.rollNumber) {
            const existingStudent = await Student.findOne({ rollNumber: req.body.rollNumber });
            if (existingStudent) {
                return res.status(400).json({
                    success: false,
                    message: 'A student with this roll number already exists'
                });
            }
        }

        // Update fields
        Object.assign(student, req.body);
        await student.save();

        res.json({
            success: true,
            message: 'Student updated successfully',
            data: student
        });
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating student'
        });
    }
});

// @route   DELETE /api/admin/students/:id
// @desc    Delete student
// @access  Protected
router.delete('/students/:id', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const student = await Student.findOneAndDelete({ studentId: req.params.id });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        res.json({
            success: true,
            message: 'Student deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting student'
        });
    }
});

// @route   POST /api/admin/students/:id/toggle-status
// @desc    Enable/Disable student tag
// @access  Protected
router.post('/students/:id/toggle-status', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const student = await Student.findOne({ studentId: req.params.id });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        student.isActive = !student.isActive;
        await student.save();

        res.json({
            success: true,
            message: `Student tag ${student.isActive ? 'enabled' : 'disabled'} successfully`,
            data: student
        });
    } catch (error) {
        console.error('Error toggling student status:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while toggling student status'
        });
    }
});

// ---------- Artists (admin: list, get, update e.g. badges) ----------
// @route   GET /api/admin/artists
// @desc    Get all artists
// @access  Protected
router.get('/artists', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const { search = '' } = req.query;
        const query = {};
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { artistId: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        const artists = await Artist.find(query)
            .sort({ createdAt: -1 })
            .select('artistId name code email isSetup scanCount badgeOverrides isActive createdAt');
        res.json({
            success: true,
            data: artists,
            total: artists.length
        });
    } catch (error) {
        console.error('Error fetching artists:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching artists'
        });
    }
});

// @route   GET /api/admin/artists/:id
// @desc    Get single artist (MongoDB _id)
// @access  Protected
router.get('/artists/:id', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const artist = await Artist.findById(req.params.id);
        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist not found'
            });
        }
        res.json({
            success: true,
            data: artist
        });
    } catch (error) {
        console.error('Error fetching artist:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching artist'
        });
    }
});

// @route   PUT /api/admin/artists/:id
// @desc    Update artist (e.g. badge overrides)
// @access  Protected
router.put('/artists/:id', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const allowed = ['name', 'bio', 'specialization', 'badgeOverrides', 'isActive'];
        const updateData = {};
        allowed.forEach(key => {
            if (req.body[key] !== undefined) updateData[key] = req.body[key];
        });
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No allowed fields to update'
            });
        }
        updateData.updatedAt = new Date();
        const artist = await Artist.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true, runValidators: true }
        );
        if (!artist) {
            return res.status(404).json({
                success: false,
                message: 'Artist not found'
            });
        }
        res.json({
            success: true,
            message: 'Artist updated successfully',
            data: artist
        });
    } catch (error) {
        console.error('Error updating artist:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating artist'
        });
    }
});

// ---------- General Profiles (admin: list, get, create, update, delete) ----------
const GeneralProfile = require('../models/GeneralProfile');

router.get('/general-profiles', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const { search = '' } = req.query;
        const query = {};
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } },
                { title: { $regex: search, $options: 'i' } },
                { ownerEmail: { $regex: search, $options: 'i' } }
            ];
        }
        const profiles = await GeneralProfile.find(query).sort({ createdAt: -1 });
        res.json({ success: true, data: profiles, total: profiles.length });
    } catch (error) {
        console.error('Error fetching general profiles:', error);
        res.status(500).json({ success: false, message: 'Error fetching general profiles' });
    }
});

router.get('/general-profiles/stats', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const totalProfiles = await GeneralProfile.countDocuments();
        const recentProfiles = await GeneralProfile.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('username name createdAt');
        res.json({ success: true, data: { totalProfiles, recentProfiles } });
    } catch (error) {
        console.error('Error fetching general profile stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
});

router.get('/general-profiles/:id', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const profile = await GeneralProfile.findById(req.params.id);
        if (!profile) {
            return res.status(404).json({ success: false, message: 'Profile not found' });
        }
        res.json({ success: true, data: profile });
    } catch (error) {
        console.error('Error fetching general profile:', error);
        res.status(500).json({ success: false, message: 'Error fetching profile' });
    }
});

router.post('/general-profiles', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const { username, name, title, bio, photo, theme, font, bioFont, links, social } = req.body;
        const normalizedUsername = (username || '').toLowerCase().trim().replace(/\s+/g, '_');
        if (!normalizedUsername || !/^[a-z0-9_-]+$/.test(normalizedUsername)) {
            return res.status(400).json({ success: false, message: 'Username must contain only letters, numbers, underscores, and hyphens.' });
        }
        const taken = await GeneralProfile.findOne({ username: normalizedUsername });
        if (taken) {
            return res.status(400).json({ success: false, message: 'Username is already taken.' });
        }
        const profile = await GeneralProfile.create({
            username: normalizedUsername,
            name: name || '',
            title: title || '',
            bio: bio || '',
            photo: photo || '',
            theme: theme || 'mint',
            font: font || 'outfit',
            bioFont: bioFont || font || 'outfit',
            links: Array.isArray(links) ? links : [],
            social: social || {}
        });
        res.json({ success: true, data: profile });
    } catch (error) {
        console.error('Error creating general profile:', error);
        res.status(500).json({ success: false, message: error.message || 'Error creating profile' });
    }
});

router.put('/general-profiles/:id', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const profile = await GeneralProfile.findById(req.params.id);
        if (!profile) {
            return res.status(404).json({ success: false, message: 'Profile not found' });
        }
        const { username, name, title, bio, photo, theme, font, bioFont, links, social } = req.body;
        if (username !== undefined) {
            const normalizedUsername = (username || '').toLowerCase().trim().replace(/\s+/g, '_');
            if (!normalizedUsername || !/^[a-z0-9_-]+$/.test(normalizedUsername)) {
                return res.status(400).json({ success: false, message: 'Invalid username format.' });
            }
            if (normalizedUsername !== profile.username) {
                const taken = await GeneralProfile.findOne({ username: normalizedUsername });
                if (taken) {
                    return res.status(400).json({ success: false, message: 'Username is already taken.' });
                }
                profile.username = normalizedUsername;
            }
        }
        if (name !== undefined) profile.name = name;
        if (title !== undefined) profile.title = title;
        if (bio !== undefined) profile.bio = bio;
        if (photo !== undefined) profile.photo = photo;
        if (theme !== undefined) profile.theme = theme;
        if (font !== undefined) profile.font = font;
        if (bioFont !== undefined) profile.bioFont = bioFont;
        if (Array.isArray(links)) profile.links = links;
        if (social && typeof social === 'object') profile.social = { ...profile.social.toObject?.() || profile.social, ...social };
        await profile.save();
        res.json({ success: true, message: 'Profile updated successfully', data: profile });
    } catch (error) {
        console.error('Error updating general profile:', error);
        res.status(500).json({ success: false, message: error.message || 'Error updating profile' });
    }
});

router.delete('/general-profiles/:id', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const profile = await GeneralProfile.findByIdAndDelete(req.params.id);
        if (!profile) {
            return res.status(404).json({ success: false, message: 'Profile not found' });
        }
        res.json({ success: true, message: 'General profile deleted successfully' });
    } catch (error) {
        console.error('Error deleting general profile:', error);
        res.status(500).json({ success: false, message: 'Error deleting profile' });
    }
});

// @route   GET /api/admin/stats
// @desc    Get dashboard statistics
// @access  Protected
router.get('/stats', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const totalSchools = await School.countDocuments();
        const totalStudents = await Student.countDocuments();
        const activeStudents = await Student.countDocuments({ isActive: true });
        const inactiveStudents = await Student.countDocuments({ isActive: false });
        const totalScans = await Student.aggregate([
            { $group: { _id: null, total: { $sum: '$scanCount' } } }
        ]);

        const recentScans = await Student.find({ lastScanned: { $ne: null } })
            .sort({ lastScanned: -1 })
            .limit(10)
            .select('studentId name rollNumber lastScanned scanCount');

        res.json({
            success: true,
            data: {
                totalSchools,
                totalStudents,
                activeStudents,
                inactiveStudents,
                totalScans: totalScans[0]?.total || 0,
                recentScans
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching statistics'
        });
    }
});

module.exports = router;
