const jwt = require('jsonwebtoken');

/**
 * Middleware to protect routes - checks for valid JWT
 */
const protect = (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Add user info to request
            req.user = decoded;
            next();
        } catch (error) {
            console.error('JWT Verification Error:', error.message);
            res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
};

/**
 * Middleware to restrict access to Admins only
 */
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Access denied, Admin role required' });
    }
};

module.exports = { protect, isAdmin };
