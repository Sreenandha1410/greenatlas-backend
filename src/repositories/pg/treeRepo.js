const { getPool } = require('../../config/db');

const getAll = async ({ search, area, family } = {}) => {
  const pool = getPool();

  let query = `
    SELECT DISTINCT ON (t.tree_id)
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
        a.area_code,
        t.image_link,
        s.flora_type
    FROM trees t
    LEFT JOIN species s
      ON t.botanical_name = (s.genus || ' ' || s.species)
    LEFT JOIN areas a
      ON t.area = a.area
    WHERE 1=1
  `;

  const params = [];

  if (search) {
    params.push(`%${search}%`);

    query += ` AND (
      t.common_name    ILIKE $${params.length} OR
      t.botanical_name ILIKE $${params.length} OR
      t.area           ILIKE $${params.length} OR
      t.family         ILIKE $${params.length} OR
      t.tree_id        ILIKE $${params.length} OR
      s.tamil_name     ILIKE $${params.length}
    )`;
  }

  if (area) {
    params.push(area);
    query += ` AND t.area = $${params.length}`;
  }

  if (family) {
    params.push(family);
    query += ` AND t.family = $${params.length}`;
  }

  const { rows } = await pool.query(query, params);

  return rows;
};


const getById = async (id) => {
  const pool = getPool();

  const { rows } = await pool.query(`
    SELECT DISTINCT ON (t.tree_id)
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

        -- O₂ / CO₂ daily data
        s.o2_produced_daily,
        s.co2_absorbed_daily,

        a.area_code,
        t.image_link
    FROM trees t
    LEFT JOIN species s
      ON t.botanical_name = (s.genus || ' ' || s.species)
    LEFT JOIN areas a
      ON t.area = a.area
    WHERE t.tree_id = $1
    ORDER BY t.tree_id
  `, [id]);

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

  const { rows } = await pool.query(`
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
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [
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
  ]);

  return rows[0];
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

  const { rows } = await pool.query(`
    UPDATE trees SET
      botanical_name=$1,
      common_name=$2,
      family=$3,
      area=$4,
      latitude=$5,
      longitude=$6,
      age=$7,
      notes=$8,
      image_link=$9
    WHERE tree_id=$10
    RETURNING *
  `, [
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
  ]);

  return rows[0];
};


// Update only the geographical coordinates of a tree
const updateLocation = async (id, latitude, longitude) => {
  const pool = getPool();

  const { rows } = await pool.query(
    `UPDATE trees
     SET latitude = $1, longitude = $2
     WHERE tree_id = $3
     RETURNING tree_id, latitude, longitude`,
    [latitude, longitude, id]
  );

  return rows[0] || null;
};


const remove = async (id) => {
  await getPool().query(
    'DELETE FROM trees WHERE tree_id=$1',
    [id]
  );
};


const getNearby = async (treeId, radiusMeters = 100) => {
  const pool = getPool();

  const { rows: [ref] } = await pool.query(
    'SELECT latitude, longitude FROM trees WHERE tree_id = $1',
    [treeId]
  );

  if (!ref) return [];

  const { rows } = await pool.query(`
    SELECT DISTINCT ON (t.tree_id)
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
             (point(t.longitude, t.latitude) <@> point($1, $2)) * 1609.34
           ) AS distance_m
    FROM trees t
    WHERE t.tree_id != $3
      AND (
        point(t.longitude, t.latitude) <@> point($1, $2)
      ) * 1609.34 < $4
    ORDER BY t.tree_id, distance_m
    LIMIT 5
  `, [
    ref.longitude,
    ref.latitude,
    treeId,
    radiusMeters
  ]);

  return rows;
};

const getStats = async () => {
  const pool = getPool();
  const [trees, species, areas] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM trees'),
    pool.query('SELECT COUNT(*) FROM species'),
    pool.query('SELECT COUNT(*) FROM areas'),
  ]);
  return {
    trees: parseInt(trees.rows[0].count),
    species: parseInt(species.rows[0].count),
    areas: parseInt(areas.rows[0].count),
  };
};

const getDetailedStats = async () => {
  const pool = getPool();
  const [byArea, byFamily, nativeExotic, conservation] = await Promise.all([
    pool.query('SELECT area, COUNT(*) as count FROM trees GROUP BY area ORDER BY count DESC'),
    pool.query('SELECT family, COUNT(*) as count FROM trees WHERE family IS NOT NULL GROUP BY family ORDER BY count DESC LIMIT 10'),
    pool.query('SELECT native_exotic, COUNT(*) as count FROM species WHERE native_exotic IS NOT NULL GROUP BY native_exotic'),
    pool.query('SELECT conservation_status, COUNT(*) as count FROM species WHERE conservation_status IS NOT NULL GROUP BY conservation_status ORDER BY count DESC'),
  ]);
  return {
    byArea: byArea.rows.map(r => ({ ...r, count: parseInt(r.count) })),
    byFamily: byFamily.rows.map(r => ({ ...r, count: parseInt(r.count) })),
    nativeExotic: nativeExotic.rows.map(r => ({ ...r, count: parseInt(r.count) })),
    conservation: conservation.rows.map(r => ({ ...r, count: parseInt(r.count) })),
  };
};

const getGallery = async () => {
  const pool = getPool();
  const { rows } = await pool.query(`
    SELECT ti.image_url, ti.caption, ti.is_primary,
           t.tree_id, t.common_name, t.botanical_name, t.area
    FROM tree_images ti
    JOIN trees t ON ti.tree_id = t.tree_id
    ORDER BY ti.is_primary DESC, ti.id ASC
  `);
  return rows;
};

const recordView = async (data = {}) => {
  const pool = getPool();
  const path = typeof data === 'string' ? data : (data.path || '/');
  const device_type = data.device_type || 'desktop';
  const browser = data.browser || 'Unknown';
  const os = data.os || 'Unknown';
  const source = data.source || 'web';
  try {
    await pool.query(
      `INSERT INTO page_views (path, device_type, browser, os, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [path, device_type, browser, os, source]
    );
  } catch (err) {
    // Safe fallback if migration was not run yet
    await pool.query('INSERT INTO page_views (path) VALUES ($1)', [path]);
  }
  const { rows } = await pool.query('SELECT COUNT(*) FROM page_views');
  return parseInt(rows[0].count, 10);
};

const getViewCount = async () => {
  const pool = getPool();
  const { rows } = await pool.query('SELECT COUNT(*) FROM page_views');
  return parseInt(rows[0].count);
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  updateLocation,
  remove,
  getNearby,
  getStats,
  getDetailedStats,
  getGallery,
  recordView,
  getViewCount
};
