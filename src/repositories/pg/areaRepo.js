const { getPool } = require('../../config/db');

const getAll = async () => {
  const { rows } = await getPool().query('SELECT * FROM areas ORDER BY area');
  return rows;
};

const getByArea = async (areaName) => {
  const { rows } = await getPool().query(
    'SELECT * FROM areas WHERE area = $1',
    [areaName]
  );
  return rows[0] || null;
};

const updateInfo = async (areaName, { image_url, description, navigation_notes }) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE areas
     SET image_url = $1,
         description = $2,
         navigation_notes = $3
     WHERE area = $4
     RETURNING *`,
    [image_url || null, description || null, navigation_notes || null, areaName]
  );
  return rows[0] || null;
};

module.exports = { getAll, getByArea, updateInfo };
