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
    nickname: {
        type: String,
        trim: true,
        maxlength: [100, 'Nickname cannot exceed 100 characters']
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
    age: {
        type: Number,
        min: [1, 'Age must be at least 1'],
        max: [120, 'Age must be at most 120']
    },
    photo: {
        type: String,
        trim: true,
        default: 'https://placehold.co/300x300/4F46E5/FFFFFF?text=Student'
    },
    bloodGroup: {
        type: String,
        trim: true
    },
    motherName: {
        type: String,
        trim: true
    },
    fatherName: {
        type: String,
        trim: true
    },
    motherPhone: {
        type: String,
        trim: true
    },
    fatherPhone: {
        type: String,
        trim: true
    },
    address: {
        type: String,
        trim: true
    },
    pincode: {
        type: String,
        trim: true
    },
    city: {
        type: String,
        trim: true
    },
    state: {
        type: String,
        trim: true
    },
    // Secure access token for NFC tag
    accessToken: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    // Keeping these for backward compatibility if needed, but making them optional
    parentName: {
        type: String,
        trim: true
    },
    parentPhone: {
        type: String,
        trim: true
    },
    emergencyContact: {
        type: String,
        trim: true
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

// Auto-generate secure access token after save (for NFC tags)
studentSchema.post('save', async function (doc) {
    try {
        // Update school student count
        const School = mongoose.model('School');
        const count = await mongoose.model('Student').countDocuments({ school: doc.school });
        await School.findByIdAndUpdate(doc.school, { studentCount: count });

        // Generate access token if not exists
        if (!doc.accessToken) {
            const AccessToken = mongoose.model('AccessToken');
            const tokenDoc = await AccessToken.createPermanentToken(
                doc.studentId,
                `NFC Tag for ${doc.name}`
            );

            // Save token to student record
            doc.accessToken = tokenDoc.token;
            await doc.constructor.findByIdAndUpdate(doc._id, {
                accessToken: tokenDoc.token
            });
        }
    } catch (error) {
        console.error('Error in post-save hook:', error);
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

// Method to generate secure NFC URL with token
studentSchema.methods.generateNFCUrl = function (baseUrl = 'http://localhost:5173') {
    if (!this.accessToken) {
        throw new Error('Access token not generated for this student');
    }
    return `${baseUrl}/p/${this.accessToken}`;
};

// Method to generate shareable link (temporary, 24h)
studentSchema.methods.generateShareLink = async function (baseUrl = 'http://localhost:5173') {
    const AccessToken = mongoose.model('AccessToken');
    const tempToken = await AccessToken.createTemporaryToken(this.studentId, 24);
    return `${baseUrl}/p/${tempToken.token}`;
};

// Virtual for formatted last scan time
studentSchema.virtual('lastScannedFormatted').get(function () {
    if (!this.lastScanned) return 'Never';
    return this.lastScanned.toLocaleString();
});

module.exports = mongoose.model('Student', studentSchema);
