const socketIO = require('socket.io');

/**
 * Initialize WebSocket Server
 * @param {Object} server - HTTP server instance
 * @param {Object} corsOptions - CORS configuration from main server
 * @returns {Object} io - Socket.IO instance
 */
function initializeWebSocket(server, corsOptions) {
    const io = socketIO(server, {
        cors: corsOptions,
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000
    });

    // Middleware for authentication (optional for admin channels)
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;

        // Allow public connections without token
        if (!token) {
            socket.isAuthenticated = false;
            return next();
        }

        // Verify JWT token for admin connections
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.admin = decoded;
            socket.isAuthenticated = true;
            next();
        } catch (error) {
            console.log('WebSocket auth failed:', error.message);
            socket.isAuthenticated = false;
            next(); // Still allow connection but without admin privileges
        }
    });

    io.on('connection', (socket) => {
        console.log('🔌 New WebSocket connection:', socket.id);

        // Join admin room if authenticated
        if (socket.isAuthenticated) {
            socket.join('admin-room');
            console.log('👤 Admin joined admin-room:', socket.admin.username);

            // Send welcome message
            socket.emit('admin:connected', {
                message: 'Connected to admin channel',
                username: socket.admin.username
            });
        }

        // =====================
        // STUDENT SCAN EVENTS
        // =====================
        socket.on('student:scan', (data) => {
            console.log('📱 Student scan event:', data.studentId);

            // Broadcast to all admin clients
            io.to('admin-room').emit('student:scanned', {
                studentId: data.studentId,
                name: data.name,
                timestamp: new Date().toISOString(),
                scanCount: data.scanCount
            });
        });

        // =====================
        // ADMIN EVENTS
        // =====================

        // Student added event
        socket.on('admin:student-added', (student) => {
            if (!socket.isAuthenticated) return;

            console.log('✅ Student added:', student.name);
            io.to('admin-room').emit('student:added', student);
        });

        // Student updated event
        socket.on('admin:student-updated', (student) => {
            if (!socket.isAuthenticated) return;

            console.log('📝 Student updated:', student.name);
            io.to('admin-room').emit('student:updated', student);
        });

        // Student deleted event
        socket.on('admin:student-deleted', (studentId) => {
            if (!socket.isAuthenticated) return;

            console.log('🗑️ Student deleted:', studentId);
            io.to('admin-room').emit('student:deleted', { studentId });
        });

        // Student status toggled event
        socket.on('admin:student-status-toggled', (data) => {
            if (!socket.isAuthenticated) return;

            console.log('🔄 Student status toggled:', data.studentId, data.isActive);
            io.to('admin-room').emit('student:status-changed', data);
        });

        // =====================
        // SCHOOL EVENTS
        // =====================

        socket.on('admin:school-added', (school) => {
            if (!socket.isAuthenticated) return;

            console.log('🏫 School added:', school.name);
            io.to('admin-room').emit('school:added', school);
        });

        socket.on('admin:school-updated', (school) => {
            if (!socket.isAuthenticated) return;

            console.log('📝 School updated:', school.name);
            io.to('admin-room').emit('school:updated', school);
        });

        // =====================
        // UTILITY EVENTS
        // =====================

        // Ping-pong for connection health
        socket.on('ping', () => {
            socket.emit('pong');
        });

        // Disconnect handler
        socket.on('disconnect', (reason) => {
            console.log('🔌 WebSocket disconnected:', socket.id, reason);
            if (socket.isAuthenticated) {
                console.log('👤 Admin left admin-room:', socket.admin?.username);
            }
        });

        // Error handler
        socket.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
        });
    });

    // Helper function to broadcast to all admin clients
    io.broadcastToAdmins = (event, data) => {
        io.to('admin-room').emit(event, data);
    };

    // Helper function to broadcast student scan
    io.broadcastStudentScan = (studentData) => {
        io.to('admin-room').emit('student:scanned', {
            studentId: studentData.studentId,
            name: studentData.name,
            rollNumber: studentData.rollNumber,
            timestamp: new Date().toISOString(),
            scanCount: studentData.scanCount
        });
    };

    // Helper function to broadcast artist scan
    io.broadcastArtistScan = (artistData) => {
        io.to('admin-room').emit('artist:scanned', {
            artistId: artistData.artistId,
            name: artistData.name,
            timestamp: new Date().toISOString(),
            scanCount: artistData.scanCount,
            deviceType: artistData.deviceType
        });
    };

    console.log('✅ WebSocket server initialized');
    return io;
}

module.exports = initializeWebSocket;
