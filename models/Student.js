const mongoose = require('mongoose');

const scanHistorySchema = new mongoose.Schema({
    scannedAt: {
        type: Date,
        default: Date.now
    },
    ipAddress: String,
    userAgent: String
}, { _id: false });

const studentSchema = new mongoose.Schema({
    studentId: {
        type: String,
        unique: true,
        index: true
        // Format: {SchoolCode}-{StudentNumber} (e.g., SL1-01, SL1-02)
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: [true, 'School is required'],
        index: true
    },
    schoolCode: {
        type: String,
        required: true,
        index: true
        // Denormalized for faster queries (e.g., SL1, SM2)
    },
    sequentialNumber: {
        type: Number
        // Sequential number within the school (1, 2, 3...)
    },
    name: {
        type: String,
        required: [true, 'Student name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    rollNumber: {
        type: String,
        required: [true, 'Roll number is required'],
        trim: true,
        index: true
    },
    class: {
        type: String,
        required: [true, 'Class is required'],
        trim: true
    },
    photo: {
        type: String,
        trim: true,
        default: 'https://via.placeholder.com/300x300/4F46E5/FFFFFF?text=Student'
    },
    parentName: {
        type: String,
        required: [true, 'Parent name is required'],
        trim: true
    },
    parentPhone: {
        type: String,
        required: [true, 'Parent phone is required'],
        trim: true,
        validate: {
            validator: function (v) {
                return /^[\d\s\-\+\(\)]+$/.test(v);
            },
            message: 'Please enter a valid phone number'
        }
    },
    emergencyContact: {
        type: String,
        required: [true, 'Emergency contact is required'],
        trim: true,
        validate: {
            validator: function (v) {
                return /^[\d\s\-\+\(\)]+$/.test(v);
            },
            message: 'Please enter a valid emergency contact number'
        }
    },
    scanCount: {
        type: Number,
        default: 0
    },
    lastScanned: {
        type: Date,
        default: null
    },
    scanHistory: {
        type: [scanHistorySchema],
        default: []
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index for school + sequential number
studentSchema.index({ schoolCode: 1, sequentialNumber: 1 }, { unique: true });

// Auto-generate student ID before validation
studentSchema.pre('validate', async function (next) {
    if (!this.isNew || (this.studentId && this.sequentialNumber)) {
        return next();
    }

    try {
        if (!this.schoolCode) {
            // Try to get school code if missing but school ID exists
            if (this.school) {
                const School = mongoose.model('School');
                const school = await School.findById(this.school);
                if (school) {
                    this.schoolCode = school.code;
                }
            }
        }

        if (!this.schoolCode) {
            return next(new Error('School code is required to generate Student ID'));
        }

        // Find the highest sequential number for this school
        const lastStudent = await this.constructor.findOne({ schoolCode: this.schoolCode })
            .sort({ sequentialNumber: -1 })
            .lean();

        let nextNumber = 1;
        if (lastStudent && lastStudent.sequentialNumber) {
            nextNumber = lastStudent.sequentialNumber + 1;
        }

        this.sequentialNumber = nextNumber;

        // Generate student ID: {SchoolCode}-{SequentialNumber}
        // Example: SL1-01, SL1-02, SM2-01
        this.studentId = `${this.schoolCode}-${String(nextNumber).padStart(2, '0')}`;

        next();
    } catch (error) {
        next(error);
    }
});

// Update school student count after save
studentSchema.post('save', async function (doc) {
    try {
        const School = mongoose.model('School');
        const count = await mongoose.model('Student').countDocuments({ school: doc.school });
        await School.findByIdAndUpdate(doc.school, { studentCount: count });
    } catch (error) {
        console.error('Error updating school student count:', error);
    }
});

// Update school student count after delete
studentSchema.post('remove', async function (doc) {
    try {
        const School = mongoose.model('School');
        const count = await mongoose.model('Student').countDocuments({ school: doc.school });
        await School.findByIdAndUpdate(doc.school, { studentCount: count });
    } catch (error) {
        console.error('Error updating school student count:', error);
    }
});

// Middleware to update scanCount and lastScanned
studentSchema.methods.recordScan = function (ipAddress, userAgent) {
    this.scanCount += 1;
    this.lastScanned = new Date();

    // Keep only last 50 scans to prevent document growth
    if (this.scanHistory.length >= 50) {
        this.scanHistory.shift();
    }

    this.scanHistory.push({
        scannedAt: new Date(),
        ipAddress,
        userAgent
    });

    return this.save();
};

// Method to generate NFC URL
studentSchema.methods.generateNFCUrl = function (baseUrl = 'http://localhost:5173') {
    return `${baseUrl}/student?id=${this.studentId}`;
};

// Virtual for formatted last scan time
studentSchema.virtual('lastScannedFormatted').get(function () {
    if (!this.lastScanned) return 'Never';
    return this.lastScanned.toLocaleString();
});

module.exports = mongoose.model('Student', studentSchema);
