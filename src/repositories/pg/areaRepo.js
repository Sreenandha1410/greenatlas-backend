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

const create = async ({ area, area_code, image_url, description, navigation_notes }) => {
  const { rows } = await getPool().query(
    `INSERT INTO areas (area, area_code, image_url, description, navigation_notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [area, area_code, image_url || null, description || null, navigation_notes || null]
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

const remove = async (areaName) => {
  const { rowCount } = await getPool().query(
    'DELETE FROM areas WHERE area = $1',
    [areaName]
  );
  return rowCount > 0;
};

module.exports = { getAll, getByArea, create, updateInfo, remove };
