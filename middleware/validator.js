const validator = require('validator');

// Validate student data
const validateStudentData = (req, res, next) => {
    const { name, rollNumber, class: studentClass, parentName, parentPhone, emergencyContact } = req.body;

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

    // Parent name validation
    if (!parentName || validator.isEmpty(parentName.trim())) {
        errors.push('Parent name is required');
    }

    // Parent phone validation
    if (!parentPhone || validator.isEmpty(parentPhone.trim())) {
        errors.push('Parent phone is required');
    } else if (!/^[\d\s\-\+\(\)]+$/.test(parentPhone)) {
        errors.push('Parent phone must be a valid phone number');
    }

    // Emergency contact validation
    if (!emergencyContact || validator.isEmpty(emergencyContact.trim())) {
        errors.push('Emergency contact is required');
    } else if (!/^[\d\s\-\+\(\)]+$/.test(emergencyContact)) {
        errors.push('Emergency contact must be a valid phone number');
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

    // Check if ID follows expected format (Alphanumeric and hyphens)
    if (!/^[a-z0-9-]+$/i.test(id)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid student ID format'
        });
    }

    next();
};

module.exports = {
    validateStudentData,
    validateStudentId
};
