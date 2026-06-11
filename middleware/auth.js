const jwt = require('jsonwebtoken');

function getCookie(req, name) {
    const cookieHeader = req.headers.cookie || '';
    const cookies = cookieHeader.split(';').map(part => part.trim()).filter(Boolean);
    const match = cookies.find(cookie => cookie.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.split(' ')[1]
            : '';
        const token = bearerToken || getCookie(req, 'admin_token');

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided, authorization denied'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Add admin info to request
        req.admin = decoded;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error during authentication'
        });
    }
};

module.exports = authMiddleware;
