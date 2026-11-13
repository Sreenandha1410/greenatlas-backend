const { getPool } = require('../../config/db');

const findByUsername = async (username) => {
  const { rows } = await getPool().query('SELECT * FROM users WHERE username = $1 LIMIT 1', [username]);
  return rows[0] || null;
};

const findById = async (id) => {
  const { rows } = await getPool().query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return rows[0] || null;
};

const updatePassword = async (id, passwordHash) => {
  await getPool().query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
};

module.exports = { findByUsername, findById, updatePassword };