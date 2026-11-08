const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { getPool } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Strict rate limit on login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 failed attempts allowed
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const isPg = process.env.DB_TYPE !== 'mysql';
    const query = isPg 
      ? 'SELECT * FROM users WHERE username = $1' 
      : 'SELECT * FROM users WHERE username = ?';
    
    const result = await getPool().query(query, [username]);
    const user = isPg ? result.rows[0] : (result[0] && result[0][0]);

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, role: user.role });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const isPg = process.env.DB_TYPE !== 'mysql';
    const selQuery = isPg ? 'SELECT * FROM users WHERE id = $1' : 'SELECT * FROM users WHERE id = ?';
    const result = await getPool().query(selQuery, [req.user.id]);
    const user = isPg ? result.rows[0] : (result[0] && result[0][0]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    const updQuery = isPg 
      ? 'UPDATE users SET password_hash=$1 WHERE id=$2' 
      : 'UPDATE users SET password_hash=? WHERE id=?';
    await getPool().query(updQuery, [hash, user.id]);

    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

module.exports = router;