const validator = require('validator');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const SchoolClass = require('../models/SchoolClass');

/** When `schoolClass` is sent, set `class` string from that record (same school). Runs before validateStudentData. */
const resolveStudentClassFromSchoolClass = async (req, res, next) => {
    try {
        const schoolClassId = req.body.schoolClass;
        if (schoolClassId === undefined || schoolClassId === null || schoolClassId === '') {
            return next();
        }
        if (!mongoose.Types.ObjectId.isValid(schoolClassId)) {
            return res.status(400).json({ success: false, message: 'Invalid class selection' });
        }
        let schoolId = req.body.school;
        if (!schoolId && req.params.id) {
            const st = await Student.findOne({ studentId: req.params.id }).select('school').lean();
            if (st) schoolId = st.school;
        }
        if (!schoolId) {
            return res.status(400).json({
                success: false,
                message: 'School context required when assigning a class'
            });
        }
        const sc = await SchoolClass.findOne({ _id: schoolClassId, school: schoolId }).lean();
        if (!sc) {
            return res.status(400).json({ success: false, message: 'Class not found for this school' });
        }
        req.body.class = sc.name;
        next();
    } catch (err) {
        next(err);
    }
};

// Validate student data
const validateStudentData = (req, res, next) => {
    const { name, rollNumber, class: studentClass } = req.body;

    const errors = [];

    // Name validation
    if (!name || validator.isEmpty(name.trim())) {
        errors.push('Student name is required');
    } else if (name.length > 100) {
        errors.push('Student name cannot exceed 100 characters');
    }

    // Roll number validation
    if (!rollNumber || validator.isEmpty(rollNumber.trim())) {
        errors.push('Roll number is required');
    }

    // Class validation
    if (!studentClass || validator.isEmpty(studentClass.trim())) {
        errors.push('Class is required');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors
        });
    }

    next();
};

// Validate student ID format
const validateStudentId = (req, res, next) => {
    const id = req.params.id ? req.params.id.trim() : '';

    if (!id || validator.isEmpty(id)) {
        return res.status(400).json({
            success: false,
            message: 'Student ID is required'
        });
    }

    // Check if ID follows expected format (Alphanumeric and hyphens/dots)
    if (!/^[a-z0-9-.]+$/i.test(id)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid ID format'
        });
    }

    next();
};

module.exports = {
    validateStudentData,
    validateStudentId,
    resolveStudentClassFromSchoolClass
};
