const { getPool } = require('../../config/db');

const getAll = async () => {
  const [rows] = await getPool().query(
    'SELECT * FROM areas ORDER BY area'
  );

  return rows;
};

const getByArea = async (areaName) => {
  const [rows] = await getPool().query(
    'SELECT * FROM areas WHERE area = ?',
    [areaName]
  );
  return rows[0] || null;
};

const create = async ({ area, area_code, image_url, description, navigation_notes }) => {
  await getPool().query(
    `INSERT INTO areas (area, area_code, image_url, description, navigation_notes)
     VALUES (?, ?, ?, ?, ?)`,
    [area, area_code, image_url || null, description || null, navigation_notes || null]
  );
  return getByArea(area);
};

const updateInfo = async (areaName, { image_url, description, navigation_notes }) => {
  await getPool().query(
    `UPDATE areas
     SET image_url = ?,
         description = ?,
         navigation_notes = ?
     WHERE area = ?`,
    [image_url || null, description || null, navigation_notes || null, areaName]
  );
  return getByArea(areaName);
};

const remove = async (areaName) => {
  const [result] = await getPool().query(
    'DELETE FROM areas WHERE area = ?',
    [areaName]
  );
  return result.affectedRows > 0;
};

module.exports = { getAll, getByArea, create, updateInfo, remove };
