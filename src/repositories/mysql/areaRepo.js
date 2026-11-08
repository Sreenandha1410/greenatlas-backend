const { getPool } = require('../../config/db');

const getAll = async () => {
  const [rows] = await getPool().query(
    'SELECT * FROM areas ORDER BY area'
  );
  return rows;
};

const getByArea = async (areaName) => {
  const [rows] = await getPool().query(
    'SELECT * FROM areas WHERE area = ? LIMIT 1',
    [areaName]
  );
  return rows[0] || null;
};

const updateInfo = async (areaName, { image_url, description, navigation_notes }) => {
  const pool = getPool();
  await pool.query(
    `UPDATE areas
     SET image_url = ?,
         description = ?,
         navigation_notes = ?
     WHERE area = ?`,
    [image_url || null, description || null, navigation_notes || null, areaName]
  );

  const [rows] = await pool.query(
    'SELECT * FROM areas WHERE area = ? LIMIT 1',
    [areaName]
  );
  return rows[0] || null;
};

module.exports = { getAll, getByArea, updateInfo };