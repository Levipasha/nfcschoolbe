const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const SessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true,
        default: () => `SESSION-${nanoid(16)}`
    },
    studentId: {
        type: String,
        ref: 'Student',
        index: true
    },
    artistId: {
        type: String,
        ref: 'Artist',
        index: true
    },
    // Session details
    ipAddress: {
        type: String,
        default: '0.0.0.0'
    },
    userAgent: {
        type: String,
        default: 'Unknown'
    },
    deviceType: {
        type: String,
        enum: ['mobile', 'tablet', 'desktop', 'unknown'],
        default: 'unknown'
    },
    browser: {
        type: String,
        default: 'Unknown'
    },
    os: {
        type: String,
        default: 'Unknown'
    },
    // Geolocation (optional - can be added with IP lookup service)
    location: {
        country: String,
        city: String,
        region: String,
        coordinates: {
            lat: Number,
            lng: Number
        }
    },
    // Session timing
    startTime: {
        type: Date,
        required: true,
        default: Date.now
    },
    endTime: {
        type: Date
    },
    duration: {
        type: Number, // in seconds
        default: 0
    },
    // Session status
    isActive: {
        type: Boolean,
        default: true
    },
    // Referrer information
    referrer: {
        type: String
    },
    // Page views in this session
    pageViews: {
        type: Number,
        default: 1
    },
    // Actions performed in session
    actions: [{
        type: {
            type: String,
            enum: ['view', 'call', 'share', 'download', 'print']
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        details: String
    }],
    // Session metadata
    metadata: {
        type: Map,
        of: String
    }
}, {
    timestamps: true
});

// Auto-expire old sessions after 90 days
SessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// Indexes for better query performance
SessionSchema.index({ studentId: 1, startTime: -1 });
SessionSchema.index({ artistId: 1, startTime: -1 });
SessionSchema.index({ ipAddress: 1, startTime: -1 });
SessionSchema.index({ isActive: 1, studentId: 1 });
SessionSchema.index({ isActive: 1, artistId: 1 });

// Virtual for session duration in a readable format
SessionSchema.virtual('durationFormatted').get(function () {
    if (!this.duration) return '0s';

    const hours = Math.floor(this.duration / 3600);
    const minutes = Math.floor((this.duration % 3600) / 60);
    const seconds = this.duration % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
});

// Method to end session
SessionSchema.methods.endSession = async function () {
    if (!this.isActive) return;

    this.endTime = new Date();
    this.duration = Math.floor((this.endTime - this.startTime) / 1000);
    this.isActive = false;

    await this.save();
    return this;
};

// Method to record action in session
SessionSchema.methods.recordAction = async function (actionType, details = null) {
    this.actions.push({
        type: actionType,
        timestamp: new Date(),
        details
    });

    this.pageViews += 1;

    await this.save();
    return this;
};

// Method to extend session
SessionSchema.methods.extendSession = async function () {
    this.pageViews += 1;

    await this.save();
    return this;
};

// Static method to get active sessions for a student
SessionSchema.statics.getActiveSessions = async function (studentId) {
    return this.find({
        studentId,
        isActive: true
    }).sort({ startTime: -1 });
};

// Static method to get session analytics for a student
SessionSchema.statics.getStudentAnalytics = async function (studentId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const sessions = await this.find({
        studentId,
        startTime: { $gte: startDate }
    });

    // Calculate analytics
    const totalSessions = sessions.length;
    const uniqueIPs = new Set(sessions.map(s => s.ipAddress)).size;
    const totalPageViews = sessions.reduce((sum, s) => sum + s.pageViews, 0);
    const avgDuration = sessions.reduce((sum, s) => sum + s.duration, 0) / totalSessions || 0;

    // Device breakdown
    const deviceBreakdown = sessions.reduce((acc, s) => {
        acc[s.deviceType] = (acc[s.deviceType] || 0) + 1;
        return acc;
    }, {});

    // Browser breakdown
    const browserBreakdown = sessions.reduce((acc, s) => {
        acc[s.browser] = (acc[s.browser] || 0) + 1;
        return acc;
    }, {});

    // Peak hours
    const hourlyBreakdown = sessions.reduce((acc, s) => {
        const hour = new Date(s.startTime).getHours();
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
    }, {});

    return {
        totalSessions,
        uniqueVisitors: uniqueIPs,
        totalPageViews,
        avgDuration: Math.floor(avgDuration),
        avgPageViewsPerSession: (totalPageViews / totalSessions || 0).toFixed(2),
        deviceBreakdown,
        browserBreakdown,
        hourlyBreakdown,
        period: `Last ${days} days`
    };
};

// Static method to clean up inactive sessions
SessionSchema.statics.cleanupInactiveSessions = async function (inactivityMinutes = 30) {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - inactivityMinutes);

    const result = await this.updateMany(
        {
            isActive: true,
            startTime: { $lt: cutoffTime },
            endTime: null
        },
        {
            $set: {
                isActive: false,
                endTime: new Date(),
                duration: function () {
                    return Math.floor((new Date() - this.startTime) / 1000);
                }
            }
        }
    );

    return result;
};

// Parse user agent to extract device info
SessionSchema.methods.parseUserAgent = function () {
    const ua = this.userAgent.toLowerCase();

    // Detect device type
    if (ua.includes('mobile') || ua.includes('android')) {
        this.deviceType = 'mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
        this.deviceType = 'tablet';
    } else if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari')) {
        this.deviceType = 'desktop';
    } else {
        this.deviceType = 'unknown';
    }

    // Detect browser
    if (ua.includes('chrome')) this.browser = 'Chrome';
    else if (ua.includes('firefox')) this.browser = 'Firefox';
    else if (ua.includes('safari')) this.browser = 'Safari';
    else if (ua.includes('edge')) this.browser = 'Edge';
    else if (ua.includes('opera')) this.browser = 'Opera';
    else this.browser = 'Unknown';

    // Detect OS
    if (ua.includes('windows')) this.os = 'Windows';
    else if (ua.includes('mac')) this.os = 'macOS';
    else if (ua.includes('linux')) this.os = 'Linux';
    else if (ua.includes('android')) this.os = 'Android';
    else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) this.os = 'iOS';
    else this.os = 'Unknown';
};

// Pre-save hook to parse user agent
SessionSchema.pre('save', function (next) {
    if (this.isNew && this.userAgent) {
        this.parseUserAgent();
    }
    next();
});

module.exports = mongoose.model('Session', SessionSchema);
