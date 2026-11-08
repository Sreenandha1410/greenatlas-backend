const { getPool } = require('../../config/db');

const getAll = async ({ search, area, family } = {}) => {
  const pool = getPool();

  let query = `
    SELECT
        t.tree_id,
        t.botanical_name,
        t.common_name,
        t.family,
        t.area,
        t.latitude,
        t.longitude,
        t.age,
        t.notes,
        s.tamil_name,
        s.general_description,
        s.avg_height,
        s.flowering_season,
        s.native_exotic,
        s.conservation_status,
        s.image_url AS species_image_url,
        s.o2_produced_daily,
        s.co2_absorbed_daily,
        s.flora_type,
        a.area_code,
        t.image_link
    FROM trees t
    LEFT JOIN species s
      ON t.botanical_name = CONCAT(s.genus, ' ', s.species)
    LEFT JOIN areas a
      ON t.area = a.area
    WHERE 1=1
  `;

  const params = [];

  if (search) {
    const searchParam = `%${search}%`;
    query += `
      AND (
        t.common_name    LIKE ? OR
        t.botanical_name LIKE ? OR
        t.area           LIKE ? OR
        t.family         LIKE ? OR
        t.tree_id        LIKE ? OR
        s.tamil_name     LIKE ?
      )
    `;
    params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
  }

  if (area) {
    query += ` AND t.area = ?`;
    params.push(area);
  }

  if (family) {
    query += ` AND t.family = ?`;
    params.push(family);
  }

  query += ` ORDER BY t.tree_id`;

  const [rows] = await pool.query(query, params);
  return rows;
};

const getById = async (id) => {
  const pool = getPool();

  const [rows] = await pool.query(
    `
      SELECT
        t.*,
        s.tamil_name,
        s.general_description,
        s.avg_height,
        s.lifespan,
        s.growth_rate,
        s.flowering_season,
        s.fruiting_season,
        s.native_exotic,
        s.pollination_method,
        s.wildlife_supported,
        s.ecological_importance,
        s.medicinal_uses,
        s.economic_uses,
        s.environmental_benefits,
        s.cultural_significance,
        s.interesting_facts,
        s.conservation_status,
        s.kingdom,
        s.division,
        s.class,
        s.order,
        s.genus,
        s.species,
        s.origin,
        s.image_url AS species_image_url,
        s.o2_produced_daily,
        s.co2_absorbed_daily,
        s.flora_type,
        a.area_code,
        t.image_link
      FROM trees t
      LEFT JOIN species s
        ON t.botanical_name = CONCAT(s.genus, ' ', s.species)
      LEFT JOIN areas a
        ON t.area = a.area
      WHERE t.tree_id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
};

const create = async (data) => {
  const pool = getPool();

  const {
    tree_id,
    botanical_name,
    common_name,
    family,
    area,
    latitude,
    longitude,
    age,
    notes,
    image_link
  } = data;

  await pool.query(
    `
      INSERT INTO trees
      (
        tree_id,
        botanical_name,
        common_name,
        family,
        area,
        latitude,
        longitude,
        age,
        notes,
        image_link
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      tree_id,
      botanical_name,
      common_name,
      family,
      area,
      latitude,
      longitude,
      age,
      notes,
      image_link
    ]
  );

  const [rows] = await pool.query(
    `SELECT * FROM trees WHERE tree_id = ? LIMIT 1`,
    [tree_id]
  );

  return rows[0] || null;
};

const update = async (id, data) => {
  const pool = getPool();

  const {
    botanical_name,
    common_name,
    family,
    area,
    latitude,
    longitude,
    age,
    notes,
    image_link
  } = data;

  await pool.query(
    `
      UPDATE trees SET
        botanical_name = ?,
        common_name = ?,
        family = ?,
        area = ?,
        latitude = ?,
        longitude = ?,
        age = ?,
        notes = ?,
        image_link = ?
      WHERE tree_id = ?
    `,
    [
      botanical_name,
      common_name,
      family,
      area,
      latitude,
      longitude,
      age,
      notes,
      image_link,
      id
    ]
  );

  const [rows] = await pool.query(
    `SELECT * FROM trees WHERE tree_id = ? LIMIT 1`,
    [id]
  );

  return rows[0] || null;
};

const remove = async (id) => {
  await getPool().query(
    'DELETE FROM trees WHERE tree_id = ?',
    [id]
  );
};

const getNearby = async (treeId, radiusMeters = 100) => {
  const pool = getPool();

  const [refRows] = await pool.query(
    `
      SELECT latitude, longitude
      FROM trees
      WHERE tree_id = ?
      LIMIT 1
    `,
    [treeId]
  );

  const ref = refRows[0];
  if (!ref || ref.latitude == null || ref.longitude == null) {
    return [];
  }

  const [rows] = await pool.query(
    `
      SELECT
        t.tree_id,
        t.common_name,
        t.botanical_name,
        t.family,
        t.area,
        COALESCE(
          (
            SELECT ti.image_url
            FROM tree_images ti
            WHERE ti.tree_id = t.tree_id
            ORDER BY ti.is_primary DESC, ti.id ASC
            LIMIT 1
          ),
          t.image_link
        ) AS image_link,
        ROUND(
          ST_Distance_Sphere(
            POINT(t.longitude, t.latitude),
            POINT(?, ?)
          )
        ) AS distance_m
      FROM trees t
      WHERE t.tree_id != ?
        AND t.latitude IS NOT NULL
        AND t.longitude IS NOT NULL
        AND ST_Distance_Sphere(
          POINT(t.longitude, t.latitude),
          POINT(?, ?)
        ) < ?
      ORDER BY distance_m ASC
      LIMIT 5
    `,
    [
      ref.longitude,
      ref.latitude,
      treeId,
      ref.longitude,
      ref.latitude,
      radiusMeters
    ]
  );

  return rows;
};

const updateLocation = async (id, latitude, longitude) => {
  const pool = getPool();

  const [result] = await pool.query(
    `
      UPDATE trees
      SET latitude = ?, longitude = ?
      WHERE tree_id = ?
    `,
    [latitude, longitude, id]
  );

  if (result.affectedRows === 0) {
    return null;
  }

  const [rows] = await pool.query(
    `SELECT tree_id, latitude, longitude
     FROM trees
     WHERE tree_id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
};

// ── Added Stats & Helper Queries (Mirrors Postgres Repo) ──

const getStats = async () => {
  const pool = getPool();
  const [[trees]] = await pool.query('SELECT COUNT(*) as count FROM trees');
  const [[species]] = await pool.query('SELECT COUNT(*) as count FROM species');
  const [[areas]] = await pool.query('SELECT COUNT(*) as count FROM areas');

  return {
    trees: parseInt(trees.count, 10),
    species: parseInt(species.count, 10),
    areas: parseInt(areas.count, 10),
  };
};

const getDetailedStats = async () => {
  const pool = getPool();
  const [byArea] = await pool.query('SELECT area, COUNT(*) as count FROM trees GROUP BY area ORDER BY count DESC');
  const [byFamily] = await pool.query('SELECT family, COUNT(*) as count FROM trees WHERE family IS NOT NULL GROUP BY family ORDER BY count DESC LIMIT 10');
  const [nativeExotic] = await pool.query('SELECT native_exotic, COUNT(*) as count FROM species WHERE native_exotic IS NOT NULL GROUP BY native_exotic');
  const [conservation] = await pool.query('SELECT conservation_status, COUNT(*) as count FROM species WHERE conservation_status IS NOT NULL GROUP BY conservation_status ORDER BY count DESC');

  return {
    byArea: byArea.map(r => ({ ...r, count: parseInt(r.count, 10) })),
    byFamily: byFamily.map(r => ({ ...r, count: parseInt(r.count, 10) })),
    nativeExotic: nativeExotic.map(r => ({ ...r, count: parseInt(r.count, 10) })),
    conservation: conservation.map(r => ({ ...r, count: parseInt(r.count, 10) })),
  };
};

const getGallery = async () => {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT ti.image_url, ti.caption, ti.is_primary,
           t.tree_id, t.common_name, t.botanical_name, t.area
    FROM tree_images ti
    JOIN trees t ON ti.tree_id = t.tree_id
    ORDER BY ti.is_primary DESC, ti.id ASC
  `);
  return rows;
};

const recordView = async (path = '/') => {
  const pool = getPool();
  await pool.query('INSERT INTO page_views (path) VALUES (?)', [path]);
  const [[row]] = await pool.query('SELECT COUNT(*) as count FROM page_views');
  return parseInt(row.count, 10);
};

const getViewCount = async () => {
  const pool = getPool();
  const [[row]] = await pool.query('SELECT COUNT(*) as count FROM page_views');
  return parseInt(row.count, 10);
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  getNearby,
  updateLocation,
  getStats,
  getDetailedStats,
  getGallery,
  recordView,
  getViewCount
};