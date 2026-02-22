const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const router = express.Router();
const multer = require('multer');
const Student = require('../models/Student');
const authMiddleware = require('../middleware/auth');
const { adminLimiter } = require('../middleware/rateLimiter');
const { parseCSV, parseTXT } = require('../utils/csvParser');
const { uploadBuffer } = require('../utils/cloudinary');

const storage = multer.memoryStorage();

// Multer for CSV/TXT bulk upload
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.mimetype === 'text/plain' ||
            file.originalname.endsWith('.csv') || file.originalname.endsWith('.txt')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV and TXT files are allowed'), false);
        }
    }
});

// Multer for image upload (student/admin photo → Cloudinary)
const photoUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'), false);
        }
    }
});

// @route   POST /api/upload/photo
// @desc    Upload a single image to Cloudinary (e.g. student photo). Returns { url }.
// @access  Protected (Admin)
router.post('/photo', authMiddleware, adminLimiter, photoUpload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const result = await uploadBuffer(req.file.buffer, { folder: 'nfc/students' });
        res.json({ success: true, url: result.secure_url });
    } catch (error) {
        console.error('Photo upload error:', error);
        res.status(500).json({ success: false, message: error.message || 'Upload failed' });
    }
});

// @route   POST /api/upload/students
// @desc    Bulk upload students from CSV/TXT file
// @access  Protected (Admin)
router.post('/students', authMiddleware, adminLimiter, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a file'
            });
        }

        // Get school info from request body
        const { schoolId, schoolCode } = req.body;

        if (!schoolId || !schoolCode) {
            return res.status(400).json({
                success: false,
                message: 'School information is required'
            });
        }

        // Convert buffer to string
        const fileContent = req.file.buffer.toString('utf8');

        // Parse file based on type
        let parseResult;
        const fileName = req.file.originalname.toLowerCase();

        if (fileName.endsWith('.csv')) {
            parseResult = parseCSV(fileContent, schoolCode, schoolId);
        } else if (fileName.endsWith('.txt')) {
            parseResult = parseTXT(fileContent, schoolCode, schoolId);
        } else {
            return res.status(400).json({
                success: false,
                message: 'Unsupported file format. Please upload CSV or TXT file'
            });
        }

        const { students, errors } = parseResult;

        if (students.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid students found in file',
                errors
            });
        }

        // Insert students into database
        const results = {
            successful: [],
            failed: [],
            duplicates: []
        };

        for (const studentData of students) {
            try {
                // Check for duplicate roll number
                const existingStudent = await Student.findOne({ rollNumber: studentData.rollNumber });

                if (existingStudent) {
                    results.duplicates.push({
                        rollNumber: studentData.rollNumber,
                        name: studentData.name,
                        reason: 'Roll number already exists'
                    });
                    continue;
                }

                // Create new student
                const student = new Student(studentData);
                await student.save();

                results.successful.push({
                    studentId: student.studentId,
                    name: student.name,
                    rollNumber: student.rollNumber,
                    nfcUrl: student.generateNFCUrl(process.env.FRONTEND_URL || 'http://localhost:5173')
                });
            } catch (error) {
                results.failed.push({
                    rollNumber: studentData.rollNumber,
                    name: studentData.name,
                    reason: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Processed ${students.length} student(s)`,
            data: {
                total: students.length,
                successful: results.successful.length,
                failed: results.failed.length,
                duplicates: results.duplicates.length,
                details: results,
                parseErrors: errors
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error processing file'
        });
    }
});

// @route   GET /api/upload/template
// @desc    Download sample CSV template
// @access  Protected (Admin)
router.get('/template', authMiddleware, (req, res) => {
    const format = req.query.format || 'csv';

    let content, filename, contentType;

    if (format === 'csv') {
        content = `name,rollnumber,class,parentname,parentphone,emergencycontact,photo
John Doe,20240001,10-A,Jane Doe,+91 9876543210,+91 9876543211,https://example.com/photo1.jpg
Alice Smith,20240002,10-B,Bob Smith,+91 9876543212,+91 9876543213,https://example.com/photo2.jpg
Rahul Kumar,20240003,9-A,Suresh Kumar,+91 9876543214,+91 9876543215,
Priya Sharma,20240004,9-B,Rajesh Sharma,+91 9876543216,+91 9876543217,`;

        filename = 'student_upload_template.csv';
        contentType = 'text/csv';
    } else if (format === 'txt') {
        content = `name\trollnumber\tclass\tparentname\tparentphone\temergencycontact\tphoto
John Doe\t20240001\t10-A\tJane Doe\t+91 9876543210\t+91 9876543211\thttps://example.com/photo1.jpg
Alice Smith\t20240002\t10-B\tBob Smith\t+91 9876543212\t+91 9876543213\thttps://example.com/photo2.jpg
Rahul Kumar\t20240003\t9-A\tSuresh Kumar\t+91 9876543214\t+91 9876543215\t
Priya Sharma\t20240004\t9-B\tRajesh Sharma\t+91 9876543216\t+91 9876543217\t`;

        filename = 'student_upload_template.txt';
        contentType = 'text/plain';
    } else {
        return res.status(400).json({
            success: false,
            message: 'Invalid format. Use csv or txt'
        });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
});

module.exports = router;
