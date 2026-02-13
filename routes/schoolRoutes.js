const express = require('express');
const router = express.Router();
const School = require('../models/School');
const Student = require('../models/Student');
const authMiddleware = require('../middleware/auth');
const { adminLimiter } = require('../middleware/rateLimiter');

// @route   GET /api/school
// @desc    Get all schools
// @access  Protected (Admin)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { status, search } = req.query;

        let query = {};

        // Filter by status
        if (status && status !== 'all') {
            query.isActive = status === 'active';
        }

        // Search by name
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        const schools = await School.find(query)
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: schools
        });
    } catch (error) {
        console.error('Error fetching schools:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching schools'
        });
    }
});

// @route   GET /api/school/:id
// @desc    Get single school by ID
// @access  Protected (Admin)
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const school = await School.findById(req.params.id);

        if (!school) {
            return res.status(404).json({
                success: false,
                message: 'School not found'
            });
        }

        res.json({
            success: true,
            data: school
        });
    } catch (error) {
        console.error('Error fetching school:', error);
        res

            .status(500).json({
                success: false,
                message: 'Error fetching school'
            });
    }
});

// @route   POST /api/school
// @desc    Create new school
// @access  Protected (Admin)
router.post('/', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const { name, address, phone, email, principalName } = req.body;

        // Validation
        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'School name is required'
            });
        }

        // Check if school with same name exists
        const existingSchool = await School.findOne({
            name: { $regex: `^${name.trim()}$`, $options: 'i' }
        });

        if (existingSchool) {
            return res.status(400).json({
                success: false,
                message: 'School with this name already exists'
            });
        }

        // Create school
        const school = new School({
            name: name.trim(),
            address: address || '',
            phone: phone || '',
            email: email || '',
            principalName: principalName || ''
        });

        await school.save();

        res.status(201).json({
            success: true,
            message: 'School created successfully',
            data: school
        });
    } catch (error) {
        console.error('Error creating school:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error creating school'
        });
    }
});

// @route   PUT /api/school/:id
// @desc    Update school
// @access  Protected (Admin)
router.put('/:id', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const { name, address, phone, email, principalName } = req.body;

        const school = await School.findById(req.params.id);

        if (!school) {
            return res.status(404).json({
                success: false,
                message: 'School not found'
            });
        }

        // Update fields
        if (name) school.name = name.trim();
        if (address !== undefined) school.address = address;
        if (phone !== undefined) school.phone = phone;
        if (email !== undefined) school.email = email;
        if (principalName !== undefined) school.principalName = principalName;

        await school.save();

        res.json({
            success: true,
            message: 'School updated successfully',
            data: school
        });
    } catch (error) {
        console.error('Error updating school:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating school'
        });
    }
});

// @route   PUT /api/school/:id/toggle-status
// @desc    Toggle school active/inactive status
// @access  Protected (Admin)
router.put('/:id/toggle-status', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const school = await School.findById(req.params.id);

        if (!school) {
            return res.status(404).json({
                success: false,
                message: 'School not found'
            });
        }

        school.isActive = !school.isActive;
        await school.save();

        res.json({
            success: true,
            message: `School ${school.isActive ? 'activated' : 'deactivated'} successfully`,
            data: school
        });
    } catch (error) {
        console.error('Error toggling school status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating school status'
        });
    }
});

// @route   DELETE /api/school/:id
// @desc    Delete school
// @access  Protected (Admin)
router.delete('/:id', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const school = await School.findById(req.params.id);

        if (!school) {
            return res.status(404).json({
                success: false,
                message: 'School not found'
            });
        }

        // Check if school has students
        const studentCount = await Student.countDocuments({ school: school._id });

        if (studentCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete school with ${studentCount} students. Please delete or transfer students first.`
            });
        }

        await school.deleteOne();

        res.json({
            success: true,
            message: 'School deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting school:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting school'
        });
    }
});

// @route   GET /api/school/:id/students
// @desc    Get all students for a school
// @access  Protected (Admin)
router.get('/:id/students', authMiddleware, async (req, res) => {
    try {
        const school = await School.findById(req.params.id);

        if (!school) {
            return res.status(404).json({
                success: false,
                message: 'School not found'
            });
        }

        const students = await Student.find({ school: school._id })
            .sort({ sequentialNumber: 1 });

        res.json({
            success: true,
            data: {
                school: school,
                students: students
            }
        });
    } catch (error) {
        console.error('Error fetching school students:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching students'
        });
    }
});

module.exports = router;
