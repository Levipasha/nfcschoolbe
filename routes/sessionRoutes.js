const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const Student = require('../models/Student');
const authMiddleware = require('../middleware/auth');
const { adminLimiter } = require('../middleware/rateLimiter');

// @route   GET /api/sessions/student/:studentId
// @desc    Get all sessions for a specific student
// @access  Protected (Admin)
router.get('/student/:studentId', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const { studentId } = req.params;
        const { page = 1, limit = 50, active } = req.query;

        const query = { studentId };
        if (active !== undefined) {
            query.isActive = active === 'true';
        }

        const sessions = await Session.find(query)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ startTime: -1 });

        const count = await Session.countDocuments(query);

        res.json({
            success: true,
            data: sessions,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            total: count
        });
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching sessions'
        });
    }
});

// @route   GET /api/sessions/analytics/:studentId
// @desc    Get session analytics for a student
// @access  Protected (Admin)
router.get('/analytics/:studentId', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const { studentId } = req.params;
        const { days = 30 } = req.query;

        const analytics = await Session.getStudentAnalytics(studentId, parseInt(days));

        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching analytics'
        });
    }
});

// @route   GET /api/sessions/active
// @desc    Get all currently active sessions
// @access  Protected (Admin)
router.get('/active', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const activeSessions = await Session.find({ isActive: true })
            .populate('studentId', 'name rollNumber class')
            .sort({ startTime: -1 })
            .limit(100);

        res.json({
            success: true,
            count: activeSessions.length,
            data: activeSessions
        });
    } catch (error) {
        console.error('Error fetching active sessions:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching active sessions'
        });
    }
});

// @route   GET /api/sessions/:sessionId
// @desc    Get details of a specific session
// @access  Protected (Admin)
router.get('/:sessionId', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = await Session.findOne({ sessionId });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        res.json({
            success: true,
            data: session
        });
    } catch (error) {
        console.error('Error fetching session:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching session'
        });
    }
});

// @route   GET /api/sessions/stats/overview
// @desc    Get overall session statistics
// @access  Protected (Admin)
router.get('/stats/overview', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Total sessions
        const totalSessions = await Session.countDocuments({
            startTime: { $gte: startDate }
        });

        // Active sessions
        const activeSessions = await Session.countDocuments({
            isActive: true,
            startTime: { $gte: startDate }
        });

        // Unique visitors
        const uniqueVisitors = await Session.distinct('ipAddress', {
            startTime: { $gte: startDate }
        });

        // Top viewed students
        const topViewed = await Session.aggregate([
            { $match: { startTime: { $gte: startDate } } },
            {
                $group: {
                    _id: '$studentId',
                    viewCount: { $sum: 1 },
                    uniqueViews: { $addToSet: '$ipAddress' }
                }
            },
            {
                $project: {
                    studentId: '$_id',
                    viewCount: 1,
                    uniqueViews: { $size: '$uniqueViews' }
                }
            },
            { $sort: { viewCount: -1 } },
            { $limit: 10 }
        ]);

        // Populate student details
        const topViewedWithDetails = await Promise.all(
            topViewed.map(async (item) => {
                const student = await Student.findOne({ studentId: item.studentId })
                    .select('name rollNumber class photo');
                return {
                    ...item,
                    student
                };
            })
        );

        // Device breakdown
        const deviceStats = await Session.aggregate([
            { $match: { startTime: { $gte: startDate } } },
            {
                $group: {
                    _id: '$deviceType',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Browser breakdown
        const browserStats = await Session.aggregate([
            { $match: { startTime: { $gte: startDate } } },
            {
                $group: {
                    _id: '$browser',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Daily session counts
        const dailyStats = await Session.aggregate([
            { $match: { startTime: { $gte: startDate } } },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$startTime' }
                    },
                    sessions: { $sum: 1 },
                    uniqueVisitors: { $addToSet: '$ipAddress' }
                }
            },
            {
                $project: {
                    date: '$_id',
                    sessions: 1,
                    uniqueVisitors: { $size: '$uniqueVisitors' }
                }
            },
            { $sort: { date: 1 } }
        ]);

        res.json({
            success: true,
            data: {
                period: `Last ${days} days`,
                totalSessions,
                activeSessions,
                uniqueVisitors: uniqueVisitors.length,
                topViewedStudents: topViewedWithDetails,
                deviceBreakdown: deviceStats,
                browserBreakdown: browserStats,
                dailyTrend: dailyStats
            }
        });
    } catch (error) {
        console.error('Error fetching session stats:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching session statistics'
        });
    }
});

// @route   POST /api/sessions/cleanup
// @desc    Cleanup inactive sessions
// @access  Protected (Admin)
router.post('/cleanup', authMiddleware, adminLimiter, async (req, res) => {
    try {
        const { inactivityMinutes = 30 } = req.body;

        const result = await Session.cleanupInactiveSessions(inactivityMinutes);

        res.json({
            success: true,
            message: 'Cleanup completed',
            sessionsUpdated: result.modifiedCount
        });
    } catch (error) {
        console.error('Error cleaning up sessions:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while cleaning up sessions'
        });
    }
});

module.exports = router;
