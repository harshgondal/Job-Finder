const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function authMiddleware(req, res, next) {
  try {
    // Try to get token from cookie first, then from Authorization header
    let token = req.cookies?.auth_token || null;
    
    if (!token) {
      const authHeader = req.headers.authorization || '';
      token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    }

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = {
  authMiddleware,
};




