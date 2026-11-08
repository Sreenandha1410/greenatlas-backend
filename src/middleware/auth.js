const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  const token  = header?.startsWith('Bearer ') ? header.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
