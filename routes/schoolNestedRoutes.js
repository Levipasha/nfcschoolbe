/**
 * Nested paths under /api/school/:id/... — mounted before schoolRoutes so they are
 * never shadowed by GET /:id in any Express version or middleware ordering.
 */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const School = require('../models/School');
const Student = require('../models/Student');
const SchoolClass = require('../models/SchoolClass');
const authMiddleware = require('../middleware/auth');
const { adminLimiter } = require('../middleware/rateLimiter');

// @route   GET /api/school/:id/classes
router.get('/:id/classes', authMiddleware, async (req, res) => {
    try {
        const school = await School.findById(req.params.id);
        if (!school) {
            return res.status(404).json({ success: false, message: 'School not found' });
        }
        const classes = await SchoolClass.find({ school: school._id })
            .sort({ sortOrder: 1, name: 1 })
            .lean();
        res.json({ success: true, data: classes });
    } catch (error) {
        console.error('Error fetching school classes:', error);
        res.status(500).json({ success: false, message: 'Error fetching classes' });
    }
});

// @route   POST /api/school/:id/classes
router.post('/:id/classes', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const school = await School.findById(req.params.id);
        if (!school) {
            return res.status(404).json({ success: false, message: 'School not found' });
        }
        const name = (req.body.name || '').trim();
        if (!name) {
            return res.status(400).json({ success: false, message: 'Class name is required' });
        }
        const doc = new SchoolClass({
            school: school._id,
            name,
            sortOrder: Number(req.body.sortOrder) || 0
        });
        await doc.save();
        res.status(201).json({ success: true, message: 'Class created', data: doc });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'A class with this name already exists in this school'
            });
        }
        console.error('Error creating school class:', error);
        res.status(500).json({ success: false, message: error.message || 'Error creating class' });
    }
});

// @route   DELETE /api/school/:id/classes/:classId
router.delete('/:id/classes/:classId', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const school = await School.findById(req.params.id);
        if (!school) {
            return res.status(404).json({ success: false, message: 'School not found' });
        }
        const cls = await SchoolClass.findOne({ _id: req.params.classId, school: school._id });
        if (!cls) {
            return res.status(404).json({ success: false, message: 'Class not found' });
        }
        const count = await Student.countDocuments({ schoolClass: cls._id });
        if (count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete class with ${count} student(s). Move or remove students first.`
            });
        }
        await cls.deleteOne();
        res.json({ success: true, message: 'Class deleted' });
    } catch (error) {
        console.error('Error deleting school class:', error);
        res.status(500).json({ success: false, message: 'Error deleting class' });
    }
});

// @route   GET /api/school/:id/students
router.get('/:id/students', authMiddleware, async (req, res) => {
    try {
        const school = await School.findById(req.params.id);

        if (!school) {
            return res.status(404).json({
                success: false,
                message: 'School not found'
            });
        }

        const q = { school: school._id };
        const { schoolClass: classFilter } = req.query;
        const classId = classFilter != null ? String(classFilter).trim() : '';
        if (classId && mongoose.Types.ObjectId.isValid(classId)) {
            q.schoolClass = classId;
        }

        const students = await Student.find(q)
            .sort({ sequentialNumber: 1 })
            .lean();

        const baseUrl = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
        const studentsWithUrl = students.map((s) => ({
            ...s,
            profileUrl: s.accessToken ? `${baseUrl}/p/${s.accessToken}` : null
        }));

        res.json({
            success: true,
            data: {
                school: school,
                students: studentsWithUrl
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
