const { getPool } = require('../../config/db');

const getAll = async () => {
  const { rows } = await getPool().query('SELECT * FROM areas ORDER BY area');
  return rows;
};

module.exports = { getAll };